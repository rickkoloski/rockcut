defmodule RockcutApi.AccountsFixtures do
  @moduledoc "Test fixtures for users, departments, and memberships."

  alias RockcutApi.Repo
  alias RockcutApi.Accounts
  alias RockcutApi.Accounts.{User, Department, Membership}

  @default_password "password123"

  def valid_password, do: @default_password

  def department_fixture(key \\ "brewery", name \\ nil) do
    name = name || String.capitalize(key)

    case Repo.get_by(Department, key: key) do
      nil -> Repo.insert!(%Department{key: key, name: name})
      dept -> dept
    end
  end

  @doc "Create a user (no memberships). Pass :is_owner/:active/:email/:password in attrs."
  def user_fixture(attrs \\ %{}) do
    attrs = Map.new(attrs)
    password = Map.get(attrs, :password, @default_password)
    email = Map.get(attrs, :email, "user#{System.unique_integer([:positive])}@rockcut.com")

    user =
      %User{}
      |> User.registration_changeset(%{
        email: email,
        name: Map.get(attrs, :name, "Test User"),
        password: password
      })
      |> Ecto.Changeset.change(Map.take(attrs, [:is_owner, :active, :must_reset_password]))
      |> Repo.insert!()

    Accounts.get_user!(user.id)
  end

  def owner_fixture(attrs \\ %{}) do
    attrs |> Map.new() |> Map.put(:is_owner, true) |> user_fixture()
  end

  @doc "Create a user with the given role (\"manager\"/\"employee\") in a department."
  def user_with_role(role, dept_key \\ "brewery", attrs \\ %{}) do
    dept = department_fixture(dept_key)
    user = user_fixture(attrs)
    Repo.insert!(%Membership{user_id: user.id, department_id: dept.id, role: role})
    Accounts.get_user!(user.id)
  end

  def add_membership(%User{} = user, dept_key, role) do
    dept = department_fixture(dept_key)
    Repo.insert!(%Membership{user_id: user.id, department_id: dept.id, role: role})
    Accounts.get_user!(user.id)
  end
end
