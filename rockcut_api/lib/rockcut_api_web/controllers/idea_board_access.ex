defmodule RockcutApiWeb.IdeaBoardAccess do
  @moduledoc """
  D53 Part 2: the checks every Idea Board controller makes, in the spec's
  order (§4.2, §4.5): the board first (`allow/2`: 403 when this person
  can't), then the id (404 when it isn't on this board), then the lock
  (`change/2`: 423 `locked` when it's locked and they don't manage the
  board). Every decision is `Authz`'s.
  """
  alias RockcutApi.Authz

  def board(conn), do: conn.assigns.idea_board
  def current_user(conn), do: conn.assigns.current_user

  @doc "`:ok`, or `{:error, :forbidden}`: `action` on the board."
  def allow(conn, action) do
    if Authz.can?(current_user(conn), action, {:idea_board, board(conn)}),
      do: :ok,
      else: {:error, :forbidden}
  end

  @doc """
  `:ok` when this person may change `thing` (a list, or a card with its list
  preloaded); `{:error, :forbidden}` without `:write`, `{:error, :locked}`
  when only the lock stops them.
  """
  def change(conn, thing), do: decide(conn, :change, thing)

  @doc "As `change/2`, for archiving a list: also refuses a list holding a locked card."
  def archive_list(conn, list) do
    with :ok <- change(conn, list) do
      case decide(conn, :archive, list) do
        :ok -> :ok
        {:error, :locked} -> {:error, :holds_locked_card}
        error -> error
      end
    end
  end

  defp decide(conn, action, thing) do
    user = current_user(conn)
    board = board(conn)

    cond do
      not Authz.can?(user, :write, {:idea_board, board}) -> {:error, :forbidden}
      Authz.can?(user, action, {:idea_board, board, thing}) -> :ok
      true -> {:error, :locked}
    end
  end

  @doc "`:ok`, or `{:error, :forbidden}`: `action` (`:edit`, `:delete`) on a note."
  def note(conn, action, note) do
    if Authz.can?(current_user(conn), action, {:idea_note, board(conn), note}),
      do: :ok,
      else: {:error, :forbidden}
  end
end
