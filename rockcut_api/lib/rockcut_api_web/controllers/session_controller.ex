defmodule RockcutApiWeb.SessionController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Accounts

  @token_max_age 30 * 24 * 60 * 60  # 30 days

  def create(conn, %{"email" => email, "password" => password}) do
    case Accounts.authenticate(email, password) do
      {:ok, user} ->
        token = Phoenix.Token.sign(RockcutApiWeb.Endpoint, "user auth", user.id)

        json(conn, %{
          token: token,
          email: user.email,
          name: user.name,
          role: user.role,
          must_change_password: user.must_change_password
        })

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
    user = conn.assigns.current_user

    json(conn, %{
      email: user.email,
      name: user.name,
      role: user.role,
      must_change_password: user.must_change_password
    })
  end

  def delete(conn, _params) do
    json(conn, %{ok: true})
  end

  def change_password(conn, params) do
    user = conn.assigns.current_user

    case Accounts.change_password(user, params) do
      {:ok, _user} ->
        json(conn, %{ok: true})

      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{errors: format_errors(changeset)})
    end
  end

  def verify_token(token) do
    Phoenix.Token.verify(RockcutApiWeb.Endpoint, "user auth", token, max_age: @token_max_age)
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
