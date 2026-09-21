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
    if can_manage_feed?(actor, subject_type, subject_id) do
      feed = ensure_feed(subject_type, subject_id, actor)
      feed |> Ecto.Changeset.change(token: new_token()) |> Repo.update()
    else
      {:error, :forbidden}
    end
  end

  defp entitlements(%User{} = user) do
    departments =
      if user.is_owner do
        Accounts.list_departments()
      else
        user.memberships
        |> Enum.filter(&(&1.role == "manager"))
        |> Enum.map(& &1.department)
        |> Enum.reject(&is_nil/1)
      end

    dept_entries = Enum.map(departments, fn d -> {"department", d.id, d.name} end)
    all_entry = if user.is_owner, do: [{"all", nil, "Whole schedule"}], else: []

    [{"user", user.id, "My shifts"}] ++ dept_entries ++ all_entry
  end

  defp can_manage_feed?(%User{} = actor, "user", sid), do: actor.id == sid or actor.is_owner

  defp can_manage_feed?(%User{} = actor, "department", sid),
    do: Authz.role_in(actor, sid) in [:owner, :manager]

  defp can_manage_feed?(%User{} = actor, "all", _), do: actor.is_owner
  defp can_manage_feed?(_actor, _type, _sid), do: false

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
