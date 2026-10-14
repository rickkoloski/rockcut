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
        # Owners also get the All departments view, last.
        task_boards:
          Enum.map(Tasks.boards_for(user), &task_board_entry/1) ++
            if(Authz.can?(user, :read, {:tasks, :all}),
              do: [%{key: "all", name: "All departments", manage: false}],
              else: []
            )
      })
      |> for_viewer(user)
    )
  end
end
