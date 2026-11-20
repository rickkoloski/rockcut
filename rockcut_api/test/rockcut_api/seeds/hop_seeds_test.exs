defmodule RockcutApi.Seeds.HopSeedsTest do
  @moduledoc """
  D62 §7 and the hop Amendments: `seeds/hop_reference.exs` (through
  `priv/repo/seeds.exs`) twice gives the same rows: 27 hop products with
  their ranges and one box · 11 lb offer each, and Matt's cooler list as 28
  lots with alpha, crop year and an Opening amount (409.6 lb in all). A lot
  already there is never topped up; an edit made on the screens sticks.
  """
  # Not async: seeds.exs runs the synthetic setup (global env reads).
  use RockcutApi.DataCase, async: false

  import Ecto.Query
  import ExUnit.CaptureIO

  alias RockcutApi.Brewing.{Ingredient, IngredientLot}
  alias RockcutApi.Ingredients.{Catalog, Movement, Product, ProductFeatureValue, SupplierOffer}

  @moduletag :capture_log

  defp seed!, do: capture_io(fn -> Code.eval_file("priv/repo/seeds.exs") end)

  defp hop_products do
    from p in Product,
      join: i in assoc(p, :ingredient),
      where: i.category_id in ^Catalog.category_ids(["hops"])
  end

  # The seeded lots: hop lots not made by the synthetic setup or a test.
  defp hop_lots do
    from l in IngredientLot,
      join: p in subquery(hop_products()),
      on: p.id == l.product_id,
      where: not like(l.lot_number, "[SEED]%") and not like(l.lot_number, "[TEST-TEMP]%")
  end

  defp hop_counts do
    %{
      products: Repo.aggregate(hop_products(), :count),
      offers:
        Repo.aggregate(
          from(o in SupplierOffer, join: p in subquery(hop_products()), on: p.id == o.product_id),
          :count
        ),
      lots: Repo.aggregate(hop_lots(), :count),
      lb: total_lb(),
      hops:
        Repo.aggregate(
          from(i in Ingredient, where: i.category_id in ^Catalog.category_ids(["hops"])),
          :count
        )
    }
  end

  defp total_lb do
    Repo.one(
      from m in Movement,
        join: l in subquery(hop_lots()),
        on: l.id == m.lot_id,
        select: sum(m.quantity)
    )
  end

  defp lot!(variety, form, number) do
    Repo.one!(
      from l in IngredientLot,
        join: p in assoc(l, :product),
        join: i in assoc(p, :ingredient),
        where: i.name == ^variety and p.form == ^form and l.lot_number == ^number,
        preload: [:movements, :supplier, feature_values: :feature_type, product: :manufacturer]
    )
  end

  defp alpha(lot) do
    Enum.find(lot.feature_values, &(&1.feature_type.key == "alpha_acid_pct")).value
  end

  test "twice: 27 products, 27 offers, 28 lots, 409.6 lb" do
    seed!()
    first = hop_counts()
    seed!()
    assert hop_counts() == first

    assert first.products == 27
    assert first.offers == 27
    assert first.lots == 28
    assert Decimal.equal?(first.lb, "409.6")
    # The six the base seed has (Centennial, Amarillo among them) plus the
    # varieties it didn't: 25 names in the reference, 4 of them already there.
    assert first.hops == 6 + 21
  end

  test "spot checks: Galaxy, Citra Cryo, Magnum under a box, Chinook twice" do
    seed!()

    galaxy = lot!("Galaxy", "T90 Pellet", "MB030")
    assert galaxy.crop_year == 2025
    assert Decimal.equal?(alpha(galaxy), "17.6")
    assert galaxy.received_date == ~D[2026-11-19]
    assert galaxy.supplier.name == "Lupulin Exchange"
    assert galaxy.product.manufacturer.name == "Lupulin Exchange"
    assert galaxy.pack_name == "box" and Decimal.equal?(galaxy.pack_size, 11)

    assert [%Movement{kind: "opening", occurred_on: ~D[2026-11-19], entered_by_id: nil} = m] =
             galaxy.movements

    assert Decimal.equal?(m.quantity, "71.0")

    cryo = lot!("Citra", "Cryo", "PC1-JUCIT2206")
    assert Decimal.equal?(alpha(cryo), "26.9")

    magnum = lot!("Magnum", "T90 Pellet", "ERH.MAG.20241209")
    assert [%Movement{quantity: q}] = magnum.movements
    assert Decimal.equal?(q, "0.6")
    # Outside Magnum's 11–16, allowed.
    assert Decimal.equal?(alpha(magnum), "7.90")

    assert lot!("Chinook", "T90 Pellet", "BG-Chin-2025").product.manufacturer.name ==
             "Billy Goat"

    assert Repo.exists?(from i in Ingredient, where: i.name == "Hallertau Mittelfrüh")
    assert Repo.exists?(from i in Ingredient, where: i.name == "Pink Boots Blend")
    refute Repo.exists?(from l in IngredientLot, where: like(l.lot_number, "%EKG%"))
  end

  test "ranges, origin and offers; Pink Boots Blend has no range" do
    seed!()

    citra =
      Repo.one!(
        from p in Product,
          join: i in assoc(p, :ingredient),
          where: i.name == "Citra" and p.form == "T90 Pellet",
          preload: [:offers, feature_values: :feature_type]
      )

    assert citra.origin == "USA"
    assert citra.unit == "lb"

    ranges = Map.new(citra.feature_values, &{&1.feature_type.key, {&1.value, &1.value_high}})
    assert {low, high} = ranges["alpha_acid_pct"]
    assert Decimal.equal?(low, 11) and Decimal.equal?(high, 13)
    assert map_size(ranges) == 3

    assert [%SupplierOffer{order_name: "Citra", pack_name: "box", pack_size: size, form: nil}] =
             citra.offers

    assert Decimal.equal?(size, 11)

    # D62 lead decisions 1, gap 3: milled/whole is grain's; no hop offer has a form.
    assert [] =
             Repo.all(
               from o in SupplierOffer,
                 where: not is_nil(o.form),
                 join: p in subquery(hop_products()),
                 on: p.id == o.product_id
             )

    pink =
      Repo.one!(
        from p in Product,
          join: i in assoc(p, :ingredient),
          where: i.name == "Pink Boots Blend"
      )

    refute Repo.exists?(from v in ProductFeatureValue, where: v.product_id == ^pink.id)
  end

  test "a lot changed on the screens isn't topped up; a product edit sticks" do
    seed!()
    galaxy = lot!("Galaxy", "T90 Pellet", "MB030")

    Repo.insert!(%Movement{
      lot_id: galaxy.id,
      kind: "used",
      quantity: Decimal.new("-10.0"),
      occurred_on: ~D[2026-11-20]
    })

    # The lot # in another case is the same lot.
    galaxy |> Ecto.Changeset.change(lot_number: "mb030") |> Repo.update!()
    Repo.update!(Ecto.Changeset.change(galaxy.product, origin: "Australia (Tasmania)"))

    seed!()

    assert hop_counts().lots == 28
    assert Decimal.equal?(total_lb(), "399.6")
    assert Repo.reload!(galaxy.product).origin == "Australia (Tasmania)"
  end
end
