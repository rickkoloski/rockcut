defmodule RockcutApi.Migrations.D64BrinksTest do
  @moduledoc """
  D64 Stop 2 migrations run for real (plan migrations 5–10), on a database
  file of its own: YB1–YB4 seeded once; one `in_brink` record per brink and
  one open Count / Clean task per brink and kind (the partial unique
  indexes); `down` takes them away.
  """
  use ExUnit.Case, async: false


  alias RockcutApi.Repo

  @before 20_261_122_120_004
  @last 20_261_122_120_010
  @now "2026-11-21T12:00:00Z"

  setup do
    path = Path.join(System.tmp_dir!(), "rockcut_d64_#{System.unique_integer([:positive])}.db")

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

  test "YB1–YB4 are seeded once, clean, with no empty weight" do
    migrate(:up, to: @last)

    assert rows(
             "SELECT name, position, active, dirty, empty_weight_lb FROM yeast_brinks ORDER BY position"
           ) ==
             [
               ["YB1", 0, 1, 0, nil],
               ["YB2", 1, 1, 0, nil],
               ["YB3", 2, 1, 0, nil],
               ["YB4", 3, 1, 0, nil]
             ]

    migrate(:down, to: 20_261_122_120_005)
    assert rows("SELECT count(*) FROM sqlite_master WHERE name = 'yeast_brinks'") == [[0]]
    migrate(:up, to: @last)
    assert rows("SELECT count(*) FROM yeast_brinks") == [[4]]

    assert_raise Exqlite.Error, fn ->
      insert!("yeast_brinks", %{"name" => "yb2"})
    end
  end

  test "one in_brink record per brink; any number emptied" do
    migrate(:up, to: @last)
    [[yb1]] = rows("SELECT id FROM yeast_brinks WHERE name = 'YB1'")
    insert!("yeast_harvests", %{"brink_id" => yb1, "status" => "emptied"})
    insert!("yeast_harvests", %{"brink_id" => yb1, "status" => "emptied"})
    insert!("yeast_harvests", %{"brink_id" => yb1, "status" => "in_brink"})

    assert_raise Exqlite.Error, fn ->
      insert!("yeast_harvests", %{"brink_id" => yb1, "status" => "in_brink"})
    end
  end

  test "one open Count and one open Clean task per brink; a done one doesn't count" do
    migrate(:up, to: @last)
    [[yb1]] = rows("SELECT id FROM yeast_brinks WHERE name = 'YB1'")
    dept = insert!("departments", %{"name" => "Brewery", "key" => "brewery"})

    task =
      &insert!(
        "tasks",
        Map.merge(
          %{
            "title" => "Count YB1",
            "department_id" => dept,
            "yeast_brink_id" => yb1,
            "yeast_kind" => "recount"
          },
          &1
        )
      )

    task.(%{"completed_at" => @now})
    task.(%{})

    insert!("tasks", %{
      "title" => "Clean YB1",
      "department_id" => dept,
      "yeast_brink_id" => yb1,
      "yeast_kind" => "clean"
    })

    assert_raise Exqlite.Error, fn -> task.(%{}) end
  end
end
