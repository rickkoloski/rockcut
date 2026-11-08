defmodule RockcutApiWeb.IdeaBoardController do
  @moduledoc """
  Idea Boards (D53 Part 2 §4.3): `GET /api/idea_boards` (the boards this
  person can open) and the reads under `/api/idea_boards/:board`. The
  `IdeaBoard` plug puts the board in `conn.assigns.idea_board`.

  Every action asks `Authz` about the board **before** any id (§4.2): a
  board this person can't open is 403 on every route; a card id from
  another board is 404. `:read` on `{:idea_board, board}` for the board, the
  card and its labels; `:history` for the change log. "Archived" is
  `:read` too (anyone on the board restores). A shared tablet reads its home
  board and Company (`Authz.Device`); History and Archived are people-only
  routes.
  """
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers,
    only: [
      idea_board_entry: 1,
      idea_board: 1,
      idea_card: 1,
      idea_label: 1,
      idea_archived: 1,
      idea_event: 1,
      for_viewer: 2
    ]

  alias RockcutApi.{Authz, IdeaBoards}
  alias RockcutApiWeb.IdeaBoardErrors

  action_fallback RockcutApiWeb.FallbackController

  @doc "GET /api/idea_boards: the boards I can open, departments then Company."
  def index(conn, _params) do
    json(conn, %{data: Enum.map(IdeaBoards.boards_for(current_user(conn)), &idea_board_entry/1)})
  end

  @doc "GET /api/idea_boards/:board/lists: the board (lists with card faces, labels)."
  def lists(conn, _params) do
    with :ok <- allow(conn, :read) do
      reply(conn, %{data: idea_board(IdeaBoards.board(board(conn), current_user(conn)))})
    end
    |> IdeaBoardErrors.handle(conn)
  end

  @doc "GET /api/idea_boards/:board/cards/:id: one card, for its dialog."
  def card(conn, %{"id" => id}) do
    with :ok <- allow(conn, :read),
         {:ok, card} <- IdeaBoards.get_card(board(conn), id, current_user(conn)) do
      reply(conn, %{data: idea_card(card)})
    end
    |> IdeaBoardErrors.handle(conn)
  end

  @doc "GET /api/idea_boards/:board/labels: the board's labels, in order."
  def labels(conn, _params) do
    with :ok <- allow(conn, :read) do
      json(conn, %{data: Enum.map(IdeaBoards.labels(board(conn)), &idea_label/1)})
    end
    |> IdeaBoardErrors.handle(conn)
  end

  @doc "GET /api/idea_boards/:board/archived: archived lists and cards."
  def archived(conn, _params) do
    with :ok <- allow(conn, :read) do
      json(conn, %{data: idea_archived(IdeaBoards.archived(board(conn)))})
    end
    |> IdeaBoardErrors.handle(conn)
  end

  @doc "GET /api/idea_boards/:board/history?page=&card_id=: the change log, newest first."
  def history(conn, params) do
    with :ok <- allow(conn, :history) do
      card_id = int_param(params["card_id"], nil)
      page = max(int_param(params["page"], 1), 1)

      %{events: events, page: page, total: total, names: names} =
        IdeaBoards.list_events(board(conn), card_id, page)

      json(conn, %{
        data: Enum.map(events, &idea_event/1),
        names: names,
        page: page,
        total: total,
        per_page: IdeaBoards.history_page_size()
      })
    end
    |> IdeaBoardErrors.handle(conn)
  end

  defp allow(conn, action) do
    if Authz.can?(current_user(conn), action, {:idea_board, board(conn)}),
      do: :ok,
      else: {:error, :forbidden}
  end

  defp reply(conn, body), do: json(conn, for_viewer(body, current_user(conn)))

  defp board(conn), do: conn.assigns.idea_board
  defp current_user(conn), do: conn.assigns.current_user

  defp int_param(nil, default), do: default

  defp int_param(value, default) do
    case Integer.parse(to_string(value)) do
      {n, ""} -> n
      _ -> default
    end
  end
end
