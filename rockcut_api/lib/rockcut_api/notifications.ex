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

  @channels [:in_app, :email, :web_push]
  # web_push is opt-in (default off) — it also needs a device subscription.
  @default_on %{in_app: true, email: true}

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
      nil -> Map.get(@default_on, channel, false)
      value -> value == true
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
    Task.start(fn ->
      try do
        Email.build(user, event, payload) |> Mailer.deliver()
      rescue
        e -> Logger.error("notification email failed: #{inspect(e)}")
      end
    end)
  end

  defp deliver(:web_push, user, _event, payload) do
    Task.start(fn -> WebPush.deliver(user, payload) end)
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

  def shift_published(shift) do
    safe(fn ->
      shift = Repo.preload(shift, [:department, :position, :assignee])
      body = shift_body(shift)
      data = shift_data(shift)

      if shift.assignee do
        notify(shift.assignee, :shift_published, %{
          title: "Shift published",
          body: body,
          data: data
        })
      else
        for u <- department_members(shift.department_id) do
          notify(u, :open_shift, %{title: "Open shift available", body: body, data: data})
        end
      end
    end)
  end

  def shift_assigned(shift, %User{} = assignee) do
    safe(fn ->
      shift = Repo.preload(shift, [:department, :position])

      notify(assignee, :shift_assigned, %{
        title: "You've been scheduled",
        body: shift_body(shift),
        data: shift_data(shift)
      })
    end)
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
