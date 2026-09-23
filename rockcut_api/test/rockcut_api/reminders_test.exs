defmodule RockcutApi.RemindersTest do
  use RockcutApi.DataCase

  alias RockcutApi.{Reminders, Notifications}
  import RockcutApi.AccountsFixtures
  import RockcutApi.SchedulingFixtures

  defp bar, do: department_fixture("bar")

  # A published, assigned shift starting `minutes` from `now`.
  defp shift_in(minutes, now, emp, status \\ "published") do
    start = DateTime.add(now, minutes * 60, :second)
    shift_fixture(%{department: bar(), status: status, assignee_id: emp.id, starts_at: start})
  end

  test "reminds an assignee once for a shift starting within the window" do
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    emp = user_with_role("employee", "bar")
    _shift = shift_in(45, now, emp)

    assert Reminders.run(now) == 1
    assert "shift_reminder" in (Notifications.list(emp) |> Enum.map(& &1.event))

    # A second scan does not re-send.
    assert Reminders.run(now) == 0
    assert Notifications.list(emp) |> Enum.count(&(&1.event == "shift_reminder")) == 1
  end

  test "skips shifts outside the window, drafts, unassigned, and past shifts" do
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    emp = user_with_role("employee", "bar")

    _too_far = shift_in(180, now, emp)
    _draft = shift_in(30, now, emp, "draft")
    _past = shift_in(-30, now, emp)

    unassigned =
      shift_fixture(%{
        department: bar(),
        status: "published",
        assignee_id: nil,
        starts_at: DateTime.add(now, 1800, :second)
      })

    _ = unassigned

    assert Reminders.run(now) == 0
    assert Notifications.list(emp) == []
  end

  test "reminder honors notification preferences" do
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    emp = user_with_role("employee", "bar")
    {:ok, _} = Notifications.update_prefs(emp, %{"shift_reminder" => %{"in_app" => false}})
    emp = RockcutApi.Accounts.get_user!(emp.id)
    _shift = shift_in(30, now, emp)

    assert Reminders.run(now) == 1
    # in-app suppressed by prefs
    assert Notifications.list(emp) == []
  end
end
