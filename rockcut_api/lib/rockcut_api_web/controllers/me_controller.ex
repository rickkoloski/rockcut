defmodule RockcutApiWeb.MeController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [me: 3, for_viewer: 2]
  alias RockcutApi.{Accounts, Authz, StaffCodes}

  def show(conn, _params) do
    user = conn.assigns.current_user

    json(
      conn,
      me(user, Accounts.capabilities(user), %{
        shared_devices: Accounts.shared_devices?(user),
        staff_codes: StaffCodes.can_manage?(user),
        # D37: the board's History tab, import and export.
        beer_board_manage: Authz.can?(user, :history, :beer_board)
      })
      |> for_viewer(user)
    )
  end
end
