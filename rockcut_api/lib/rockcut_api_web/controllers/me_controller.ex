defmodule RockcutApiWeb.MeController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [me: 3, for_viewer: 2, task_board_entry: 1]
  alias RockcutApi.{Accounts, Authz, StaffCodes, Tasks}

  def show(conn, _params) do
    user = conn.assigns.current_user

    json(
      conn,
      me(user, Accounts.capabilities(user), %{
        shared_devices: Accounts.shared_devices?(user),
        staff_codes: StaffCodes.can_manage?(user),
        # D37: the board's History tab, import and export.
        beer_board_manage: Authz.can?(user, :history, :beer_board),
        # D41: the boards this person can open, in nav order.
        task_boards: user |> Tasks.boards_for() |> Enum.map(&task_board_entry/1),
        # D38: the Brewery board's History and Edit Daily items. Kept until
        # the UI reads `task_boards` (D41 step 4).
        brewery_tasks_manage: brewery_manage?(user)
      })
      |> for_viewer(user)
    )
  end

  defp brewery_manage?(user) do
    case Accounts.get_department_by_key("brewery") do
      nil -> false
      brewery -> Authz.can?(user, :history, {:tasks, brewery})
    end
  end
end
