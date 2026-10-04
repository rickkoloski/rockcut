defmodule RockcutApi.CalendarFeeds do
  @moduledoc """
  ICS calendar feeds for Google/Apple/Outlook subscription. A feed is a secret
  token scoped to a user, a department, or the whole schedule. The public
  endpoint renders published shifts + approved time-off as an iCalendar file.
  Times are emitted in UTC (`…Z`); calendar apps localize them.
  """
  import Ecto.Query
  alias RockcutApi.Repo
  alias RockcutApi.{Authz, Accounts}
  alias RockcutApi.Accounts.{User, Membership}
  alias RockcutApi.Scheduling.Shift
  alias RockcutApi.TimeOff.Request, as: TimeOffReq
  alias RockcutApi.CalendarFeeds.Feed

  @type_labels %{
    "pto" => "Vacation",
    "sick" => "Sick",
    "unpaid" => "Unpaid",
    "personal" => "Personal"
  }

  ## Feeds

  def get_feed_by_token(token) when is_binary(token), do: Repo.get_by(Feed, token: token)

  @doc "The feeds a user is entitled to (lazily created so tokens stay stable)."
  def feeds_for(%User{} = user) do
    user
    |> entitlements()
    |> Enum.map(fn {subject_type, subject_id, label} ->
      feed = ensure_feed(subject_type, subject_id, user)
      %{subject_type: subject_type, subject_id: subject_id, label: label, token: feed.token}
    end)
  end

  def rotate(subject_type, subject_id, %User{} = actor) do
    if Authz.can?(actor, :rotate, {:calendar_feed, subject_type, subject_id}) do
      feed = ensure_feed(subject_type, subject_id, actor)
      feed |> Ecto.Changeset.change(token: new_token()) |> Repo.update()
    else
      {:error, :forbidden}
    end
  end

  ## Rotation when someone leaves or loses access (D35)

  @doc """
  The shared feeds `user` gets the URL of: `{"department", id}` for each
  department feed, and `{"all", nil}` for the whole schedule. The same rule
  as `feeds_for/1`. A personal feed is never shared.
  """
  def shared_feeds(%User{} = user) do
    user
    |> entitlements()
    |> Enum.reject(fn {type, _, _} -> type == "user" end)
    |> Enum.map(fn {type, id, _label} -> {type, id} end)
  end

  @doc """
  Give a new token to every feed in `lost` that exists, and to `person`'s own
  feed when `own?` (they left). No `Authz` check: the system does this when
  `actor` deactivates someone or takes their access away. Audited without
  tokens. Returns the rotated shared feeds, for `notify_rotated/3`.
  """
  def rotate_lost(%User{} = person, lost, own?, reason, %User{} = actor) do
    shared = lost |> Enum.uniq() |> Enum.map(fn {type, id} -> find_feed(type, id) end)
    own = if own?, do: [find_feed("user", person.id)], else: []
    feeds = Enum.reject(shared ++ own, &is_nil/1)

    Enum.each(feeds, fn feed ->
      feed |> Ecto.Changeset.change(token: new_token()) |> Repo.update!()
    end)

    if feeds != [] do
      Accounts.record_audit(actor.id, person.id, "calendar_feeds.rotated", %{
        "reason" => to_string(reason),
        "feeds" => Enum.map(feeds, &%{"type" => &1.subject_type, "id" => &1.subject_id})
      })
    end

    feeds
    |> Enum.reject(&(&1.subject_type == "user"))
    |> Enum.map(&{&1.subject_type, &1.subject_id})
  end

  @doc """
  Tell everyone who still gets a rotated shared feed's URL to re-subscribe:
  one notification per person, listing their feeds (spec §3.2). Call after
  the transaction commits. `reason` is `:departed` or `:lost_access`.
  """
  def notify_rotated([], _reason, _except_id), do: :ok

  def notify_rotated(rotated, reason, except_id) do
    rotated = MapSet.new(rotated)

    Accounts.persons_query()
    |> where([u], u.active == true and u.id != ^except_id)
    |> Repo.all()
    |> Repo.preload(memberships: :department)
    |> Enum.each(fn user ->
      case user |> shared_feeds() |> Enum.filter(&MapSet.member?(rotated, &1)) do
        [] ->
          :ok

        mine ->
          RockcutApi.Notifications.notify(user, :calendar_feed_rotated, payload(mine, reason))
      end
    end)
  end

  defp payload(feeds, reason) do
    why =
      case reason do
        :departed -> "someone who could see them no longer works here"
        :lost_access -> "someone who could see them no longer has access to them"
      end

    %{
      title: "Re-subscribe to your Rockcut calendar",
      body:
        "The link for #{feeds |> Enum.map(&feed_label/1) |> join_names()} changed because #{why}. " <>
          "If you subscribed to these in Google, Apple or Outlook Calendar, remove the old " <>
          "calendar and add the new link from Schedule → Calendar sync.",
      data: %{"url" => "/schedule?calendar_sync=1"}
    }
  end

  defp feed_label({"all", _}), do: "Whole schedule"

  defp feed_label({"department", id}) do
    case Repo.get(RockcutApi.Accounts.Department, id) do
      nil -> "a department"
      dept -> dept.name
    end
  end

  defp join_names([one]), do: one
  defp join_names(names), do: Enum.join(Enum.drop(names, -1), ", ") <> " and " <> List.last(names)

  defp entitlements(%User{} = user) do
    departments =
      case Authz.scope(user, :calendar_feeds, :manage) do
        :all -> Accounts.list_departments()
        :none -> []
        {:departments, ids} -> Enum.filter(Accounts.list_departments(), &(&1.id in ids))
      end

    dept_entries = Enum.map(departments, fn d -> {"department", d.id, d.name} end)

    all_entry =
      if Authz.can?(user, :rotate, {:calendar_feed, "all", nil}),
        do: [{"all", nil, "Whole schedule"}],
        else: []

    [{"user", user.id, "My shifts"}] ++ dept_entries ++ all_entry
  end

  defp ensure_feed(subject_type, subject_id, creator) do
    case find_feed(subject_type, subject_id) do
      nil ->
        Repo.insert!(%Feed{
          token: new_token(),
          subject_type: subject_type,
          subject_id: subject_id,
          created_by_id: creator.id
        })

      feed ->
        feed
    end
  end

  defp find_feed("all", _), do: Repo.get_by(Feed, subject_type: "all")
  defp find_feed(type, id), do: Repo.get_by(Feed, subject_type: type, subject_id: id)

  defp new_token, do: :crypto.strong_rand_bytes(18) |> Base.url_encode64(padding: false)

  ## ICS generation

  def ics(%Feed{} = feed) do
    events =
      Enum.map(shifts_for(feed), &shift_event/1) ++
        Enum.map(time_off_for(feed), &time_off_event/1)

    lines =
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Rockcut Brewing//Schedule//EN",
        "CALSCALE:GREGORIAN",
        "X-WR-CALNAME:Rockcut Schedule"
      ] ++ List.flatten(events) ++ ["END:VCALENDAR"]

    Enum.join(lines, "\r\n") <> "\r\n"
  end

  defp shifts_for(%Feed{subject_type: type, subject_id: id}) do
    Shift
    |> where([s], s.status == "published")
    |> scope_shifts(type, id)
    |> preload([:department, :position, :assignee])
    |> Repo.all()
  end

  defp scope_shifts(query, "all", _), do: query
  defp scope_shifts(query, "department", id), do: where(query, [s], s.department_id == ^id)
  defp scope_shifts(query, "user", id), do: where(query, [s], s.assignee_id == ^id)

  defp time_off_for(%Feed{subject_type: type, subject_id: id}) do
    TimeOffReq
    |> where([r], r.status == "approved")
    |> scope_time_off(type, id)
    |> preload([:user])
    |> Repo.all()
  end

  defp scope_time_off(query, "all", _), do: query
  defp scope_time_off(query, "user", id), do: where(query, [r], r.user_id == ^id)

  defp scope_time_off(query, "department", id) do
    member_ids =
      Membership |> where([m], m.department_id == ^id) |> select([m], m.user_id) |> Repo.all()

    where(query, [r], r.user_id in ^member_ids)
  end

  defp shift_event(s) do
    who = person_label(s.assignee) || "Open"

    [
      "BEGIN:VEVENT",
      "UID:shift-#{s.id}@rockcut",
      "DTSTAMP:#{ical_utc(s.updated_at)}",
      "DTSTART:#{ical_utc(s.starts_at)}",
      "DTEND:#{ical_utc(s.ends_at)}",
      "SUMMARY:#{escape("#{s.position && s.position.name} — #{who}")}",
      "LOCATION:#{escape((s.department && s.department.name) || "")}",
      "DESCRIPTION:#{escape(s.notes || "")}",
      "STATUS:CONFIRMED",
      "END:VEVENT"
    ]
  end

  defp time_off_event(r) do
    label = Map.get(@type_labels, r.type, r.type)

    [
      "BEGIN:VEVENT",
      "UID:timeoff-#{r.id}@rockcut",
      "DTSTAMP:#{ical_utc(r.updated_at)}",
      "DTSTART:#{ical_utc(r.starts_at)}",
      "DTEND:#{ical_utc(r.ends_at)}",
      "SUMMARY:#{escape("Time off (#{label}) — #{person_label(r.user) || ""}")}",
      "STATUS:CONFIRMED",
      "END:VEVENT"
    ]
  end

  defp person_label(nil), do: nil
  defp person_label(u), do: u.name || u.email

  defp ical_utc(dt) do
    dt = DateTime.truncate(dt, :second)

    :io_lib.format("~4..0B~2..0B~2..0BT~2..0B~2..0B~2..0BZ", [
      dt.year,
      dt.month,
      dt.day,
      dt.hour,
      dt.minute,
      dt.second
    ])
    |> IO.iodata_to_binary()
  end

  defp escape(text) do
    text
    |> to_string()
    |> String.replace("\\", "\\\\")
    |> String.replace(";", "\\;")
    |> String.replace(",", "\\,")
    |> String.replace("\n", "\\n")
  end
end
