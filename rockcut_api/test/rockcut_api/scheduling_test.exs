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
    test "a shift's department follows its position (ignores a mismatched department_id)" do
      owner = owner_fixture()
      brewery = department_fixture("brewery")
      bar = department_fixture("bar")
      pos = position_fixture(%{department: brewery})
      now = DateTime.utc_now() |> DateTime.truncate(:second)

      attrs = %{
        "department_id" => bar.id,
        "position_id" => pos.id,
        "starts_at" => DateTime.add(now, 3600),
        "ends_at" => DateTime.add(now, 7200)
      }

      assert {:ok, shift} = Scheduling.create_shift(attrs, owner)
      assert shift.department_id == brewery.id
    end

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

  describe "D58 §3.7 (5204): a deactivated assignee" do
    setup do
      owner = owner_fixture()
      bar = department_fixture("bar")
      pos = position_fixture(%{department: bar})
      gone = user_with_role("employee", "bar")
      now = DateTime.utc_now() |> DateTime.truncate(:second)

      attrs = %{
        "department_id" => bar.id,
        "position_id" => pos.id,
        "starts_at" => DateTime.add(now, 3600),
        "ends_at" => DateTime.add(now, 7200)
      }

      %{owner: owner, gone: gone, attrs: attrs, now: now}
    end

    defp deactivate!(user),
      do: user |> Ecto.Changeset.change(active: false) |> RockcutApi.Repo.update!()

    test "can't be given a new shift", ctx do
      deactivate!(ctx.gone)
      attrs = Map.put(ctx.attrs, "assignee_id", ctx.gone.id)

      assert {:error, cs} = Scheduling.create_shift(attrs, ctx.owner)
      assert errors_on(cs).assignee_id == ["is not active"]
    end

    test "can't be put on a shift by an edit or a drag", ctx do
      {:ok, shift} = Scheduling.create_shift(ctx.attrs, ctx.owner)
      deactivate!(ctx.gone)

      assert {:error, cs} = Scheduling.update_shift(shift, %{"assignee_id" => ctx.gone.id})
      assert errors_on(cs).assignee_id == ["is not active"]

      # A drag moves the time and the person together.
      drag = %{
        "assignee_id" => ctx.gone.id,
        "starts_at" => DateTime.add(ctx.now, 86_400 + 3600),
        "ends_at" => DateTime.add(ctx.now, 86_400 + 7200)
      }

      assert {:error, cs} = Scheduling.update_shift(shift, drag)
      assert errors_on(cs).assignee_id == ["is not active"]
    end

    test "their existing shifts are untouched and still editable", ctx do
      {:ok, shift} =
        Scheduling.create_shift(Map.put(ctx.attrs, "assignee_id", ctx.gone.id), ctx.owner)

      deactivate!(ctx.gone)

      assert {:ok, edited} = Scheduling.update_shift(shift, %{"notes" => "Covering"})
      assert edited.assignee_id == ctx.gone.id
      assert {:ok, _} = Scheduling.publish_shift(edited)
      # Taking them off is fine too.
      assert {:ok, %{assignee_id: nil}} = Scheduling.update_shift(edited, %{"assignee_id" => nil})
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
