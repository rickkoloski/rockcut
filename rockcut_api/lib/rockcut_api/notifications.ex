defmodule RockcutApi.Notifications do
  @moduledoc """
  Notification core: dispatch an event to a recipient over the channels they've
  enabled. Ships in-app + email; SMS/push register later. Delivery is
  best-effort and never breaks the triggering request.
  """
  import Ecto.Query
  require Logger
  alias RockcutApi.{Repo, Mailer}
  alias RockcutApi.Accounts.{User, Membership}
  alias RockcutApi.Notifications.{Notification, Email, WebPush}

  @channels [:in_app, :email, :push]
  # push (web push) is opt-in (default off) — it also needs a device subscription.
  # The channel key is "push" to match the frontend preferences UI.
  @default_on %{in_app: true, email: true}
  # Per-event default overrides. message_posted (D23) skips the bell by default
  # (unread badges cover in-app) but emails; push stays opt-in like everywhere.
  # calendar_feed_rotated (D35 Q3): in-app and push, no email. Push still needs
  # a device subscription. The UI's EVENT_DEFAULTS must match.
  @event_defaults %{
    "message_posted" => %{in_app: false, email: true, push: false},
    "calendar_feed_rotated" => %{in_app: true, email: false, push: true},
    # D40 shift-end reminder (D38 spec §3.5): push and the bell, never email.
    "task_shift_end" => %{in_app: true, email: false, push: true}
  }

  ## Dispatch

  @doc "Deliver `event` to `user` over each enabled channel. Payload: %{title, body, data}."
  def notify(%User{} = user, event, payload) do
    Enum.each(@channels, fn channel ->
      if enabled?(user, event, channel), do: deliver(channel, user, event, payload)
    end)

    :ok
  end

  def enabled?(%User{} = user, event, channel) do
    prefs = user.notification_prefs || %{}

    case get_in(prefs, [to_string(event), to_string(channel)]) do
      nil -> default_on(to_string(event), channel)
      value -> value == true
    end
  end

  defp default_on(event, channel) do
    case Map.get(@event_defaults, event) do
      nil -> Map.get(@default_on, channel, false)
      overrides -> Map.get(overrides, channel, false)
    end
  end

  defp deliver(:in_app, user, event, payload) do
    %Notification{}
    |> Notification.changeset(%{
      user_id: user.id,
      event: to_string(event),
      title: payload.title,
      body: payload[:body],
      data: payload[:data] || %{}
    })
    |> Repo.insert()
  end

  defp deliver(:email, user, event, payload) do
    background(fn ->
      try do
        Email.build(user, event, payload) |> Mailer.deliver()
      rescue
        e -> Logger.error("notification email failed: #{inspect(e)}")
      end
    end)
  end

  defp deliver(:push, user, _event, payload) do
    background(fn -> WebPush.deliver(user, payload) end)
  end

  # Email and push never hold up the request. Tests run them inline
  # (`async_delivery: false`): a push task reads subscriptions, and one that
  # outlived its test broke the sandboxed database for the next (D35).
  defp background(fun) do
    if Application.get_env(:rockcut_api, :async_delivery, true),
      do: Task.start(fun),
      else: fun.()
  end

  ## Inbox

  def list(%User{} = user, limit \\ 50) do
    Notification
    |> where(user_id: ^user.id)
    |> order_by(desc: :inserted_at)
    |> limit(^limit)
    |> Repo.all()
  end

  def unread_count(%User{} = user) do
    Notification
    |> where([n], n.user_id == ^user.id and is_nil(n.read_at))
    |> Repo.aggregate(:count)
  end

  def mark_read(%User{} = user, id) do
    from(n in Notification, where: n.id == ^id and n.user_id == ^user.id)
    |> Repo.update_all(set: [read_at: now()])

    :ok
  end

  def mark_all_read(%User{} = user) do
    from(n in Notification, where: n.user_id == ^user.id and is_nil(n.read_at))
    |> Repo.update_all(set: [read_at: now()])

    :ok
  end

  ## Preferences

  def get_prefs(%User{} = user), do: user.notification_prefs || %{}

  def update_prefs(%User{} = user, prefs) when is_map(prefs) do
    user |> Ecto.Changeset.change(notification_prefs: prefs) |> Repo.update()
  end

  ## Event helpers (called from Scheduling) — never raise.

  def shift_published(shift), do: shifts_published([shift])

  @doc """
  Publish notifications for a batch of shifts, coalesced so each recipient gets a
  single notification (e.g. "Publish week" → one push per employee, not one per
  shift). Assigned shifts group by assignee; open shifts group by department.
  """
  def shifts_published(shifts) when is_list(shifts) do
    safe(fn ->
      shifts = Repo.preload(shifts, [:department, :position, :assignee])
      {assigned, open} = Enum.split_with(shifts, & &1.assignee_id)

      # Assigned: one notification per assignee.
      assigned
      |> Enum.group_by(& &1.assignee_id)
      |> Enum.each(fn {_assignee_id, group} ->
        notify(hd(group).assignee, :shift_scheduled, summarize(:shift_scheduled, group))
      end)

      # Open: one notification per department, delivered to its members.
      open
      |> Enum.group_by(& &1.department_id)
      |> Enum.each(fn {dept_id, group} ->
        payload = summarize(:open_shift, group)
        for u <- department_members(dept_id), do: notify(u, :open_shift, payload)
      end)
    end)
  end

  # One shift → the detailed single-shift payload; many → a coalesced summary.
  defp summarize(:shift_scheduled, [shift]),
    do: %{title: "You've been scheduled", body: shift_body(shift), data: shift_data(shift)}

  defp summarize(:open_shift, [shift]),
    do: %{title: "Open shift available", body: shift_body(shift), data: shift_data(shift)}

  defp summarize(:shift_scheduled, shifts),
    do: %{
      title: "#{length(shifts)} shifts scheduled",
      body: "Check your schedule",
      data: %{"shift_ids" => Enum.map(shifts, & &1.id)}
    }

  defp summarize(:open_shift, shifts),
    do: %{
      title: "#{length(shifts)} open shifts available",
      body: "Tap to view open shifts",
      data: %{"shift_ids" => Enum.map(shifts, & &1.id)}
    }

  @doc "A (published) shift was assigned to `assignee` — they've been scheduled."
  def shift_scheduled(shift, %User{} = assignee) do
    safe(fn ->
      shift = Repo.preload(shift, [:department, :position])

      notify(assignee, :shift_scheduled, %{
        title: "You've been scheduled",
        body: shift_body(shift),
        data: shift_data(shift)
      })
    end)
  end

  @doc "A published shift the `assignee` is on changed (e.g. its time)."
  def shift_changed(shift, %User{} = assignee) do
    safe(fn ->
      shift = Repo.preload(shift, [:department, :position])

      notify(assignee, :shift_changed, %{
        title: "Your schedule has changed",
        body: shift_body(shift),
        data: shift_data(shift)
      })
    end)
  end

  @doc "Reminder to the assignee that a published shift is starting soon (D22)."
  def shift_reminder(shift) do
    safe(fn ->
      shift = Repo.preload(shift, [:department, :position, :assignee])

      if shift.assignee do
        notify(shift.assignee, :shift_reminder, %{
          title: "Shift reminder",
          body: shift_body(shift),
          data: shift_data(shift)
        })
      end
    end)
  end

  @doc """
  The shift-end reminder (D40, D38 spec §3.5): what's still open on the
  Brewery board on `day` (`Tasks.open_work/4`), for the shift's assignee.
  Title "Still open today: 3 tasks, Daily 2/4"; the body lists up to three
  task titles (other people's with their initials), then "+N more". Tapping
  it opens the board on that day.
  """
  def task_shift_end(%User{} = user, %Date{} = day, %{tasks: tasks, daily: daily}) do
    safe(fn ->
      notify(user, :task_shift_end, %{
        title: "Still open today: " <> Enum.join(shift_end_counts(tasks, daily), ", "),
        body: shift_end_body(user, tasks, daily),
        data: %{
          "url" => "/tasks/brewery?day=#{Date.to_iso8601(day)}",
          "day" => Date.to_iso8601(day),
          "open_tasks" => length(tasks)
        }
      })
    end)
  end

  defp shift_end_counts(tasks, daily) do
    tasks_part =
      case length(tasks) do
        0 -> []
        1 -> ["1 task"]
        n -> ["#{n} tasks"]
      end

    daily_part = if daily.unticked == [], do: [], else: ["Daily #{daily.done}/#{daily.total}"]
    tasks_part ++ daily_part
  end

  @shift_end_titles 3

  defp shift_end_body(_user, [], daily), do: "Daily: " <> Enum.join(daily.unticked, ", ")

  defp shift_end_body(user, tasks, _daily) do
    shown =
      tasks
      |> Enum.take(@shift_end_titles)
      |> Enum.map(fn t ->
        if t.assignee_id && t.assignee_id != user.id,
          do: "#{t.title} (#{initials(t.assignee && t.assignee.name)})",
          else: t.title
      end)

    more = length(tasks) - @shift_end_titles
    Enum.join(shown ++ if(more > 0, do: ["+#{more} more"], else: []), ", ")
  end

  # "JB" for "Jake Brewer", as the board's cards show them (UI `initials`).
  defp initials(nil), do: ""

  defp initials(name) do
    parts = String.split(String.trim(name))

    [List.first(parts), if(length(parts) > 1, do: List.last(parts))]
    |> Enum.reject(&is_nil/1)
    |> Enum.map_join(&String.first/1)
    |> String.upcase()
  end

  ## Internal

  defp department_members(dept_id) do
    from(u in User,
      join: m in Membership,
      on: m.user_id == u.id,
      where: m.department_id == ^dept_id and u.active == true,
      distinct: true
    )
    |> Repo.all()
  end

  defp shift_body(shift) do
    pos = shift.position && shift.position.name
    dept = shift.department && shift.department.name
    [pos, dept] |> Enum.reject(&is_nil/1) |> Enum.join(" — ")
  end

  defp shift_data(shift) do
    %{
      "shift_id" => shift.id,
      "starts_at" => shift.starts_at,
      "ends_at" => shift.ends_at,
      "position" => shift.position && shift.position.name,
      "department" => shift.department && shift.department.name
    }
  end

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second)

  defp safe(fun) do
    try do
      fun.()
      :ok
    rescue
      e ->
        Logger.error("notification dispatch failed: #{inspect(e)}")
        :ok
    end
  end
end
