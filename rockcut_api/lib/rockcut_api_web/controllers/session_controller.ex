defmodule RockcutApiWeb.SessionController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [user: 1, for_viewer: 2]
  alias RockcutApi.{Accounts, Devices, Sessions}

  @shared_device_refusal "This device is already set as a shared device. Personal logins not accepted."

  # D54: a paired tablet takes no personal logins. Checked before the password,
  # so the answer never says whether it was right.
  def create(conn, %{"email" => _, "password" => _} = params) do
    if signing_in_on(conn) do
      conn
      |> put_status(:forbidden)
      |> json(%{error: @shared_device_refusal})
    else
      sign_in(conn, params)
    end
  end

  def create(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "Email and password required"})
  end

  defp sign_in(conn, %{"email" => email, "password" => password}) do
    case Accounts.get_user_by_email_and_password(email, password) do
      %{active: true} = user ->
        {token, _row} = Sessions.create(user)
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

  def show(conn, _params) do
    viewer = conn.assigns.current_user
    json(conn, for_viewer(%{user: user(viewer)}, viewer))
  end

  # The login form on a paired tablet sends the tablet's token in
  # X-Rockcut-Device. Only a live one refuses; anything else is ignored, so a
  # browser that used to be a tablet can sign in normally.
  defp signing_in_on(conn) do
    case get_req_header(conn, "x-rockcut-device") do
      [token | _] -> Devices.live_token(token)
      _ -> nil
    end
  end

  # A person's sign-out revokes their session (D34; a pre-D34 token is only
  # dropped by the client). A tablet's sign-out revokes its device token, so
  # it needs a new pairing code (D33).
  def delete(conn, _params) do
    case conn.assigns do
      %{device_token: %Devices.DeviceToken{} = row} ->
        {:ok, _} = Devices.revoke_token(row, conn.assigns.current_user)

      %{current_session: %Sessions.UserSession{} = row} ->
        :ok = Sessions.revoke(row)

      _ ->
        :ok
    end

    json(conn, %{ok: true})
  end

  @doc "\"Sign out of all other devices\" (D34 §3.4): every session but this one."
  def delete_others(conn, _params) do
    user = conn.assigns.current_user
    revoked = Sessions.revoke_all(user, conn.assigns[:current_session])
    Accounts.record_audit(user.id, user.id, "user.signed_out_everywhere", %{"revoked" => revoked})
    json(conn, %{revoked: revoked})
  end

  def password(conn, %{"current_password" => current, "new_password" => new}) do
    case Accounts.change_password(conn.assigns.current_user, current, new) do
      {:ok, updated} ->
        # D34 §3.4: a new password signs out every other session.
        revoked = Sessions.revoke_all(updated, conn.assigns[:current_session])
        json(conn, %{user: user(updated), revoked: revoked})

      {:error, :invalid_current} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Current password is incorrect"})

      {:error, :same_password} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "The new password must be different"})

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
end
