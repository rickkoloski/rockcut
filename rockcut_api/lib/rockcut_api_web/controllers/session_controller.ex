defmodule RockcutApiWeb.SessionController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Auth.EnvAuth

  @token_max_age 30 * 24 * 60 * 60  # 30 days

  def create(conn, %{"email" => email, "password" => password}) do
    case EnvAuth.validate_credentials(email, password) do
      {:ok, email} ->
        token = Phoenix.Token.sign(RockcutApiWeb.Endpoint, "user auth", email)
        json(conn, %{token: token, email: email})

      :error ->
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
    email = conn.assigns[:current_user]
    json(conn, %{email: email})
  end

  def delete(conn, _params) do
    json(conn, %{ok: true})
  end

  def verify_token(token) do
    Phoenix.Token.verify(RockcutApiWeb.Endpoint, "user auth", token, max_age: @token_max_age)
  end
end
