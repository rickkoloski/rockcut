defmodule RockcutApiWeb.SessionController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [user: 1]
  alias RockcutApi.Accounts

  # 30 days
  @token_max_age 30 * 24 * 60 * 60

  def create(conn, %{"email" => email, "password" => password}) do
    case Accounts.get_user_by_email_and_password(email, password) do
      %{active: true} = user ->
        token = Phoenix.Token.sign(RockcutApiWeb.Endpoint, "user auth", user.id)
        json(conn, %{token: token, user: user(user)})

      %{active: false} ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "Account disabled"})

      nil ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "Invalid credentials"})
    end
  end

  def create(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "Email and password required"})
  end

  def show(conn, _params) do
    json(conn, %{user: user(conn.assigns.current_user)})
  end

  def delete(conn, _params) do
    json(conn, %{ok: true})
  end

  def password(conn, %{"current_password" => current, "new_password" => new}) do
    case Accounts.change_password(conn.assigns.current_user, current, new) do
      {:ok, updated} ->
        json(conn, %{user: user(updated)})

      {:error, :invalid_current} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Current password is incorrect"})

      {:error, %Ecto.Changeset{}} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "New password is invalid (minimum 8 characters)"})
    end
  end

  def password(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "current_password and new_password required"})
  end

  @doc "Verifies a bearer token, returning `{:ok, user_id}` or an error."
  def verify_token(token) do
    Phoenix.Token.verify(RockcutApiWeb.Endpoint, "user auth", token, max_age: @token_max_age)
  end
end
