defmodule RockcutApi.NotificationsTest do
  use RockcutApi.DataCase

  alias RockcutApi.{Notifications, Scheduling, Accounts}
  import RockcutApi.AccountsFixtures
  import RockcutApi.SchedulingFixtures

  test "publishing an assigned shift notifies the assignee in-app" do
    bar = department_fixture("bar")
    emp = user_with_role("employee", "bar")
    shift = shift_fixture(%{department: bar, status: "draft", assignee_id: emp.id})

    {:ok, _} = Scheduling.publish_shift(shift)

    assert "shift_scheduled" in (Notifications.list(emp) |> Enum.map(& &1.event))
  end

  test "publishing an open shift notifies department members" do
    bar = department_fixture("bar")
    emp = user_with_role("employee", "bar")
    shift = shift_fixture(%{department: bar, status: "draft", assignee_id: nil})

    {:ok, _} = Scheduling.publish_shift(shift)

    assert "open_shift" in (Notifications.list(emp) |> Enum.map(& &1.event))
  end

  test "assigning a published shift notifies the new assignee (scheduled)" do
    bar = department_fixture("bar")
    emp = user_with_role("employee", "bar")
    shift = shift_fixture(%{department: bar, status: "published", assignee_id: nil})

    {:ok, _} = Scheduling.update_shift(shift, %{"assignee_id" => emp.id})

    assert "shift_scheduled" in (Notifications.list(emp) |> Enum.map(& &1.event))
  end

  test "changing the time of a published shift notifies the assignee (changed)" do
    bar = department_fixture("bar")
    emp = user_with_role("employee", "bar")
    shift = shift_fixture(%{department: bar, status: "published", assignee_id: emp.id})

    new_end = DateTime.add(shift.ends_at, 3600, :second) |> DateTime.to_iso8601()
    {:ok, _} = Scheduling.update_shift(shift, %{"ends_at" => new_end})

    events = Notifications.list(emp) |> Enum.map(& &1.event)
    assert "shift_changed" in events
    refute "shift_scheduled" in events
  end

  test "bulk publish sends one coalesced notification per assignee" do
    bar = department_fixture("bar")
    emp = user_with_role("employee", "bar")

    drafts =
      for _ <- 1..3 do
        shift_fixture(%{department: bar, status: "draft", assignee_id: emp.id})
      end

    {:ok, published} = Scheduling.publish_shifts(drafts)
    assert length(published) == 3

    # One notification, not three.
    scheduled_notes = Notifications.list(emp) |> Enum.filter(&(&1.event == "shift_scheduled"))
    assert length(scheduled_notes) == 1
    assert hd(scheduled_notes).title == "3 shifts scheduled"
  end

  test "preferences suppress the in-app channel" do
    emp = user_with_role("employee", "bar")
    {:ok, _} = Notifications.update_prefs(emp, %{"shift_published" => %{"in_app" => false}})
    emp = Accounts.get_user!(emp.id)

    Notifications.notify(emp, :shift_published, %{title: "x", body: "y", data: %{}})

    assert Notifications.list(emp) == []
  end
end
