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

    assert "shift_published" in (Notifications.list(emp) |> Enum.map(& &1.event))
  end

  test "publishing an open shift notifies department members" do
    bar = department_fixture("bar")
    emp = user_with_role("employee", "bar")
    shift = shift_fixture(%{department: bar, status: "draft", assignee_id: nil})

    {:ok, _} = Scheduling.publish_shift(shift)

    assert "open_shift" in (Notifications.list(emp) |> Enum.map(& &1.event))
  end

  test "reassigning a published shift notifies the new assignee" do
    bar = department_fixture("bar")
    emp = user_with_role("employee", "bar")
    shift = shift_fixture(%{department: bar, status: "published", assignee_id: nil})

    {:ok, _} = Scheduling.update_shift(shift, %{"assignee_id" => emp.id})

    assert "shift_assigned" in (Notifications.list(emp) |> Enum.map(& &1.event))
  end

  test "preferences suppress the in-app channel" do
    emp = user_with_role("employee", "bar")
    {:ok, _} = Notifications.update_prefs(emp, %{"shift_published" => %{"in_app" => false}})
    emp = Accounts.get_user!(emp.id)

    Notifications.notify(emp, :shift_published, %{title: "x", body: "y", data: %{}})

    assert Notifications.list(emp) == []
  end
end
