defmodule RockcutApi.AuthzTest do
  use RockcutApi.DataCase

  alias RockcutApi.{Authz, Repo, TimeOff}
  alias RockcutApi.Accounts.User
  alias RockcutApi.Availability.Slot
  alias RockcutApi.Scheduling.{ShiftTemplate, ScheduleTemplate}
  import RockcutApi.AccountsFixtures
  import RockcutApi.PersonaFixtures, only: [personas: 0, departments: 0]

  describe "role_in/2" do
    test "owner is :owner in every department" do
      owner = owner_fixture()
      department_fixture("brewery")
      department_fixture("sales")

      assert Authz.role_in(owner, "brewery") == :owner
      assert Authz.role_in(owner, "sales") == :owner
    end

    test "returns the membership role by department key" do
      manager = user_with_role("manager", "brewery")
      assert Authz.role_in(manager, "brewery") == :manager
      assert Authz.role_in(manager, "sales") == nil
    end

    test "supports mixed roles across departments" do
      user = user_with_role("manager", "bar")
      user = add_membership(user, "brewery", "employee")

      assert Authz.role_in(user, "bar") == :manager
      assert Authz.role_in(user, "brewery") == :employee
    end
  end

  describe "member_of?/2 and can_manage_users_in?/2" do
    test "employee is a member but cannot manage users" do
      employee = user_with_role("employee", "brewery")
      assert Authz.member_of?(employee, "brewery")
      refute Authz.can_manage_users_in?(employee, "brewery")
    end

    test "manager can manage users in their department only" do
      manager = user_with_role("manager", "brewery")
      assert Authz.can_manage_users_in?(manager, "brewery")
      refute Authz.can_manage_users_in?(manager, "sales")
    end

    test "owner can manage users everywhere" do
      owner = owner_fixture()
      assert Authz.can_manage_users_in?(owner, "sales")
    end

    test "non-member is neither" do
      outsider = user_fixture()
      department_fixture("brewery")
      refute Authz.member_of?(outsider, "brewery")
      refute Authz.can_manage_users_in?(outsider, "brewery")
    end
  end

  describe "can?/3 module access" do
    test "brewery members and owners may access the Brewery module; others may not" do
      owner = owner_fixture()
      member = user_with_role("employee", "brewery")
      outsider = user_with_role("manager", "sales")

      assert Authz.can?(owner, :access, {:module, :brewery})
      assert Authz.can?(member, :access, {:module, :brewery})
      refute Authz.can?(outsider, :access, {:module, :brewery})
    end
  end

  # D31: resources moved behind can?/3. The parity suite pins behavior through
  # the endpoints; these pin the Authz answers directly.
  describe "D31 can?/3 resources" do
    setup do
      %{p: personas(), d: departments()}
    end

    test "templates and roster: anyone reads, any manager writes", %{p: p} do
      for r <- [%ShiftTemplate{}, %ScheduleTemplate{}, :roster] do
        assert Authz.can?(p["noDept"], :read, r)
        assert Authz.can?(p["splitRole"], :create, r)
        refute Authz.can?(p["floater"], :delete, r)
      end

      assert Authz.can?(p["dualMgr"], :reorder, :roster)
      refute Authz.can?(p["bartender1"], :reorder, :roster)
    end

    test "time off: review by a requester-dept manager or own if a manager; cancel by requester only",
         %{p: p} do
      {:ok, r} =
        TimeOff.create(
          %{
            "type" => "pto",
            "all_day" => true,
            "starts_at" => "2026-10-01T16:00:00Z",
            "ends_at" => "2026-10-02T00:00:00Z"
          },
          p["floater"]
        )

      req = TimeOff.get(r.id)

      assert Authz.can?(p["barMgr"], :review, req)
      assert Authz.can?(p["breweryMgr"], :review, req)
      refute Authz.can?(p["sales1"], :review, req)
      refute Authz.can?(p["office1"], :review, req)
      refute Authz.can?(p["floater"], :review, req)

      assert Authz.can?(p["floater"], :cancel, req)
      refute Authz.can?(p["owner"], :cancel, req)
      refute Authz.can?(p["barMgr"], :cancel, req)
    end

    test "acting on behalf of a user and availability slots", %{p: p} do
      assert Authz.can?(p["barMgr"], :manage, {:user_for, p["floater"].id})
      refute Authz.can?(p["barMgr"], :manage, {:user_for, p["brewer1"].id})

      slot = %Slot{user_id: p["brewer1"].id}
      assert Authz.can?(p["brewer1"], :delete, slot)
      assert Authz.can?(p["breweryMgr"], :delete, slot)
      refute Authz.can?(p["splitRole"], :delete, slot)
    end

    test "calendar feeds", %{p: p, d: d} do
      assert Authz.can?(p["bartender1"], :rotate, {:calendar_feed, "user", p["bartender1"].id})
      refute Authz.can?(p["barMgr"], :rotate, {:calendar_feed, "user", p["bartender1"].id})
      assert Authz.can?(p["dualMgr"], :rotate, {:calendar_feed, "department", d["office"].id})
      refute Authz.can?(p["splitRole"], :rotate, {:calendar_feed, "department", d["brewery"].id})
      assert Authz.can?(p["owner"], :rotate, {:calendar_feed, "all", nil})
      refute Authz.can?(p["dualMgr"], :rotate, {:calendar_feed, "all", nil})
      refute Authz.can?(p["owner"], :rotate, {:calendar_feed, "bogus", 1})
    end

    test "channels, including the owner exception for non-assignable departments", %{p: p} do
      assert Authz.can?(p["noDept"], :view, {:channel, "all"})
      refute Authz.can?(p["noDept"], :view, {:channel, "managers"})
      assert Authz.can?(p["splitRole"], :post, {:channel, "managers"})
      assert Authz.can?(p["floater"], :view, {:channel, "dept:brewery"})
      refute Authz.can?(p["bartender1"], :view, {:channel, "dept:brewery"})
      assert Authz.can?(p["owner"], :view, {:channel, "dept:sales"})
      refute Authz.can?(p["owner"], :view, {:channel, "dept:other"})
      refute Authz.can?(p["owner"], :view, {:channel, "nope"})
    end

    test "people and memberships", %{p: p, d: d} do
      assert Authz.can?(p["splitRole"], :list, %User{})
      assert Authz.can?(p["splitRole"], :create, %User{})
      refute Authz.can?(p["floater"], :list, %User{})

      assert Authz.can?(p["barMgr"], :update, p["floater"])
      refute Authz.can?(p["splitRole"], :reset_password, p["brewer1"])
      assert Authz.can?(p["owner"], :set_owner, p["brewer1"])
      refute Authz.can?(p["barMgr"], :set_owner, p["bartender1"])

      assert Authz.can?(p["barMgr"], :set, :memberships)
      refute Authz.can?(p["bartender1"], :set, :memberships)
      assert Authz.can?(p["dualMgr"], :assign, {:memberships, d["office"].id})
      refute Authz.can?(p["dualMgr"], :assign, {:memberships, d["brewery"].id})
    end

    test "owner-only surfaces", %{p: p, d: d} do
      assert Authz.can?(p["noDept"], :read, d["bar"])
      assert Authz.can?(p["owner2"], :update, d["bar"])
      refute Authz.can?(p["barMgr"], :update, d["bar"])
      assert Authz.can?(p["owner"], :read, :owner_activity)
      refute Authz.can?(p["dualMgr"], :read, :owner_activity)
    end
  end

  describe "D31 scope/3, member_ids_in/1, managers audience" do
    setup do
      %{p: personas(), d: departments()}
    end

    test "scope by level", %{p: p, d: d} do
      assert Authz.scope(p["owner"], :time_off, :manage) == :all
      assert Authz.scope(p["bartender1"], :time_off, :manage) == :none
      assert {:departments, ids} = Authz.scope(p["dualMgr"], :people, :manage)
      assert Enum.sort(ids) == Enum.sort([d["bar"].id, d["office"].id])
      assert Authz.scope(p["splitRole"], :schedule, :manage) == {:departments, [d["bar"].id]}

      assert {:departments, ids} = Authz.scope(p["floater"], :messaging, :edit)
      assert Enum.sort(ids) == Enum.sort([d["bar"].id, d["brewery"].id])
      assert Authz.scope(p["noDept"], :messaging, :edit) == :none
    end

    test "member_ids_in", %{p: p, d: d} do
      assert Authz.member_ids_in(:all) == :all
      assert Authz.member_ids_in(:none) == []

      ids = Authz.member_ids_in({:departments, [d["office"].id]})
      assert Enum.sort(ids) == Enum.sort([p["office1"].id, p["hidden"].id, p["dualMgr"].id])
    end

    test "counts_as_manager? and the managers audience", %{p: p} do
      assert Authz.counts_as_manager?(p["owner"])
      assert Authz.counts_as_manager?(p["splitRole"])
      refute Authz.counts_as_manager?(p["floater"])

      ids = Authz.managers_audience_query() |> Repo.all() |> Enum.map(& &1.id) |> Enum.sort()
      expected = ~w(owner owner2 breweryMgr barMgr dualMgr splitRole) |> Enum.map(&p[&1].id)
      assert ids == Enum.sort(expected)
    end

    test "can_manage_user? accepts a target struct or id", %{p: p} do
      assert Authz.can_manage_user?(p["barMgr"], p["floater"])
      assert Authz.can_manage_user?(p["barMgr"], p["floater"].id)
      refute Authz.can_manage_user?(p["barMgr"], p["brewer1"])
    end
  end
end
