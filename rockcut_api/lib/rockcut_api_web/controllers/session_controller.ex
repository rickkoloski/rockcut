defmodule RockcutApiWeb.SessionController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [user: 1, for_viewer: 2]
  alias RockcutApi.{Accounts, Devices, Sessions}

  # Pre-D34 tokens: 30 days. Still verified until they've all expired (D34 §3.7).
  @token_max_age 30 * 24 * 60 * 60

  def create(conn, %{"email" => email, "password" => password}) do
    case Accounts.get_user_by_email_and_password(email, password) do
      %{active: true} = user ->
        {token, _row} = Sessions.create(user, device_token: signing_in_on(conn))
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
    viewer = conn.assigns.current_user
    json(conn, for_viewer(%{user: user(viewer)}, viewer))
  end

  # D34 §3.3: "Sign in as me" on a paired tablet sends the tablet's token in
  # X-Rockcut-Device. A live one marks the session as a tablet sign-in; anything
  # else is ignored (a stale header never refuses a sign-in).
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
    if on_tablet?(conn), do: tablet_refused(conn), else: do_delete_others(conn)
  end

  defp do_delete_others(conn) do
    user = conn.assigns.current_user
    revoked = Sessions.revoke_all(user, conn.assigns[:current_session])
    Accounts.record_audit(user.id, user.id, "user.signed_out_everywhere", %{"revoked" => revoked})
    json(conn, %{revoked: revoked})
  end

  # A tablet sign-in can still finish a forced reset after a temporary password.
  def password(conn, %{"current_password" => _, "new_password" => _} = params) do
    if on_tablet?(conn) and not conn.assigns.current_user.must_reset_password,
      do: tablet_refused(conn),
      else: change_password(conn, params)
  end

  def password(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "current_password and new_password required"})
  end

  defp change_password(conn, %{"current_password" => current, "new_password" => new}) do
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

  # DEV pass 1 G2: the profile actions aren't offered during "Sign in as me"
  # (D34 §3.5), and the server refuses them too.
  defp on_tablet?(conn) do
    match?(
      %Sessions.UserSession{device_token_id: id} when not is_nil(id),
      conn.assigns[:current_session]
    )
  end

  defp tablet_refused(conn) do
    conn
    |> put_status(:forbidden)
    |> json(%{error: "Not available on a shared tablet. Use your own device."})
  end

  @doc """
  Verifies a bearer token, returning `{:ok, user_id}` or an error. On DEV/local
  only, also accepts short-lived synthetic-persona tokens (D30); prod never does.
  """
  def verify_token(token) do
    case Phoenix.Token.verify(RockcutApiWeb.Endpoint, "user auth", token, max_age: @token_max_age) do
      {:ok, user_id} ->
        {:ok, user_id}

      error ->
        if RockcutApi.Seeds.Guard.allowed?(),
          do: verify_synthetic_token(token),
          else: error
    end
  end

  defp verify_synthetic_token(token) do
    alias RockcutApi.Seeds.Synthetic

    Phoenix.Token.verify(RockcutApiWeb.Endpoint, Synthetic.token_salt(), token,
      max_age: Synthetic.token_max_age()
    )
  end
end
