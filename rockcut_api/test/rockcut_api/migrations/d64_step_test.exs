defmodule RockcutApi.Migrations.D64StepTest do
  @moduledoc """
  D64 Stop 3 migrations run for real (plan migrations 11–12, spec §4.8,
  A10), on a database file of its own: the step's `yeast_outcome` and
  `yeast_note`; the not-retired "Yeast harvest" step type (any case) gets
  the `yeast_harvest` behavior and becomes built in; with none (renamed or
  retired) it stops, naming what it found, with nothing changed; pre-brew
  template and batch steps of that type are logged; `down` puts it back.
  """
  use ExUnit.Case, async: false

  import ExUnit.CaptureLog

  alias RockcutApi.Repo

  @before 20_261_122_120_010
  @columns 20_261_122_120_011
  @last 20_261_122_120_012
  @now "2026-11-21T12:00:00Z"

  setup do
    path = Path.join(System.tmp_dir!(), "rockcut_d64s3_#{System.unique_integer([:positive])}.db")

    {:ok, pid} =
      Repo.start_link(
        name: nil,
        database: path,
        pool: DBConnection.ConnectionPool,
        pool_size: 1,
        log: false
      )

    previous = Repo.put_dynamic_repo(pid)

    on_exit(fn ->
      Repo.put_dynamic_repo(previous)
      for f <- [path, path <> "-wal", path <> "-shm"], do: File.rm(f)
    end)

    migrate(:up, to: @before)
    :ok
  end

  defp migrations do
    for file <-
          Path.wildcard(Application.app_dir(:rockcut_api, "priv/repo/migrations/*.exs"))
          |> Enum.sort() do
      [version | _] = file |> Path.basename() |> String.split("_", parts: 2)
      [_, name] = Regex.run(~r/defmodule\s+([\w.]+)/, File.read!(file))
      module = Module.concat([name])
      unless Code.ensure_loaded?(module), do: Code.require_file(file)
      {String.to_integer(version), module}
    end
  end

  defp migrate(direction, opts) do
    Ecto.Migrator.run(
      Repo,
      migrations(),
      direction,
      Keyword.merge([log: false, log_migrations_sql: false, log_migrator_sql: false], opts)
    )
  end

  defp insert!(table, row) do
    row = Map.merge(%{"inserted_at" => @now, "updated_at" => @now}, row)
    columns = Map.keys(row)

    Repo.query!(
      "INSERT INTO #{table} (#{Enum.join(columns, ", ")}) VALUES " <>
        "(#{Enum.map_join(columns, ", ", fn _ -> "?" end)})",
      Enum.map(columns, &Map.fetch!(row, &1))
    )

    %{rows: [[id]]} = Repo.query!("SELECT last_insert_rowid()")
    id
  end

  defp rows(sql, params \\ []), do: Repo.query!(sql, params).rows

  defp harvest_type,
    do:
      rows(
        "SELECT name, behavior, built_in, retired_at FROM production_step_types " <>
          "WHERE lower(name) LIKE '%harvest%' ORDER BY id"
      )

  test "migration 11: the step's yeast_outcome and yeast_note" do
    migrate(:up, to: @columns)
    columns = rows("SELECT name FROM pragma_table_info('production_steps')") |> List.flatten()
    assert "yeast_outcome" in columns and "yeast_note" in columns
  end

  test "the seeded Yeast harvest becomes yeast_harvest and built in; down puts it back" do
    assert harvest_type() == [["Yeast harvest", "plain", 0, nil]]
    migrate(:up, to: @last)
    assert harvest_type() == [["Yeast harvest", "yeast_harvest", 1, nil]]

    migrate(:down, to: @last)
    assert harvest_type() == [["Yeast harvest", "plain", 0, nil]]
  end

  test "renamed in any case, it's still found by lower(name)" do
    Repo.query!(
      "UPDATE production_step_types SET name = 'YEAST HARVEST' WHERE name = 'Yeast harvest'"
    )

    migrate(:up, to: @last)
    assert harvest_type() == [["YEAST HARVEST", "yeast_harvest", 1, nil]]
  end

  test "renamed: it stops, naming what it found, and changes nothing (A10)" do
    Repo.query!(
      "UPDATE production_step_types SET name = 'Harvest yeast' WHERE name = 'Yeast harvest'"
    )

    migrate(:up, to: @columns)

    error = assert_raise RuntimeError, fn -> migrate(:up, to: @last) end
    assert error.message =~ ~s|no step type named "Yeast harvest"|
    assert error.message =~ ~s|"Harvest yeast" (plain)|
    assert harvest_type() == [["Harvest yeast", "plain", 0, nil]]
    refute @last in List.flatten(rows("SELECT version FROM schema_migrations"))
  end

  test "retired: it stops too, saying so" do
    Repo.query!(
      "UPDATE production_step_types SET retired_at = ? WHERE name = 'Yeast harvest'",
      [@now]
    )

    migrate(:up, to: @columns)
    error = assert_raise RuntimeError, fn -> migrate(:up, to: @last) end
    assert error.message =~ ~s|"Yeast harvest" (plain, retired)|
    assert [["Yeast harvest", "plain", 0, _]] = harvest_type()
  end

  test "pre-brew template steps and batch steps of that type are logged, and kept" do
    [[type_id]] = rows("SELECT id FROM production_step_types WHERE name = 'Yeast harvest'")
    template = insert!("process_templates", %{"name" => "Early harvest"})

    template_step =
      insert!("template_steps", %{
        "template_id" => template,
        "step_type_id" => type_id,
        "day_offset" => -2
      })

    brand = insert!("brands", %{"name" => "Galactic", "status" => "active"})
    batch = insert!("batches", %{"brand_id" => brand, "status" => "planned"})

    step =
      insert!("production_steps", %{
        "batch_id" => batch,
        "step_type_id" => type_id,
        "due_on" => "2026-11-20",
        "pre_brew" => 1
      })

    log = capture_log(fn -> migrate(:up, to: @last) end)

    assert log =~
             ~s|template "Early harvest" has a pre-brew Yeast harvest step (template step #{template_step}, day -2)|

    assert log =~
             "batch #{batch} has a pre-brew Yeast harvest step (step #{step}, due 2026-11-20)"

    assert rows("SELECT pre_brew FROM production_steps WHERE id = ?", [step]) == [[1]]
  end
end
