defmodule RockcutApi.Seeds.D64SeedsTest do
  @moduledoc """
  D64 spec Amendment, plan Seeds: `seeds/d64_reference.exs` (through
  `priv/repo/seeds.exs`) twice gives the same rows, and its log line says
  what it added: 3 companies, 10 new ingredients (Chico Ale is there from
  `seeds.exs`), 11 products, 11 offers and 2 prices the first time, 0 new
  the second. No lots. Spot checks, and the old seeded US-05 → Chico Ale.
  """
  # Not async: seeds.exs runs the synthetic setup (global env reads).
  use RockcutApi.DataCase, async: false

  import Ecto.Query
  import ExUnit.CaptureIO

  alias RockcutApi.Brewing.{
    CategoryFieldDefinition,
    Ingredient,
    IngredientCategory,
    IngredientLot
  }

  alias RockcutApi.Ingredients.{Catalog, OfferPrice, Product, Products, SupplierOffer}
  alias RockcutApi.Yeast.StrainType

  @moduletag :capture_log

  defp seed!, do: capture_io(fn -> Code.eval_file("priv/repo/seeds.exs") end)

  defp log_line(output),
    do: output |> String.split("\n") |> Enum.find(&String.starts_with?(&1, "D64 reference:"))

  defp ingredients do
    from i in Ingredient,
      where: i.category_id in ^Catalog.category_ids(["yeast"]),
      where: not like(i.name, "[SEED]%") and not like(i.name, "[TEST-TEMP]%")
  end

  defp products,
    do: from(p in Product, join: i in subquery(ingredients()), on: i.id == p.ingredient_id)

  defp offers,
    do: from(o in SupplierOffer, join: p in subquery(products()), on: p.id == o.product_id)

  defp counts do
    %{
      ingredients: Repo.aggregate(ingredients(), :count),
      products: Repo.aggregate(products(), :count),
      offers: Repo.aggregate(offers(), :count),
      prices:
        Repo.aggregate(
          from(p in OfferPrice, join: o in subquery(offers()), on: o.id == p.offer_id),
          :count
        ),
      lots:
        Repo.aggregate(
          from(l in IngredientLot, join: p in subquery(products()), on: p.id == l.product_id),
          :count
        )
    }
  end

  defp product!(code) do
    Repo.one!(
      from p in Product,
        where: p.name == ^code,
        preload: [:manufacturer, ingredient: :category, offers: :supplier]
    )
  end

  test "twice: the log line's counts, then 0 new; 11 strains, products and offers, 2 prices, no lots" do
    first = log_line(seed!())

    assert first ==
             "D64 reference: 3 companies, 10 new ingredients, 11 new products, 11 new offers, 2 new prices"

    assert counts() == %{ingredients: 11, products: 11, offers: 11, prices: 2, lots: 0}

    second = log_line(seed!())

    assert second ==
             "D64 reference: 3 companies, 0 new ingredients, 0 new products, 0 new offers, 0 new prices"

    assert counts() == %{ingredients: 11, products: 11, offers: 11, prices: 2, lots: 0}

    # No old yeast fields, and none of the three removed strains.
    yeast = Repo.one!(from c in IngredientCategory, where: c.key == "yeast")
    refute Repo.exists?(from d in CategoryFieldDefinition, where: d.category_id == ^yeast.id)

    refute Repo.exists?(
             from i in Ingredient, where: i.name in ["US-05", "WLP001", "Wyeast 1056", "WLP002"]
           )
  end

  test "spot checks: US-05, II-711, WLPMD4000, Lactobacillus brevis" do
    seed!()

    us05 = product!("US-05")
    assert Products.display_name(us05) == "Chico Ale US-05 · Fermentis"
    assert {us05.form, us05.unit, Products.unit_label(us05)} == {"Dry", "each", "bricks"}
    [offer] = us05.offers
    assert {offer.supplier.name, offer.pack_name, offer.pack_note} == {"BSG", "brick", "500 g"}
    assert Decimal.eq?(offer.pack_size, 1)

    assert [%{price_per_pack: price, effective_on: ~D[2026-11-22]}] =
             Repo.all(from p in OfferPrice, where: p.offer_id == ^offer.id)

    assert Decimal.eq?(price, "76.99")

    monk = product!("II-711")
    assert Products.display_name(monk) == "German Monk Lager II-711 · Inland Island"
    assert Products.unit_label(monk) == "pitchables"
    [offer] = monk.offers

    assert {offer.supplier.name, offer.pack_name, offer.pack_note} ==
             {"Inland Island", "pitchable", nil}

    refute Repo.exists?(from p in OfferPrice, where: p.offer_id == ^offer.id)

    modi = product!("WLPMD4000")
    assert Products.display_name(modi) == "Vermont Ale Modi WLPMD4000 · White Labs"
    assert hd(modi.offers).supplier.name == "White Labs"

    types =
      from(i in Ingredient,
        join: t in StrainType,
        on: t.id == i.yeast_strain_type_id,
        select: {i.name, t.name}
      )
      |> Repo.all()
      |> Map.new()

    assert types["Lactobacillus brevis"] == "Lacto"
    assert types["Brett Brux III"] == "Brett"
    assert types["Dry Lager"] == "Lager"
    assert types["Chico Ale"] == "Ale"
  end

  test "an old seeded US-05 becomes Chico Ale, keeping its id; an edit made on the screens sticks" do
    seed!()
    chico = Repo.one!(from i in Ingredient, where: i.name == "Chico Ale")

    # As a database seeded before D64: the strain is called US-05.
    Repo.update!(Ecto.Changeset.change(chico, name: "US-05"))
    seed!()
    assert Repo.get!(Ingredient, chico.id).name == "Chico Ale"
    assert counts().ingredients == 11

    # A price and a pack note edited on the screens aren't put back.
    offer = hd(product!("S-04").offers)
    Repo.update!(Ecto.Changeset.change(offer, pack_note: "11.5 g × 40"))
    seed!()
    assert Repo.get!(SupplierOffer, offer.id).pack_note == "11.5 g × 40"
  end
end
