defmodule RockcutApiWeb.MeController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [me: 3, for_viewer: 2]
  alias RockcutApi.Accounts

  def show(conn, _params) do
    user = conn.assigns.current_user

    json(
      conn,
      me(user, Accounts.capabilities(user), Accounts.shared_devices?(user)) |> for_viewer(user)
    )
  end
end
