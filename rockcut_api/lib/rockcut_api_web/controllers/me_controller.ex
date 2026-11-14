defmodule RockcutApiWeb.MeController do
  use RockcutApiWeb, :controller

  action_fallback RockcutApiWeb.FallbackController

  import RockcutApiWeb.JSONHelpers,
    only: [me: 3, for_viewer: 2, task_board_entry: 1, idea_board_entry: 1]

  alias RockcutApi.{Accounts, Authz, IdeaBoards, StaffCodes, Tasks}
  alias RockcutApi.Accounts.Department

  def show(conn, _params) do
    user = conn.assigns.current_user

    json(
      conn,
      me(user, Accounts.capabilities(user), %{
        shared_devices: Accounts.shared_devices?(user),
        staff_codes: StaffCodes.can_manage?(user),
        # D37: the board's History tab, import and export.
        beer_board_manage: Authz.can?(user, :history, :beer_board),
        color_mode: user.color_mode,
        # D49: the Brewery board's "Show planned batches".
        show_planned_batches: user.show_planned_batches,
        # D58 §3.1: the stored board settings; the UI fills in the defaults.
        board_settings: user.board_settings,
        # D41: the boards this person can open, in nav order.
        # Owners also get the All departments view, last.
        task_boards:
          Enum.map(Tasks.boards_for(user), &task_board_entry/1) ++
            if(Authz.can?(user, :read, {:tasks, :all}),
              do: [%{key: "all", name: "All departments", manage: false}],
              else: []
            ),
        # D53 Part 2: the Idea Boards this person (or tablet) can open,
        # departments then Company.
        idea_boards: Enum.map(IdeaBoards.boards_for(user), &idea_board_entry/1)
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

  @doc """
  D58 §3.1: `PUT /api/me/board_settings/:board` — some of a board's settings
  (`span`, `hide_completed`, `hide_shifts`, `first_day`, `view`,
  `phone_view`) for this account, merged into the rest. Answers the board's
  settings with the defaults filled in. `:board` is a department's key or
  `all`; an unknown one is 404, one this account can't save 403 (a device:
  its home board only, no staff code). D56 decision 18: `production` is the
  Gantt's view (`expanded`, `label_by`), for whoever reads the schedule.
  """
  def update_board_settings(conn, %{"board" => key}) do
    user = conn.assigns.current_user

    with {:ok, board} <- settings_board(key),
         :ok <- allow_settings(user, board),
         {:ok, settings} <- Accounts.save_board_settings(user, key, conn.body_params) do
      json(conn, settings)
    else
      {:error, :forbidden} -> conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
      error -> error
    end
  end

  defp settings_board("all"), do: {:ok, :all}
  defp settings_board("production"), do: {:ok, :production}

  defp settings_board(key) do
    case Accounts.get_department_by_key(key) do
      %Department{assignable: true} = dept -> {:ok, dept}
      _ -> {:error, :not_found}
    end
  end

  defp allow_settings(user, board) do
    if Authz.can?(user, :save, {:board_settings, board}), do: :ok, else: {:error, :forbidden}
  end
end
