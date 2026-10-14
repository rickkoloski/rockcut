defmodule RockcutApi.Migrations.TaskEventsDepartmentTest do
  @moduledoc """
  D41 migration 2 (`add_department_id_to_task_events`): the backfill. Run
  down and up again inside the test's transaction (SQLite's DDL is
  transactional, so the rollback at the end puts the schema back), with
  events written the pre-D41 way, with no department.
  """
  use RockcutApi.DataCase, async: false

  import RockcutApi.AccountsFixtures

  @version 20_261_016_120_002
  @migration RockcutApi.Repo.Migrations.AddDepartmentIdToTaskEvents

  setup_all do
    Code.require_file("priv/repo/migrations/20261016120002_add_department_id_to_task_events.exs")
    :ok
  end

  defp sql!(statement, params \\ []), do: Repo.query!(statement, params).rows

  test "an event takes its task's department; one with no task, or a deleted task, the Brewery's" do
    brewery = department_fixture("brewery")
    bar = department_fixture("bar")
    office = department_fixture("office")
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    task = fn dept ->
      Repo.insert!(%RockcutApi.Tasks.Task{department_id: dept.id, title: "T", position: 1}).id
    end

    {bar_task, office_task} = {task.(bar), task.(office)}

    assert :ok = Ecto.Migrator.down(Repo, @version, @migration, log: false)
    refute "department_id" in Enum.map(sql!("PRAGMA table_info(task_events)"), &Enum.at(&1, 1))

    for {task_id, action} <- [
          {bar_task, "created"},
          {office_task, "created"},
          {999_999, "deleted"},
          {nil, "item_added"}
        ] do
      sql!(
        "INSERT INTO task_events (task_id, action, title, detail, inserted_at) VALUES (?, ?, 'T', '{}', ?)",
        [task_id, action, now]
      )
    end

    assert :ok = Ecto.Migrator.up(Repo, @version, @migration, log: false)

    assert sql!("SELECT task_id, department_id FROM task_events ORDER BY id") == [
             [bar_task, bar.id],
             [office_task, office.id],
             [999_999, brewery.id],
             [nil, brewery.id]
           ]

    assert [["task_events_department_id_inserted_at_index"]] =
             sql!(
               "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'task_events_department_id_inserted_at_index'"
             )
  end
end
