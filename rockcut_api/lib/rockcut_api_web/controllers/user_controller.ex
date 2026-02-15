defmodule RockcutApiWeb.UserController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Accounts
  import RockcutApiWeb.JSONHelpers, only: [user: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, _params) do
    users = Accounts.list_users()
    json(conn, %{data: Enum.map(users, &user/1)})
  end

  def create(conn, params) do
    with {:ok, u} <- Accounts.create_user(params) do
      conn
      |> put_status(:created)
      |> json(%{data: user(u)})
    end
  end

  def show(conn, %{"id" => id}) do
    u = Accounts.get_user!(id)
    json(conn, %{data: user(u)})
  end

  def update(conn, %{"id" => id} = params) do
    u = Accounts.get_user!(id)

    with {:ok, u} <- Accounts.update_user(u, params) do
      json(conn, %{data: user(u)})
    end
  end

  def delete(conn, %{"id" => id}) do
    u = Accounts.get_user!(id)

    with {:ok, _} <- Accounts.delete_user(u) do
      send_resp(conn, :no_content, "")
    end
  end

  def reset_password(conn, %{"id" => id}) do
    u = Accounts.get_user!(id)

    case Accounts.reset_password(u) do
      {:ok, _user, temp_password} ->
        json(conn, %{data: %{temp_password: temp_password}})

      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{errors: format_errors(changeset)})
    end
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
