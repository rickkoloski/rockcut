defmodule RockcutApi.TaskShiftEndReminderTest do
  @moduledoc """
  D40 shift-end reminder (D38 spec §3.5, S32–S37a): an hour before a
  published Brewery shift ends, its assignee hears what's still open on the
  Brewery board that day. The clock is injected (`Reminders.run_shift_end/1`);
  every instant is a Colorado wall-clock time on today's Colorado date.
  """
  use RockcutApi.DataCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.SchedulingFixtures

  alias RockcutApi.{Notifications, Reminders, Repo, Tasks}
  alias RockcutApi.Reminders.TaskReminder
  alias RockcutApi.Scheduling.Recurrence

  setup do
    p = personas(~w(breweryMgr brewer1 brewer2 bartender1))
    brewery = RockcutApi.TaskFixtures.task_board("brewery")
    %{p: p, brewery: brewery, day: Tasks.today(), depts: departments()}
  end

  # Today's Colorado wall-clock time, as a UTC instant.
  defp at(day, hh, mm), do: Recurrence.local_to_utc(day, Time.new!(hh, mm, 0))

  defp shift(depts, who, day, {h1, m1}, {h2, m2}, attrs \\ %{}) do
    shift_fixture(
      Map.merge(
        %{
          department: depts["brewery"],
          status: "published",
          assignee_id: who.id,
          starts_at: at(day, h1, m1),
          ends_at: at(day, h2, m2)
        },
        attrs
      )
    )
  end

  defp task(brewery, by, title, day, assignee \\ nil) do
    {:ok, t} =
      Tasks.create(
        brewery,
        %{
          "title" => title,
          "due_on" => Date.to_iso8601(day),
          "assignee_id" => assignee && assignee.id
        },
        by
      )

    t
  end

  defp tick(brewery, day, name, by) do
    item = Enum.find(Tasks.list_items(brewery), &(&1.name == name))
    {:ok, _} = Tasks.tick(brewery, Date.to_iso8601(day), item, by, day)
  end

  # Oldest first (two can share a second).
  defp reminders(user),
    do:
      Notifications.list(user)
      |> Enum.filter(&(&1.event == "task_shift_end"))
      |> Enum.sort_by(& &1.id)

  defp initials(name),
    do: name |> String.split() |> then(&[hd(&1), List.last(&1)]) |> Enum.map_join(&String.first/1)

  test "S32: one reminder between 2:00 and 2:05 for a 7a–3p shift, the brewer's tasks first", %{
    p: p,
    brewery: brewery,
    day: day,
    depts: depts
  } do
    b1 = p["brewer1"]
    shift(depts, b1, day, {7, 0}, {15, 0})

    # Board order: brewer2's, unassigned, brewer1's ×2, a finished one.
    task(brewery, b1, "Package FV6", day, p["brewer2"])
    task(brewery, b1, "Keg Wash", day)
    task(brewery, b1, "Carb FV3", day, b1)
    task(brewery, b1, "Dry hop FV2", day, b1)
    done = task(brewery, b1, "Clean brite", day, b1)
    {:ok, _} = Tasks.complete(brewery, done, nil, b1, day)
    # Another day's and the Future list's tasks aren't listed (S23h).
    task(brewery, b1, "Tomorrow's", Date.add(day, 1), b1)
    {:ok, _} = Tasks.create(brewery, %{"title" => "Gas order"}, b1)
    tick(brewery, day, "Temps", b1)
    tick(brewery, day, "Pressures", b1)

    # 1:59p: too early.
    assert Reminders.run_shift_end(at(day, 13, 59)) == 0
    assert reminders(b1) == []

    assert Reminders.run_shift_end(at(day, 14, 2)) == 1

    assert [n] = reminders(b1)
    assert n.title == "Still open today: 4 tasks, Daily 2/4"

    assert n.body ==
             "Carb FV3, Dry hop FV2, Keg Wash, +1 more"

    assert n.data["url"] == "/tasks/brewery?day=#{Date.to_iso8601(day)}"

    # Push and the bell, never email; on by default.
    assert Notifications.enabled?(b1, :task_shift_end, :push)
    assert Notifications.enabled?(b1, :task_shift_end, :in_app)
    refute Notifications.enabled?(b1, :task_shift_end, :email)

    # The next scan doesn't send it again.
    assert Reminders.run_shift_end(at(day, 14, 7)) == 0
    assert length(reminders(b1)) == 1
  end

  test "S32: other people's tasks carry their initials", %{
    p: p,
    brewery: brewery,
    day: day,
    depts: depts
  } do
    b1 = p["brewer1"]
    shift(depts, b1, day, {7, 0}, {15, 0})
    task(brewery, b1, "Package FV6", day, p["brewer2"])

    assert Reminders.run_shift_end(at(day, 14, 0)) == 1
    [n] = reminders(b1)
    assert n.body == "Package FV6 (#{initials(p["brewer2"].name)})"
    assert n.title =~ ~r/^Still open today: 1 task, Daily 0\/\d$/
  end

  test "S33: everything done by 2:00p → no notification, and the shift is settled", %{
    p: p,
    brewery: brewery,
    day: day,
    depts: depts
  } do
    b1 = p["brewer1"]
    s = shift(depts, b1, day, {7, 0}, {15, 0})
    t = task(brewery, b1, "Keg Wash", day, b1)
    {:ok, _} = Tasks.complete(brewery, t, nil, b1, day)
    for item <- Tasks.list_items(brewery), do: tick(brewery, day, item.name, b1)

    assert Reminders.run_shift_end(at(day, 14, 0)) == 0
    assert reminders(b1) == []
    assert Repo.get_by(TaskReminder, shift_id: s.id)
  end

  test "S34: the shift extended to 4p after the reminder → no second one", %{
    p: p,
    brewery: brewery,
    day: day,
    depts: depts
  } do
    b1 = p["brewer1"]
    s = shift(depts, b1, day, {7, 0}, {15, 0})
    task(brewery, b1, "Keg Wash", day, b1)

    assert Reminders.run_shift_end(at(day, 14, 0)) == 1
    s |> Ecto.Changeset.change(ends_at: at(day, 16, 0)) |> Repo.update!()

    assert Reminders.run_shift_end(at(day, 15, 0)) == 0
    assert length(reminders(b1)) == 1
  end

  test "S35: the person turned the reminder off → nothing at the next shift end", %{
    p: p,
    brewery: brewery,
    day: day,
    depts: depts
  } do
    b1 = p["brewer1"]

    {:ok, _} =
      Notifications.update_prefs(b1, %{
        "task_shift_end" => %{"in_app" => false, "push" => false}
      })

    b1 = RockcutApi.Accounts.get_user!(b1.id)
    shift(depts, b1, day, {7, 0}, {15, 0})
    task(brewery, b1, "Keg Wash", day, b1)

    Reminders.run_shift_end(at(day, 14, 0))
    assert reminders(b1) == []
    refute Notifications.enabled?(b1, :task_shift_end, :push)
  end

  test "S36: a 45-minute shift → no reminder", %{p: p, brewery: brewery, day: day, depts: depts} do
    b2 = p["brewer2"]
    shift(depts, b2, day, {14, 0}, {14, 45})
    task(brewery, b2, "Keg Wash", day, b2)

    for {h, m} <- [{13, 45}, {13, 50}, {13, 55}],
        do: assert(Reminders.run_shift_end(at(day, h, m)) == 0)

    assert reminders(b2) == []
  end

  test "S36: unpublished or unassigned shifts → no reminder", %{
    p: p,
    brewery: brewery,
    day: day,
    depts: depts
  } do
    b2 = p["brewer2"]
    shift(depts, b2, day, {7, 0}, {15, 0}, %{status: "draft"})
    shift(depts, b2, day, {7, 0}, {15, 0}, %{assignee_id: nil})
    task(brewery, b2, "Keg Wash", day)

    assert Reminders.run_shift_end(at(day, 14, 0)) == 0
    assert Repo.all(TaskReminder) == []
  end

  test "S37: a Taproom shift ending → nothing new", %{
    p: p,
    brewery: brewery,
    day: day,
    depts: depts
  } do
    b = p["bartender1"]
    shift(depts, b, day, {7, 0}, {15, 0}, %{department: depts["bar"]})
    task(brewery, p["brewer1"], "Keg Wash", day)

    assert Reminders.run_shift_end(at(day, 14, 0)) == 0
    assert reminders(b) == []
  end

  test "S37a: two shifts, one reminder before each ends, each with what's open then", %{
    p: p,
    brewery: brewery,
    day: day,
    depts: depts
  } do
    b2 = p["brewer2"]
    shift(depts, b2, day, {6, 0}, {10, 0})
    shift(depts, b2, day, {14, 0}, {18, 0})
    keg = task(brewery, b2, "Keg Wash", day, b2)
    task(brewery, b2, "Carb FV3", day, b2)

    assert Reminders.run_shift_end(at(day, 9, 0)) == 1
    {:ok, _} = Tasks.complete(brewery, keg, nil, b2, day)

    # Nothing between the two windows.
    assert Reminders.run_shift_end(at(day, 12, 0)) == 0
    assert Reminders.run_shift_end(at(day, 17, 0)) == 1

    [early, late] = reminders(b2)
    assert early.title =~ "2 tasks"
    assert early.body == "Keg Wash, Carb FV3"
    assert late.title =~ "1 task,"
    assert late.body == "Carb FV3"
  end

  test "a scan that runs late still finds the shift once (the 10-minute window)", %{
    p: p,
    brewery: brewery,
    day: day,
    depts: depts
  } do
    b1 = p["brewer1"]
    shift(depts, b1, day, {7, 0}, {15, 0})
    task(brewery, b1, "Keg Wash", day, b1)

    # The 2:00 scan never ran; 2:07 (53 minutes before the end) picks it up.
    assert Reminders.run_shift_end(at(day, 14, 7)) == 1
    # 2:11 is past the window: nothing, and no resend anyway.
    assert Reminders.run_shift_end(at(day, 14, 11)) == 0
    assert length(reminders(b1)) == 1
  end

  test "only Daily checks open → the body names them", %{
    p: p,
    brewery: brewery,
    day: day,
    depts: depts
  } do
    b1 = p["brewer1"]
    shift(depts, b1, day, {7, 0}, {15, 0})
    names = Tasks.list_items(brewery) |> Enum.map(& &1.name)
    [first | rest] = names
    tick(brewery, day, first, b1)

    assert Reminders.run_shift_end(at(day, 14, 0)) == 1
    [n] = reminders(b1)
    assert n.title == "Still open today: Daily 1/#{length(names)}"
    assert n.body == "Daily: " <> Enum.join(rest, ", ")
  end
end
