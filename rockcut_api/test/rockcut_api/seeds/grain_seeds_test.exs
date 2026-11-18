defmodule RockcutApi.Seeds.GrainSeedsTest do
  @moduledoc """
  D60 §3.1, §6, Appendices A and B: `priv/repo/seeds.exs` (with
  `seeds/grain_reference.exs`, and the synthetic setup it runs locally)
  twice gives the same rows: Grains' five children with all 38 grains on
  them, 44 maltster products, 8 companies with their roles, the offers, the
  applicability, no Origin/Maltster fields, and two `[SEED]` lots. A grain
  moved by hand stays where it was put.
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

  alias RockcutApi.Ingredients.{
    CategoryFeatureType,
    LotFeatureValue,
    Movement,
    Party,
    PartyRole,
    Product,
    ProductFeatureValue,
    SupplierOffer
  }

  alias RockcutApi.Seeds.Synthetic

  @moduletag :capture_log

  @children ["Base", "Crystal/Caramel", "Kilned", "Specialty", "Roasted"]

  defp seed!, do: capture_io(fn -> Code.eval_file("priv/repo/seeds.exs") end)

  defp grains, do: Repo.get_by!(IngredientCategory, name: "Grains")

  defp grains_by_child do
    Repo.all(
      from i in Ingredient,
        join: c in IngredientCategory,
        on: c.id == i.category_id,
        where: c.parent_id == ^grains().id,
        group_by: c.name,
        select: {c.name, count(i.id)}
    )
    |> Map.new()
  end

  defp roles do
    Repo.all(
      from r in PartyRole,
        join: p in Party,
        on: p.id == r.party_id,
        where: not like(p.name, "[SEED]%"),
        order_by: [p.name, r.role],
        select: {p.name, r.role}
    )
  end

  defp counts do
    for schema <- [
          IngredientCategory,
          Ingredient,
          Party,
          PartyRole,
          Product,
          ProductFeatureValue,
          SupplierOffer,
          CategoryFeatureType,
          CategoryFieldDefinition,
          IngredientLot,
          LotFeatureValue,
          Movement
        ],
        into: %{},
        do: {schema, Repo.aggregate(schema, :count)}
  end

  test "twice: the same catalog, reference data and [SEED] lots" do
    seed!()
    first = counts()
    seed!()
    assert counts() == first

    children =
      Repo.all(
        from c in IngredientCategory,
          where: c.parent_id == ^grains().id,
          order_by: c.sort_order,
          select: c.name
      )

    assert children == @children

    assert grains_by_child() ==
             %{
               "Base" => 16,
               "Crystal/Caramel" => 10,
               "Kilned" => 3,
               "Specialty" => 4,
               "Roasted" => 5
             }

    refute Repo.exists?(from i in Ingredient, where: i.category_id == ^grains().id)
    assert first[IngredientCategory] == 13

    assert first[Product] == 44
    assert first[SupplierOffer] == 44
    # Blanks stay blank (23 of them, mostly protein), so fewer than 44 × 5.
    assert first[ProductFeatureValue] == 44 * 5 - 23

    assert roles() == [
             {"BSG", "supplier"},
             {"Crisp", "maltster"},
             {"Dingemans", "maltster"},
             {"Grain Millers", "maltster"},
             {"Rahr", "maltster"},
             {"Root Shoot", "maltster"},
             {"Root Shoot", "supplier"},
             {"Simpsons", "maltster"},
             {"Weyermann", "maltster"}
           ]

    assert Repo.aggregate(from(p in Party, where: not like(p.name, "[SEED]%")), :count) == 8

    refute Repo.exists?(
             from d in CategoryFieldDefinition,
               where: d.category_id == ^grains().id and d.field_name in ["Origin", "Maltster"]
           )

    # Grains: five features; Hops alpha acid; Yeast Strains attenuation.
    assert first[CategoryFeatureType] == 7
  end

  test "offers: sack size, milled from the order name, Root Shoot with no order name" do
    seed!()

    offers =
      Repo.all(
        from o in SupplierOffer,
          join: p in assoc(o, :product),
          join: i in assoc(p, :ingredient),
          join: m in assoc(p, :maltster),
          join: s in assoc(o, :supplier),
          select: {i.name, m.name, s.name, o.order_name, o.sack_size_lb, o.form}
      )

    assert {"2-Row", "Rahr", "BSG", "Rahr - Standard 2-row (milled)", sack, "milled"} =
             Enum.find(offers, &match?({"2-Row", "Rahr", _, _, _, _}, &1))

    assert Decimal.equal?(sack, 55)

    assert {_, _, "Root Shoot", nil, rs_sack, "whole"} =
             Enum.find(offers, &match?({"Pilsner", "Root Shoot", _, _, _, _}, &1))

    assert Decimal.equal?(rs_sack, 50)

    assert {_, "Crisp", "BSG", "Crisp - Brown Malt", _, "whole"} =
             Enum.find(offers, &match?({"Brown Malt", _, _, _, _, _}, &1))

    assert {_, "Dingemans", _, "Dingemans - Biscuit", _, _} =
             Enum.find(offers, &match?({"Biscuit", _, _, _, _, _}, &1))

    assert {_, "Grain Millers", _, _, oats_sack, "whole"} =
             Enum.find(offers, &match?({"Oats, Flaked", _, _, _, _, _}, &1))

    assert Decimal.equal?(oats_sack, 50)
    assert Enum.count(offers, &(elem(&1, 5) == "milled")) == 13
  end

  test "a 0 diastatic power is stored; Malted Oats' blank isn't" do
    seed!()

    dp = fn grain ->
      Repo.one(
        from v in ProductFeatureValue,
          join: f in assoc(v, :feature_type),
          join: p in assoc(v, :product),
          join: i in assoc(p, :ingredient),
          where: f.key == "diastatic_power_lintner" and i.name == ^grain,
          select: v.value
      )
    end

    assert Decimal.equal?(dp.("Black Malt"), 0)
    assert dp.("Oats, Malted") == nil
  end

  test "a grain moved by hand to another child isn't moved back" do
    seed!()
    specialty = Repo.get_by!(IngredientCategory, name: "Specialty")
    two_row = Repo.get_by!(Ingredient, name: "2-Row")
    two_row |> Ecto.Changeset.change(category_id: specialty.id) |> Repo.update!()

    seed!()

    assert Repo.reload!(two_row).category_id == specialty.id
    assert Repo.aggregate(from(i in Ingredient, where: i.name == "2-Row"), :count) == 1
  end

  test "synthetic setup twice: two [SEED] lots of Rahr 2-Row with their opening amounts" do
    seed!()
    {:ok, _} = Synthetic.setup()

    lots =
      Repo.all(
        from l in IngredientLot,
          where: like(l.lot_number, "[SEED]%"),
          order_by: l.received_date,
          preload: [:movements, :feature_values, product: [:ingredient, :maltster]]
      )

    assert [older, newer] = lots
    today = RockcutApi.Tasks.today()
    assert older.received_date == Date.add(today, -30)
    assert newer.received_date == Date.add(today, -7)

    for {lot, lb} <- [{older, 165}, {newer, 550}] do
      assert lot.product.ingredient.name == "2-Row"
      assert lot.product.maltster.name == "Rahr"
      assert Decimal.equal?(lot.sack_size_lb, 55)
      assert [%Movement{kind: "opening", quantity_lb: q}] = lot.movements
      assert Decimal.equal?(q, lb)
      assert length(lot.feature_values) == 5
    end

    assert %Party{} = mountain = Repo.get_by(Party, name: "[SEED] Mountain Brewing")
    assert Repo.get_by(PartyRole, party_id: mountain.id).role == "partner_brewery"
  end

  test "synthetic setup without Rahr 2-Row: no [SEED] lots, no error" do
    seed!()

    Repo.get_by!(Party, name: "Rahr")
    |> Ecto.Changeset.change(name: "Rahr Malting")
    |> Repo.update!()

    assert {:ok, _} = Synthetic.setup()
    refute Repo.exists?(from l in IngredientLot, where: like(l.lot_number, "[SEED]%"))
  end
end
