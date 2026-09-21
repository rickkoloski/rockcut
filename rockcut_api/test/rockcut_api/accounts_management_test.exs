defmodule RockcutApi.AccountsManagementTest do
  use RockcutApi.DataCase

  alias RockcutApi.{Accounts, Authz}
  import RockcutApi.AccountsFixtures

  describe "create_user/2" do
    test "owner creates a user with memberships and a forced-reset temp password" do
      owner = owner_fixture()
      department_fixture("brewery")

      assert {:ok, user, temp} =
               Accounts.create_user(
                 %{
                   "email" => "new@rockcut.com",
                   "name" => "New",
                   "memberships" => [%{"department" => "brewery", "role" => "employee"}]
                 },
                 owner
               )

      assert is_binary(temp) and byte_size(temp) >= 8
      assert user.must_reset_password
      assert Authz.role_in(user, "brewery") == :employee
    end

    test "manager creates a user with a role in their own department" do
      manager = user_with_role("manager", "brewery")

      assert {:ok, user, _temp} =
               Accounts.create_user(
                 %{
                   "email" => "hire@rockcut.com",
                   "memberships" => [%{"department" => "brewery", "role" => "employee"}]
                 },
                 manager
               )

      assert Authz.role_in(user, "brewery") == :employee
    end

    test "manager cannot assign a role in a department they do not manage" do
      manager = user_with_role("manager", "brewery")
      department_fixture("sales")

      assert {:error, {:unauthorized_department, "sales"}} =
               Accounts.create_user(
                 %{
                   "email" => "hire@rockcut.com",
                   "memberships" => [%{"department" => "sales", "role" => "employee"}]
                 },
                 manager
               )

      # rolled back — no orphan user created
      refute Accounts.get_user_by_email("hire@rockcut.com")
    end
  end

  describe "set_memberships/3 (declarative)" do
    test "owner adds, changes, and removes to match the desired set" do
      owner = owner_fixture()
      user = user_with_role("employee", "brewery")
      user = add_membership(user, "sales", "employee")
      department_fixture("bar")

      # Desired: promote brewery to manager, drop sales, add bar
      assert {:ok, updated} =
               Accounts.set_memberships(
                 user,
                 [
                   %{"department" => "brewery", "role" => "manager"},
                   %{"department" => "bar", "role" => "employee"}
                 ],
                 owner
               )

      assert Authz.role_in(updated, "brewery") == :manager
      assert Authz.role_in(updated, "bar") == :employee
      assert Authz.role_in(updated, "sales") == nil
    end

    test "manager only affects their department and preserves others" do
      manager = user_with_role("manager", "brewery")
      user = user_with_role("employee", "brewery")
      user = add_membership(user, "sales", "employee")

      # Manager submits only brewery; sales membership must be preserved (not removed)
      assert {:ok, updated} =
               Accounts.set_memberships(
                 user,
                 [%{"department" => "brewery", "role" => "manager"}],
                 manager
               )

      assert Authz.role_in(updated, "brewery") == :manager
      assert Authz.role_in(updated, "sales") == :employee
    end

    test "manager cannot grant a role outside their department" do
      manager = user_with_role("manager", "brewery")
      user = user_with_role("employee", "brewery")
      department_fixture("sales")

      assert {:error, {:unauthorized_department, "sales"}} =
               Accounts.set_memberships(
                 user,
                 [%{"department" => "sales", "role" => "manager"}],
                 manager
               )
    end
  end

  describe "last-owner invariant" do
    test "cannot deactivate the last active owner" do
      owner = owner_fixture()
      assert {:error, :last_owner} = Accounts.update_user(owner, %{"active" => false}, owner)
    end

    test "cannot demote the last active owner" do
      owner = owner_fixture()
      assert {:error, :last_owner} = Accounts.update_user(owner, %{"is_owner" => false}, owner)
    end

    test "can demote an owner when another active owner exists" do
      owner1 = owner_fixture()
      owner2 = owner_fixture()

      assert {:ok, updated} = Accounts.update_user(owner2, %{"is_owner" => false}, owner1)
      refute updated.is_owner
    end
  end

  describe "passwords" do
    test "change_password verifies the current password and clears forced reset" do
      user = user_fixture(%{password: "old-password", must_reset_password: true})
      assert {:ok, updated} = Accounts.change_password(user, "old-password", "brand-new-pass")
      refute updated.must_reset_password
      assert Accounts.get_user_by_email_and_password(user.email, "brand-new-pass")
    end

    test "change_password rejects a wrong current password" do
      user = user_fixture(%{password: "old-password"})

      assert {:error, :invalid_current} =
               Accounts.change_password(user, "wrong", "brand-new-pass")
    end

    test "reset_password returns a fresh temp and forces reset" do
      owner = owner_fixture()
      user = user_with_role("employee", "brewery")
      assert {:ok, updated, temp} = Accounts.reset_password(user, owner)
      assert is_binary(temp)
      assert updated.must_reset_password
      assert Accounts.get_user_by_email_and_password(user.email, temp)
    end
  end

  describe "capabilities/1" do
    test "owner sees all modules and manages all" do
      owner = owner_fixture()
      for k <- ~w(brewery bar office sales), do: department_fixture(k)
      caps = Accounts.capabilities(owner)
      # departments + the shared "schedule" module
      assert Enum.sort(caps.modules) == ~w(bar brewery office sales schedule)
      assert caps.can_manage_users
    end

    test "manager manages only their department; employee manages none" do
      manager = user_with_role("manager", "brewery")
      assert Accounts.capabilities(manager).manages_departments == ["brewery"]
      assert Accounts.capabilities(manager).can_manage_users

      employee = user_with_role("employee", "sales")
      caps = Accounts.capabilities(employee)
      assert caps.modules == ["sales", "schedule"]
      assert caps.manages_departments == []
      refute caps.can_manage_users
    end
  end
end
