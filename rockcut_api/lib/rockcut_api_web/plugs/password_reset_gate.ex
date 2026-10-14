defmodule RockcutApiWeb.PasswordResetGate do
  @moduledoc """
  D42 §2.1 (task 4117): while the signed-in person must set a new password
  (`must_reset_password`: a temporary password from `POST /api/users` or a
  manager's reset), every route answers 403 `password_reset_required` except
  the reset flow itself: `GET /api/me`, `GET /api/session`,
  `DELETE /api/session` and `POST /api/session/password`.

  Part of every authenticated pipeline, after `AuthPlug`, so a route added
  later is covered by default. Devices never have the flag.
  """
  import Plug.Conn

  @allowed [
    {"GET", ["api", "me"]},
    {"GET", ["api", "session"]},
    {"DELETE", ["api", "session"]},
    {"POST", ["api", "session", "password"]}
  ]

  def init(opts), do: opts

  def call(%Plug.Conn{assigns: %{current_user: %{must_reset_password: true}}} = conn, _opts) do
    if {conn.method, conn.path_info} in @allowed do
      conn
    else
      conn
      |> put_status(:forbidden)
      |> Phoenix.Controller.json(%{error: "password_reset_required"})
      |> halt()
    end
  end

  def call(conn, _opts), do: conn
end
