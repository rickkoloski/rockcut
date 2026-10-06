defmodule RockcutApiWeb.MeController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [me: 4, for_viewer: 2]
  alias RockcutApi.{Accounts, StaffCodes}

  def show(conn, _params) do
    user = conn.assigns.current_user

    json(
      conn,
      me(
        user,
        Accounts.capabilities(user),
        Accounts.shared_devices?(user),
        StaffCodes.can_manage?(user)
      )
      |> for_viewer(user)
    )
  end
end
