defmodule RockcutApi.Migrations.AddOwnersDepartmentTest do
  @moduledoc """
  D59 §4.1 (`add_owners_department`): the two department flags and the Owners
  row with its starter Idea Board lists; down removes them only while Owners
  is unused, otherwise raises and changes nothing. Run inside the test's
  transaction (SQLite's DDL is transactional, so the rollback at the end puts
  the schema back).
  """
  use RockcutApi.DataCase, async: false

  import RockcutApi.AccountsFixtures

  alias RockcutApi.Accounts.Department
  alias RockcutApi.IdeaBoards.{Card, IdeaList}

  @version 20_261_111_100_001
  @migration RockcutApi.Repo.Migrations.AddOwnersDepartment

  setup_all do
    Code.require_file("priv/repo/migrations/20261111100001_add_owners_department.exs")
    :ok
  end

  defp down, do: assert(:ok = Ecto.Migrator.down(Repo, @version, @migration, log: false))
  defp up, do: assert(:ok = Ecto.Migrator.up(Repo, @version, @migration, log: false))

  defp owners_rows do
    Repo.query!(
      "SELECT name, color, assignable, scheduling, owners_only FROM departments WHERE key = 'owners'"
    ).rows
  end

  defp owners_lists do
    Repo.all(
      from l in IdeaList,
        where: l.board == "owners",
        order_by: l.position,
        select: {l.name, l.position}
    )
  end

  defp columns do
    Repo.query!("SELECT name FROM pragma_table_info('departments')").rows |> List.flatten()
  end

  @starters [{"Ideas", 1}, {"Planned", 2}, {"Doing", 3}, {"Done", 4}]

  test "Owners: slate, assignable, not scheduled, owners only, with the four starter lists" do
    assert owners_rows() == [["Owners", "#37474F", 1, 0, 1]]
    assert owners_lists() == @starters
  end

  test "other departments are scheduled and not owners-only" do
    dept = department_fixture("bar")
    assert %Department{scheduling: true, owners_only: false} = Repo.reload!(dept)
  end

  test "down removes an unused Owners, its lists and the columns; up makes them again" do
    down()

    refute "scheduling" in columns()
    refute "owners_only" in columns()
    assert Repo.query!("SELECT COUNT(*) FROM departments WHERE key = 'owners'").rows == [[0]]
    assert owners_lists() == []

    up()

    assert owners_rows() == [["Owners", "#37474F", 1, 0, 1]]
    assert owners_lists() == @starters
  end

  test "up leaves an existing Owners row and its lists alone" do
    down()

    Repo.query!("""
    INSERT INTO departments (name, key, color, assignable, inserted_at, updated_at)
    VALUES ('Owners', 'owners', '#000000', 1, '2026-01-01T00:00:00', '2026-01-01T00:00:00')
    """)

    Repo.insert!(%IdeaList{board: "owners", name: "Ours", position: 1})

    up()

    assert [["Owners", "#000000", 1, _, _]] = owners_rows()
    assert owners_lists() == [{"Ours", 1}]
  end

  test "down raises while Owners has a member, and changes nothing" do
    owners = Repo.get_by!(Department, key: "owners")
    user = user_fixture()
    add_membership(user, "owners", "employee")

    assert_raise RuntimeError, ~r/Owners department is in use \(memberships \(1\)\)/, fn ->
      Ecto.Migrator.down(Repo, @version, @migration, log: false)
    end

    assert Repo.get(Department, owners.id)
    assert "scheduling" in columns() and "owners_only" in columns()
    assert owners_lists() == @starters
  end

  test "down raises while an Owners Idea Board list has a card" do
    ideas = Repo.get_by!(IdeaList, board: "owners", name: "Ideas")
    Repo.insert!(%Card{list_id: ideas.id, title: "Second taproom", position: 1})

    assert_raise RuntimeError, ~r/Idea Board lists \(1\)/, fn ->
      Ecto.Migrator.down(Repo, @version, @migration, log: false)
    end

    assert owners_lists() == @starters
  end
end
