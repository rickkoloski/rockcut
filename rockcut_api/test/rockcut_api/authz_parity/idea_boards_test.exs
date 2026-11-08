defmodule RockcutApi.AuthzParity.IdeaBoardsTest do
  @moduledoc """
  D31 parity, D53 Part 2 rows: the Idea Boards (`{:idea_board, board}`,
  spec §4.2 and §4.5). A department board: its members, of any role, read
  and write; its managers also manage (lock, change locked things, delete
  archived, rename and delete labels) and see History. The Company board:
  every active person reads and writes; only owners manage it or see its
  History. Owners: everything everywhere. Locks (`:change`): `:write`, and
  while locked (the list, or the card or its list) also `:manage`. Notes:
  the author edits (owners included), the author or a manager deletes.
  Devices: `authz_device_test` and the route matrices.
  """
  use RockcutApiWeb.ConnCase

  import RockcutApi.PersonaFixtures

  alias RockcutApi.{Authz, IdeaBoards}
  alias RockcutApi.IdeaBoards.{Card, IdeaList, Note}

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

  @boards ~w(brewery bar office sales company)

  setup do
    %{p: personas()}
  end

  defp allowed?(:owner, _board, _level), do: true
  defp allowed?(_roles, "company", level), do: level == :write
  defp allowed?(roles, board, :write), do: Map.has_key?(roles, board)
  defp allowed?(roles, board, :manage), do: roles[board] == :manager

  @locked ~U[2026-11-02 15:00:00Z]

  for {who, roles} <- @people, board <- @boards do
    test "D53 #{who} on the #{board} Idea Board", %{p: p} do
      user = p[unquote(who)]
      roles = unquote(Macro.escape(roles))
      board = IdeaBoards.board_for_key(unquote(board))
      key = unquote(board)
      write? = allowed?(roles, key, :write)
      manage? = allowed?(roles, key, :manage)
      res = {:idea_board, board}

      assert Authz.can?(user, :read, res) == write?
      assert Authz.can?(user, :write, res) == write?
      assert Authz.can?(user, :manage, res) == manage?
      assert Authz.can?(user, :history, res) == manage?

      open_list = %IdeaList{board: key}
      locked_list = %IdeaList{board: key, locked_at: @locked}

      assert Authz.can?(user, :change, {:idea_board, board, open_list}) == write?
      assert Authz.can?(user, :change, {:idea_board, board, locked_list}) == manage?

      assert Authz.can?(user, :change, {:idea_board, board, %Card{list: open_list}}) == write?

      for locked_card <- [
            %Card{list: open_list, locked_at: @locked},
            %Card{list: locked_list}
          ],
          do: assert(Authz.can?(user, :change, {:idea_board, board, locked_card}) == manage?)

      # Notes: the author edits (owners too only their own); the author or a
      # manager deletes.
      own = %Note{author_id: user.id}
      other = %Note{author_id: -1}
      assert Authz.can?(user, :edit, {:idea_note, board, own}) == write?
      refute Authz.can?(user, :edit, {:idea_note, board, other})
      assert Authz.can?(user, :delete, {:idea_note, board, own}) == write?
      assert Authz.can?(user, :delete, {:idea_note, board, other}) == manage?
    end
  end

  test "D53 a deactivated person has no Company board", %{p: p} do
    refute Authz.can?(%{p["noDept"] | active: false}, :read, {:idea_board, :company})
  end
end
