defmodule RockcutApi.AccountsTest do
  use RockcutApi.DataCase

  alias RockcutApi.Accounts
  import RockcutApi.AccountsFixtures

  describe "get_user_by_email_and_password/2" do
    test "returns the user with correct credentials" do
      user = user_fixture(%{email: "brewer@rockcut.com", password: "secret-pass"})

      assert %{id: id} =
               Accounts.get_user_by_email_and_password("brewer@rockcut.com", "secret-pass")

      assert id == user.id
    end

    test "is case-insensitive on email" do
      user = user_fixture(%{email: "Brewer@Rockcut.com", password: "secret-pass"})

      assert %{id: id} =
               Accounts.get_user_by_email_and_password("brewer@rockcut.com", "secret-pass")

      assert id == user.id
    end

    test "returns nil on wrong password" do
      user_fixture(%{email: "brewer@rockcut.com", password: "secret-pass"})
      refute Accounts.get_user_by_email_and_password("brewer@rockcut.com", "wrong")
    end

    test "returns nil for unknown email (constant-time path)" do
      refute Accounts.get_user_by_email_and_password("nobody@rockcut.com", "whatever")
    end
  end

  describe "email uniqueness (COLLATE NOCASE)" do
    test "rejects a duplicate email differing only by case" do
      user_fixture(%{email: "dup@rockcut.com"})

      assert {:error, changeset} =
               %RockcutApi.Accounts.User{}
               |> RockcutApi.Accounts.User.registration_changeset(%{
                 email: "DUP@rockcut.com",
                 password: "password123"
               })
               |> RockcutApi.Repo.insert()

      assert %{email: ["has already been taken"]} = errors_on(changeset)
    end
  end

  describe "get_user!/1" do
    test "preloads memberships and departments" do
      user = user_with_role("manager", "brewery")
      loaded = Accounts.get_user!(user.id)
      assert [membership] = loaded.memberships
      assert membership.department.key == "brewery"
    end
  end

  describe "list_departments/0" do
    test "returns seeded departments" do
      department_fixture("brewery")
      department_fixture("sales")
      keys = Accounts.list_departments() |> Enum.map(& &1.key)
      assert "brewery" in keys
      assert "sales" in keys
    end
  end
end
