defmodule RockcutApi.AuthzParity.TaskBoardsTest do
  @moduledoc """
  D31 parity, D41 rows: the task boards, one per assignable department
  (`/api/boards/:dept`). A department's members, of any role, read and write
  its board; its managers also get History and change its Daily items; owners
  get every board; everyone else is 403. The boards aren't tied to the
  Brewery module any more. Devices: 403 on every board route (the route
  matrix, `device_route_matrix_test`).
  """
  use RockcutApiWeb.ConnCase

  import RockcutApi.PersonaFixtures

  # {persona, %{board => :member | :manager}}, as the personas have them.
  @people [
    {"owner", :owner},
    {"owner2", :owner},
    {"breweryMgr", %{"brewery" => :manager}},
    {"brewer1", %{"brewery" => :member}},
    {"barMgr", %{"bar" => :manager}},
    {"bartender1", %{"bar" => :member}},
    {"floater", %{"bar" => :member, "brewery" => :member}},
    {"splitRole", %{"bar" => :manager, "brewery" => :member}},
    {"dualMgr", %{"bar" => :manager, "office" => :manager}},
    {"office1", %{"office" => :member}},
    {"sales1", %{"sales" => :member}},
    {"noDept", %{}}
  ]

  setup do
    %{p: personas()}
  end

  defp expected(:owner, _board, _level), do: 200
  defp expected(roles, board, :read), do: if(Map.has_key?(roles, board), do: 200, else: 403)
  defp expected(roles, board, :manage), do: if(roles[board] == :manager, do: 200, else: 403)

  for {who, roles} <- @people, board <- ~w(brewery bar office sales) do
    test "D41 #{who} on the #{board} board: read, History, Daily items", %{p: p} do
      user = p[unquote(who)]
      roles = unquote(Macro.escape(roles))
      board = unquote(board)
      base = "/api/boards/#{board}"

      assert status(user, :get, base <> "/daily_items") == expected(roles, board, :read)
      assert status(user, :get, base <> "/tasks/history") == expected(roles, board, :manage)

      # The list's own order: a no-op for a manager, refused for anyone else.
      ids =
        RockcutApi.Tasks.list_items(RockcutApi.TaskFixtures.task_board(board))
        |> Enum.map(& &1.id)

      assert status(user, :put, base <> "/daily_items/order", %{ids: ids}) ==
               expected(roles, board, :manage)
    end
  end

  # D41 §3.6: the All departments view, owners only (`{:tasks, :all}`).
  for {who, roles} <- @people do
    test "D41 #{who} on the All departments view", %{p: p} do
      user = p[unquote(who)]
      today = Date.to_iso8601(RockcutApi.Tasks.today())
      expected = if unquote(Macro.escape(roles)) == :owner, do: 200, else: 403

      assert status(user, :get, "/api/boards/all/tasks", %{from: today, to: today}) == expected
      assert RockcutApi.Authz.can?(user, :read, {:tasks, :all}) == (expected == 200)
    end
  end
end
