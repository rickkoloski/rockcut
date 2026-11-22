defmodule RockcutApi.Migrations.D65FeaturesAndPackNoteTest do
  @moduledoc """
  D65 Stop 2 migration (`d65_features_and_pack_note`, plan migrations 1, 2
  and 4) on a database file of its own, shaped like Stop 1: Brix and the
  seven ions, extract at 2 decimals, `only_form`, Fruits' and Sugars'
  feature rows, `supplier_offers.pack_note`. A second run changes nothing;
  `down` takes it all back.
  """
  use ExUnit.Case, async: false

  alias RockcutApi.Repo

  @before 20_261_121_120_003
  @version 20_261_121_130_001
  @now "2026-11-21T12:00:00Z"

  setup do
    path = Path.join(System.tmp_dir!(), "rockcut_d65s2_#{System.unique_integer([:positive])}.db")

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

    for {name, key} <- [
          {"Grains", "grains"},
          {"Fruits", "fruits"},
          {"Sugars and Extracts", "sugars"}
        ] do
      Repo.query!(
        "INSERT INTO ingredient_categories (name, key, inserted_at, updated_at) VALUES (?, ?, ?, ?)",
        [name, key, @now, @now]
      )
    end

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

  defp rows(sql), do: Repo.query!(sql).rows

  defp snapshot do
    %{
      types: rows("SELECT key, unit_label, min, max, decimals FROM feature_types ORDER BY key"),
      rows:
        rows("""
        SELECT c.key, f.key, a.product_mode, a.lot_mode, a.lot_required, a.only_form, a.sort_order
        FROM category_feature_types a
        JOIN ingredient_categories c ON c.id = a.category_id
        JOIN feature_types f ON f.id = a.feature_type_id
        ORDER BY c.key, f.key
        """),
      columns:
        rows("SELECT name FROM pragma_table_info('supplier_offers') WHERE name = 'pack_note'")
    }
  end

  test "up adds the types, extract's 2 decimals, only_form, the D65 rows and pack_note; again changes nothing; down undoes it" do
    assert [_] = migrate(:up, to: @version)
    s = snapshot()

    assert ["brix", "°Bx", 0, 100, 1] in s.types

    for ion <- ~w(ca mg co3 hco3 so4 na cl),
        do: assert(["#{ion}_ppm_per_g_gal", "ppm @ 1 g/gal", 0, 1000, 1] in s.types)

    assert ["extract_fgdb", "% FGDB", 0, 100, 2] in s.types

    assert s.rows == [
             ["fruits", "brix", "range", "enter", 0, nil, 0],
             ["sugars", "brix", "none", "enter", 0, "Liquid", 1],
             ["sugars", "extract_fgdb", "value", "copy", 0, nil, 0]
           ]

    assert s.columns == [["pack_note"]]

    Repo.query!("DELETE FROM schema_migrations WHERE version = ?", [@version])
    assert [_] = migrate(:up, to: @version)
    assert snapshot() == s

    assert [_] = migrate(:down, step: 1)
    types = rows("SELECT key, unit_label, min, max, decimals FROM feature_types ORDER BY key")
    refute Enum.any?(types, fn [key | _] -> key == "brix" end)
    assert ["extract_fgdb", "% FGDB", 0, 100, 1] in types
    assert rows("SELECT count(*) FROM category_feature_types") == [[0]]

    assert rows(
             "SELECT count(*) FROM pragma_table_info('supplier_offers') WHERE name = 'pack_note'"
           ) == [[0]]

    assert rows(
             "SELECT count(*) FROM pragma_table_info('category_feature_types') WHERE name = 'only_form'"
           ) == [[0]]
  end
end
