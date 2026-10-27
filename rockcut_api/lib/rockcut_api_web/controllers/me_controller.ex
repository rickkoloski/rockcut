defmodule RockcutApiWeb.MeController do
  use RockcutApiWeb, :controller

  action_fallback RockcutApiWeb.FallbackController

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
        # D43: the tablet's own setting during "Sign in as me".
        color_mode: Accounts.effective_color_mode(user, conn.assigns[:current_session]),
        # D49: the Brewery board's "Show planned batches".
        show_planned_batches: user.show_planned_batches,
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

  @doc "D43: `PUT /api/me/color_mode` — the person's own theme (people only)."
  def update_color_mode(conn, params) do
    with {:ok, user} <- Accounts.set_color_mode(conn.assigns.current_user, params["color_mode"]) do
      json(conn, %{color_mode: user.color_mode})
    end
  end

  @doc "D49: `PUT /api/me/show_planned_batches` — `{ show_planned_batches }` (people only)."
  def update_show_planned_batches(conn, params) do
    with {:ok, user} <-
           Accounts.set_show_planned_batches(
             conn.assigns.current_user,
             params["show_planned_batches"]
           ) do
      json(conn, %{show_planned_batches: user.show_planned_batches})
    end
  end
end
