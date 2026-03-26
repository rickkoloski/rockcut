defmodule RockcutApi.Accounts do
  @moduledoc "Context for user accounts and authentication."

  import Ecto.Query
  alias RockcutApi.Repo
  alias RockcutApi.Accounts.User

  def authenticate(email, password) do
    user =
      Repo.one(from u in User, where: fragment("lower(?)", u.email) == ^String.downcase(email))

    if user && Argon2.verify_pass(password, user.password_hash) do
      {:ok, user}
    else
      Argon2.no_user_verify()
      :error
    end
  end

  def list_users do
    Repo.all(from u in User, order_by: [asc: u.name])
  end

  def get_user!(id), do: Repo.get!(User, id)

  def get_user(id), do: Repo.get(User, id)

  def get_user_by_email(email) do
    Repo.one(from u in User, where: fragment("lower(?)", u.email) == ^String.downcase(email))
  end

  def create_user(attrs) do
    %User{}
    |> User.registration_changeset(attrs)
    |> Repo.insert()
  end

  def update_user(%User{} = user, attrs) do
    user
    |> User.changeset(attrs)
    |> Repo.update()
  end

  def delete_user(%User{} = user) do
    Repo.delete(user)
  end

  def change_password(%User{} = user, attrs) do
    user
    |> User.password_changeset(attrs)
    |> Repo.update()
  end

  def reset_password(%User{} = user) do
    temp_password = generate_temp_password()

    case user
         |> User.changeset(%{password: temp_password, must_change_password: true})
         |> Repo.update() do
      {:ok, updated_user} -> {:ok, updated_user, temp_password}
      {:error, changeset} -> {:error, changeset}
    end
  end

  defp generate_temp_password do
    :crypto.strong_rand_bytes(6)
    |> Base.encode64(padding: false)
    |> binary_part(0, 8)
  end
end
