defmodule RockcutApi.AuthzTest do
  use RockcutApi.DataCase

  alias RockcutApi.Authz
  alias RockcutApi.Brewing.Ingredient
  import RockcutApi.AccountsFixtures

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

  describe "can?/3 on brewing resources" do
    test "brewery members and owners may act; others may not" do
      owner = owner_fixture()
      member = user_with_role("employee", "brewery")
      outsider = user_with_role("manager", "sales")
      resource = %Ingredient{}

      assert Authz.can?(owner, :read, resource)
      assert Authz.can?(member, :create, resource)
      refute Authz.can?(outsider, :read, resource)
    end
  end
end
