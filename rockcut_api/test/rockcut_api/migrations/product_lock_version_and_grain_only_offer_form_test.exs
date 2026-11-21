defmodule RockcutApi.Migrations.ProductLockVersionAndGrainOnlyOfferFormTest do
  @moduledoc """
  D62 lead decisions 1 (`product_lock_version_and_grain_only_offer_form`,
  gaps 3 and 9) run for real. It rebuilds `supplier_offers` with foreign
  keys off, which SQLite can't do inside a transaction, so unlike the other
  migration tests it runs on a database file of its own (every migration up
  to before it), not in the sandbox. Up: the grain offers keep their form,
  the hop offer's is null, nothing pointing at an offer is lost (its prices,
  an order line, a product's reorder offer; the prices would cascade away
  with the old table if foreign keys were on) and products get
  `lock_version` 1. Down: the hop offer is "whole" again under NOT NULL and
  `lock_version` is gone.
  """
  use ExUnit.Case, async: false

  alias RockcutApi.Repo

  @version 20_261_120_140_001
  @before 20_261_120_120_001
  @now "2026-11-20T12:00:00Z"

  setup do
    path =
      Path.join(System.tmp_dir!(), "rockcut_migration_#{System.unique_integer([:positive])}.db")

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
    %{pid: pid}
  end

  # Every migration as `{version, module}`, using the modules `ecto.migrate`
  # already loaded (compiling the files again would only warn that each is
  # redefined); a file not loaded yet is required once.
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

  defp column(table, name) do
    Repo.query!("SELECT name, \"notnull\" FROM pragma_table_info('#{table}') WHERE name = ?", [
      name
    ]).rows
  end

  defp forms do
    Repo.query!("SELECT id, form FROM supplier_offers ORDER BY id").rows
  end

  test "hop offers lose their form, grain keeps it, nothing pointing at an offer is lost" do
    grains = insert!("ingredient_categories", %{"name" => "Grains", "key" => "grains"})
    base = insert!("ingredient_categories", %{"name" => "Base", "parent_id" => grains})
    hops = insert!("ingredient_categories", %{"name" => "Hops", "key" => "hops"})
    rahr = insert!("parties", %{"name" => "Rahr"})
    ych = insert!("parties", %{"name" => "YCH"})
    two_row = insert!("ingredients", %{"name" => "2-Row", "category_id" => base})
    citra = insert!("ingredients", %{"name" => "Citra", "category_id" => hops})

    grain =
      insert!("ingredient_products", %{
        "ingredient_id" => two_row,
        "manufacturer_party_id" => rahr
      })

    hop =
      insert!("ingredient_products", %{
        "ingredient_id" => citra,
        "manufacturer_party_id" => ych,
        "form" => "T90 Pellet"
      })

    offer = fn product, supplier, form, pack, size ->
      insert!("supplier_offers", %{
        "product_id" => product,
        "supplier_party_id" => supplier,
        "pack_name" => pack,
        "pack_size" => size,
        "form" => form
      })
    end

    whole = offer.(grain, rahr, "whole", "sack", 55)
    milled = offer.(grain, rahr, "milled", "sack", 50)
    box = offer.(hop, ych, "whole", "box", 11)

    for o <- [whole, milled, box] do
      insert!("supplier_offer_prices", %{
        "offer_id" => o,
        "price_per_pack" => 10,
        "effective_on" => "2026-01-01"
      })
    end

    order =
      insert!("purchase_orders", %{"supplier_party_id" => ych, "ordered_on" => "2026-11-19"})

    insert!("purchase_order_lines", %{
      "order_id" => order,
      "offer_id" => box,
      "packs_ordered" => 3,
      "price_per_pack" => 165
    })

    Repo.query!("UPDATE ingredient_products SET reorder_offer_id = ? WHERE id = ?", [box, hop])

    assert [_] = migrate(:up, to: @version)

    assert forms() == [[whole, "whole"], [milled, "milled"], [box, nil]]
    assert column("supplier_offers", "form") == [["form", 0]]
    assert Repo.query!("SELECT count(*) FROM supplier_offer_prices").rows == [[3]]
    assert Repo.query!("SELECT offer_id FROM purchase_order_lines").rows == [[box]]

    assert Repo.query!("SELECT reorder_offer_id FROM ingredient_products WHERE id = ?", [hop]).rows ==
             [[box]]

    assert Repo.query!("SELECT DISTINCT lock_version FROM ingredient_products").rows == [[1]]
    assert Repo.query!("PRAGMA foreign_key_check").rows == []

    # The foreign keys are on again and still point at the rebuilt table.
    assert_raise Exqlite.Error, fn ->
      Repo.query!("DELETE FROM supplier_offers WHERE id = ?", [box])
    end

    assert [_] = migrate(:down, step: 1)

    assert forms() == [[whole, "whole"], [milled, "milled"], [box, "whole"]]
    assert column("supplier_offers", "form") == [["form", 1]]
    assert column("ingredient_products", "lock_version") == []
    assert Repo.query!("SELECT count(*) FROM supplier_offer_prices").rows == [[3]]
  end
end
