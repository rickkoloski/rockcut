defmodule RockcutApi.Migrations.CreateTaskAssigneesTest do
  @moduledoc """
  D53 §3.1 (`create_task_assignees`): the backfill gives each task and series
  one row from `assignee_id` at position 0, and nothing for the unassigned.
  Run down and up inside the test's transaction, on rows written with the old
  column only, as a database from before the migration has them.
  """
  use RockcutApi.DataCase, async: false

  import RockcutApi.AccountsFixtures

  alias RockcutApi.Tasks.{Task, TaskSeries}

  @version 20_261_106_120_001
  @migration RockcutApi.Repo.Migrations.CreateTaskAssignees

  setup_all do
    Code.require_file("priv/repo/migrations/20261106120001_create_task_assignees.exs")
    :ok
  end

  defp rows(table) do
    Repo.query!("SELECT * FROM #{table} ORDER BY 1").rows
    |> Enum.map(fn [id, user_id, position, _inserted_at] -> {id, user_id, position} end)
  end

  test "backfills assignee_id at position 0; down drops the tables and keeps the column" do
    dept = department_fixture("brewery", "Brewery")
    user = user_fixture()

    series =
      Repo.insert!(%TaskSeries{
        department_id: dept.id,
        title: "Keg wash",
        frequency: "weekly",
        interval: 1,
        weekdays: [3],
        start_date: ~D[2026-11-04],
        assignee_id: user.id
      })

    open =
      Repo.insert!(%TaskSeries{
        department_id: dept.id,
        title: "Nobody's",
        frequency: "weekly",
        interval: 1,
        weekdays: [3],
        start_date: ~D[2026-11-04]
      })

    exception =
      Repo.insert!(%Task{
        department_id: dept.id,
        title: "Changed on its own",
        due_on: ~D[2026-11-05],
        position: 1,
        series_id: series.id,
        series_date: ~D[2026-11-04],
        series_exception: true,
        assignee_id: user.id
      })

    Repo.insert!(%Task{department_id: dept.id, title: "Nobody's", due_on: nil, position: 1})

    assert :ok = Ecto.Migrator.down(Repo, @version, @migration, log: false)
    assert Repo.get!(Task, exception.id).assignee_id == user.id

    assert {:error, _} = Repo.query("SELECT * FROM task_assignees")
    assert :ok = Ecto.Migrator.up(Repo, @version, @migration, log: false)

    assert rows("task_assignees") == [{exception.id, user.id, 0}]
    assert rows("task_series_assignees") == [{series.id, user.id, 0}]
    refute Enum.any?(rows("task_series_assignees"), fn {id, _, _} -> id == open.id end)
  end
end
