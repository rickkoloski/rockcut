defmodule RockcutApi.Migrations.CreateIdeaBoardsTest do
  @moduledoc """
  D53 Part 2 §4.1 (`create_idea_boards`, `add_idea_board_starter_lists`):
  every board starts with Ideas, Planned, Doing, Done; down and up again
  work. Run inside the test's transaction (SQLite's DDL is transactional, so
  the rollback at the end puts the schema back).
  """
  use RockcutApi.DataCase, async: false

  alias RockcutApi.IdeaBoards.{Card, IdeaList}

  @tables_version 20_261_108_120_001
  @tables RockcutApi.Repo.Migrations.CreateIdeaBoards
  @starters_version 20_261_108_120_002
  @starters RockcutApi.Repo.Migrations.AddIdeaBoardStarterLists

  @boards ~w(brewery bar office sales company)

  setup_all do
    Code.require_file("priv/repo/migrations/20261108120001_create_idea_boards.exs")
    Code.require_file("priv/repo/migrations/20261108120002_add_idea_board_starter_lists.exs")
    :ok
  end

  defp lists do
    Repo.all(
      from l in IdeaList, order_by: [l.board, l.position], select: {l.board, l.name, l.position}
    )
  end

  defp starters(board),
    do: [{board, "Ideas", 1}, {board, "Planned", 2}, {board, "Doing", 3}, {board, "Done", 4}]

  defp down(version, migration),
    do: assert(:ok = Ecto.Migrator.down(Repo, version, migration, log: false))

  defp up(version, migration),
    do: assert(:ok = Ecto.Migrator.up(Repo, version, migration, log: false))

  test "the five boards have their four starter lists" do
    for board <- @boards do
      assert Enum.filter(lists(), &(elem(&1, 0) == board)) == starters(board)
    end
  end

  test "down drops every table; up makes them and the starter lists again" do
    down(@starters_version, @starters)
    down(@tables_version, @tables)

    for table <- ~w(idea_lists idea_cards idea_card_assignees idea_labels idea_card_labels
                    idea_checklist_items idea_notes idea_card_tasks idea_events idea_watches
                    idea_watch_pending) do
      assert {:error, _} = Repo.query("SELECT * FROM #{table}"), table
    end

    up(@tables_version, @tables)
    up(@starters_version, @starters)

    assert lists() == Enum.flat_map(Enum.sort(@boards), &starters/1)
  end

  test "starter-list down keeps lists in use or added; up again adds none to a board with lists" do
    doing = Repo.get_by!(IdeaList, board: "bar", name: "Doing")
    Repo.insert!(%Card{list_id: doing.id, title: "Taproom remodel", position: 1})
    Repo.insert!(%IdeaList{board: "bar", name: "Fall releases", position: 5})

    down(@starters_version, @starters)

    assert lists() == [{"bar", "Doing", 3}, {"bar", "Fall releases", 5}]

    up(@starters_version, @starters)

    assert Enum.filter(lists(), &(elem(&1, 0) == "bar")) ==
             [{"bar", "Doing", 3}, {"bar", "Fall releases", 5}]

    for board <- @boards -- ["bar"] do
      assert Enum.filter(lists(), &(elem(&1, 0) == board)) == starters(board)
    end
  end
end
