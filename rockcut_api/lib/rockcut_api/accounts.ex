defmodule RockcutApi.Accounts do
  @moduledoc """
  Identity and membership context: users, departments, and the role
  memberships that connect them. Phase 1 covers authentication and reads;
  user/role management writes are added in phase 2.
  """
  import Ecto.Query
  alias RockcutApi.Repo
  alias RockcutApi.Accounts.{User, Department, Membership}

  @preloads [memberships: :department]

  ## Users

  @doc "Fetch a user by id with memberships + departments preloaded. Raises if missing."
  def get_user!(id) do
    User
    |> Repo.get!(id)
    |> Repo.preload(@preloads)
  end

  @doc "Fetch a user by id, or nil. Preloaded."
  def get_user(id) do
    case Repo.get(User, id) do
      nil -> nil
      user -> Repo.preload(user, @preloads)
    end
  end

  @doc "Fetch a user by (case-insensitive) email, or nil. Preloaded."
  def get_user_by_email(email) when is_binary(email) do
    User
    |> where([u], fragment("? = ? COLLATE NOCASE", u.email, ^String.trim(email)))
    |> Repo.one()
    |> case do
      nil -> nil
      user -> Repo.preload(user, @preloads)
    end
  end

  @doc """
  Authenticate by email + password. Runs a constant-time dummy verify when the
  user is missing to avoid leaking which emails exist. Returns the preloaded
  user or nil. Callers are responsible for checking `user.active`.
  """
  def get_user_by_email_and_password(email, password)
      when is_binary(email) and is_binary(password) do
    user = get_user_by_email(email)

    cond do
      user && Argon2.verify_pass(password, user.password_hash) ->
        user

      true ->
        # Constant-time work even on a miss, then no match.
        Argon2.no_user_verify()
        nil
    end
  end

  ## Departments

  @doc "All departments, ordered by name."
  def list_departments do
    Department |> order_by(:name) |> Repo.all()
  end

  @doc "Fetch a department by its key (e.g. \"brewery\"), or nil."
  def get_department_by_key(key) when is_binary(key) do
    Repo.get_by(Department, key: key)
  end

  ## Memberships

  @doc "List a user's memberships with departments preloaded."
  def list_memberships(%User{id: user_id}) do
    Membership
    |> where(user_id: ^user_id)
    |> preload(:department)
    |> Repo.all()
  end
end
