defmodule RockcutApi.SchedulingTest do
  use RockcutApi.DataCase

  alias RockcutApi.Scheduling
  import RockcutApi.AccountsFixtures
  import RockcutApi.SchedulingFixtures

  describe "list_shifts/2 visibility" do
    test "employee sees published anywhere but no drafts (even own department)" do
      bar = department_fixture("bar")
      brewery = department_fixture("brewery")
      emp = user_with_role("employee", "bar")

      pub = shift_fixture(%{department: brewery, status: "published"})
      draft_bar = shift_fixture(%{department: bar, status: "draft"})
      draft_brewery = shift_fixture(%{department: brewery, status: "draft"})

      ids = Scheduling.list_shifts(emp) |> Enum.map(& &1.id)
      assert pub.id in ids
      refute draft_bar.id in ids
      refute draft_brewery.id in ids
    end

    test "manager sees their department's drafts" do
      bar = department_fixture("bar")
      mgr = user_with_role("manager", "bar")
      draft_bar = shift_fixture(%{department: bar, status: "draft"})

      assert draft_bar.id in (Scheduling.list_shifts(mgr) |> Enum.map(& &1.id))
    end

    test "owner sees all drafts" do
      bar = department_fixture("bar")
      owner = owner_fixture()
      draft = shift_fixture(%{department: bar, status: "draft"})
      assert draft.id in (Scheduling.list_shifts(owner) |> Enum.map(& &1.id))
    end
  end

  describe "claim_shift/2" do
    test "assigns an open published shift, and only once" do
      bar = department_fixture("bar")
      emp = user_with_role("employee", "bar")
      emp2 = user_with_role("employee", "bar")
      shift = shift_fixture(%{department: bar, status: "published"})

      assert {:ok, claimed} = Scheduling.claim_shift(shift, emp)
      assert claimed.assignee_id == emp.id

      assert {:error, :not_claimable} =
               Scheduling.claim_shift(Scheduling.get_shift!(shift.id), emp2)
    end

    test "cannot claim a draft" do
      bar = department_fixture("bar")
      emp = user_with_role("employee", "bar")
      shift = shift_fixture(%{department: bar, status: "draft"})
      assert {:error, :not_claimable} = Scheduling.claim_shift(shift, emp)
    end
  end

  describe "create_shift/2" do
    test "rejects ends_at not after starts_at" do
      owner = owner_fixture()
      bar = department_fixture("bar")
      pos = position_fixture()
      now = DateTime.utc_now() |> DateTime.truncate(:second)

      attrs = %{
        "department_id" => bar.id,
        "position_id" => pos.id,
        "starts_at" => DateTime.add(now, 7200),
        "ends_at" => DateTime.add(now, 3600)
      }

      assert {:error, changeset} = Scheduling.create_shift(attrs, owner)
      assert Map.has_key?(errors_on(changeset), :ends_at)
    end
  end

  describe "positions" do
    test "a referenced position is deactivated, not deleted" do
      bar = department_fixture("bar")
      pos = position_fixture()
      _shift = shift_fixture(%{department: bar, position: pos})

      assert {:ok, updated} = Scheduling.deactivate_or_delete_position(pos)
      refute updated.active
      assert Scheduling.get_position!(pos.id)
    end

    test "an unreferenced position is deleted" do
      pos = position_fixture()
      assert {:ok, :deleted} = Scheduling.deactivate_or_delete_position(pos)
    end
  end
end
