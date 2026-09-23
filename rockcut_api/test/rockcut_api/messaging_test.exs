defmodule RockcutApi.MessagingTest do
  use RockcutApi.DataCase

  alias RockcutApi.Messaging
  import RockcutApi.AccountsFixtures

  defp keys(user), do: Messaging.channels_for(user) |> Enum.map(& &1.key)

  test "channels reflect membership and role" do
    _bar = department_fixture("bar")
    _brew = department_fixture("brewery")
    emp = user_with_role("employee", "bar")
    mgr = user_with_role("manager", "brewery")
    owner = owner_fixture()

    assert keys(emp) == ["all", "dept:bar"]
    assert "managers" in keys(mgr) and "dept:brewery" in keys(mgr)
    refute "managers" in keys(emp)

    # Owner sees All-staff, Managers, and every assignable department.
    owner_keys = keys(owner)
    assert "all" in owner_keys and "managers" in owner_keys
    assert "dept:bar" in owner_keys and "dept:brewery" in owner_keys
  end

  test "members see full history; non-members are forbidden" do
    _bar = department_fixture("bar")
    _brew = department_fixture("brewery")
    poster = user_with_role("employee", "bar")
    # Post BEFORE the second member exists → they must still see it (full history).
    {:ok, _} = Messaging.post_message(poster, "dept:bar", "first!")

    latecomer = user_with_role("employee", "bar")
    {:ok, msgs} = Messaging.list_messages(latecomer, "dept:bar")
    assert Enum.map(msgs, & &1.body) == ["first!"]

    outsider = user_with_role("employee", "brewery")
    assert Messaging.list_messages(outsider, "dept:bar") == {:error, :forbidden}
    assert Messaging.post_message(outsider, "dept:bar", "nope") == {:error, :forbidden}
  end

  test "unread counts exclude own posts and clear on read" do
    _bar = department_fixture("bar")
    a = user_with_role("employee", "bar")
    b = user_with_role("employee", "bar")

    {:ok, _} = Messaging.post_message(a, "dept:bar", "hi")
    {:ok, _} = Messaging.post_message(a, "dept:bar", "there")

    # b has two unread; a (the author) has none.
    assert Messaging.unread_counts(b)["dept:bar"] == 2
    assert Messaging.unread_counts(a)["dept:bar"] == 0

    :ok = Messaging.mark_read(b, "dept:bar")
    assert Messaging.unread_counts(b)["dept:bar"] == 0
    assert Messaging.total_unread(b) == 0
  end

  test "recipients per channel" do
    _bar = department_fixture("bar")
    emp = user_with_role("employee", "bar")
    mgr = user_with_role("manager", "bar")
    owner = owner_fixture()

    all_ids = Messaging.recipients("all") |> Enum.map(& &1.id) |> MapSet.new()
    assert MapSet.subset?(MapSet.new([emp.id, mgr.id, owner.id]), all_ids)

    mgr_ids = Messaging.recipients("managers") |> Enum.map(& &1.id) |> MapSet.new()
    assert mgr.id in mgr_ids and owner.id in mgr_ids
    refute emp.id in mgr_ids

    dept_ids = Messaging.recipients("dept:bar") |> Enum.map(& &1.id) |> MapSet.new()
    assert emp.id in dept_ids and mgr.id in dept_ids
  end
end
