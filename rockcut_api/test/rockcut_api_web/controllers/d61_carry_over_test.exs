defmodule RockcutApiWeb.D61CarryOverTest do
  @moduledoc """
  D61 Stage 1, the D60 carry-over on the API (spec §5): `delete_blocked` on
  companies and categories by the same rules their delete enforces; no
  custom fields on Grains and its children; a product's lot numbers unique;
  a price effective "today" is current late in the Colorado evening (the
  next UTC day).
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IngredientFixtures

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Brewing.{Ingredient, IngredientCategory}
  alias RockcutApi.Ingredients.{Movement, OfferPrice, Offers}

  setup do
    p = personas(~w(brewer1))
    Map.merge(grain_catalog!(), %{brewer: p["brewer1"]})
  end

  defp req(user, verb, path, params \\ %{}) do
    conn = call(user, verb, path, params)
    {conn.status, if(conn.resp_body == "", do: nil, else: Jason.decode!(conn.resp_body))}
  end

  defp errors({422, %{"errors" => errors}}), do: errors

  defp by_id(list), do: Map.new(list, &{&1["id"], &1})

  describe "company delete_blocked (carry-over 2)" do
    test "says what uses it, list and show; nil when unused; the delete agrees", c do
      lot = stocked_lot!(c.product, Tasks.today(), "55")

      Repo.insert!(%Movement{
        lot_id: lot.id,
        kind: "traded_out",
        quantity: Decimal.new(-5),
        occurred_on: Tasks.today(),
        partner_party_id: c.mountain.id
      })

      Repo.update!(Ecto.Changeset.change(lot, supplier_party_id: c.root_shoot.id))
      unused = party!("Crisp", ~w(manufacturer))

      {200, %{"data" => list}} = req(c.brewer, :get, "/api/parties")
      parties = by_id(list)

      assert parties[c.rahr.id]["delete_blocked"] ==
               "This company has products; deactivate it instead"

      assert parties[c.bsg.id]["delete_blocked"] ==
               "This company has supplier offers; deactivate it instead"

      assert parties[c.root_shoot.id]["delete_blocked"] ==
               "This company has lots; deactivate it instead"

      assert parties[c.mountain.id]["delete_blocked"] ==
               "This company has trades or loans; deactivate it instead"

      assert parties[unused.id]["delete_blocked"] == nil

      assert {200, %{"data" => %{"delete_blocked" => "This company has products" <> _}}} =
               req(c.brewer, :get, "/api/parties/#{c.rahr.id}")

      # Several uses are listed together.
      Repo.insert!(%RockcutApi.Ingredients.SupplierOffer{
        product_id: c.product.id,
        supplier_party_id: c.root_shoot.id,
        pack_size: Decimal.new(50),
        form: "whole"
      })

      assert {200, %{"data" => %{"delete_blocked" => blocked}}} =
               req(c.brewer, :get, "/api/parties/#{c.root_shoot.id}")

      assert blocked == "This company has supplier offers and lots; deactivate it instead"

      # D61 lead (Stop 1 note 1): the API refuses with the same sentence; the unused one deletes.
      {200, %{"data" => list}} = req(c.brewer, :get, "/api/parties")
      blocked = Map.new(list, &{&1["id"], &1["delete_blocked"]})

      for party <- [c.rahr, c.bsg, c.root_shoot, c.mountain] do
        assert %{"base" => [reason]} = errors(req(c.brewer, :delete, "/api/parties/#{party.id}"))
        assert reason == blocked[party.id]
      end

      assert {204, _} = req(c.brewer, :delete, "/api/parties/#{unused.id}")
    end
  end

  describe "category delete_blocked (carry-over 2)" do
    test "the delete's own refusal, or nil; list, show and after an update", c do
      Repo.insert!(%Ingredient{name: "Cascade", category_id: c.hops.id})
      empty = Repo.insert!(%IngredientCategory{name: "Smoked", sort_order: 9})

      {200, %{"data" => list}} = req(c.brewer, :get, "/api/ingredient_categories")
      categories = by_id(list)

      assert categories[c.grains.id]["delete_blocked"] ==
               "This category has sub-categories; move or delete them first"

      assert categories[c.base.id]["delete_blocked"] ==
               "This category has grains; move them first"

      assert categories[c.hops.id]["delete_blocked"] ==
               "This category has ingredients; move them first"

      assert categories[empty.id]["delete_blocked"] == nil

      assert {200, %{"data" => %{"delete_blocked" => "This category has grains" <> _}}} =
               req(c.brewer, :get, "/api/ingredient_categories/#{c.base.id}")

      assert {200, %{"data" => %{"delete_blocked" => "This category has ingredients" <> _}}} =
               req(c.brewer, :patch, "/api/ingredient_categories/#{c.hops.id}", %{
                 name: "Hops!"
               })

      for cat <- [c.grains, c.base, c.hops] do
        assert {422, _} = req(c.brewer, :delete, "/api/ingredient_categories/#{cat.id}")
      end

      assert {204, _} = req(c.brewer, :delete, "/api/ingredient_categories/#{empty.id}")
    end
  end

  describe "no custom fields on Grains (carry-over 5)" do
    test "refused on Grains and its children, and moving one there; allowed elsewhere", c do
      body = &%{category_id: &1, field_name: "Origin", field_type: "text"}

      for cat <- [c.grains, c.base] do
        assert %{"category_id" => ["Grains use features, not custom fields"]} =
                 errors(req(c.brewer, :post, "/api/category_field_definitions", body.(cat.id)))
      end

      # D64 §4.1: Yeast Strains takes no field any more; Other Consumables does.
      yeast = Repo.insert!(%IngredientCategory{name: "Other Consumables", key: "consumables"})

      assert {201, %{"data" => %{"id" => id}}} =
               req(c.brewer, :post, "/api/category_field_definitions", body.(yeast.id))

      assert %{"category_id" => [_]} =
               errors(
                 req(c.brewer, :patch, "/api/category_field_definitions/#{id}", %{
                   category_id: c.base.id
                 })
               )

      assert {200, _} =
               req(c.brewer, :patch, "/api/category_field_definitions/#{id}", %{required: true})
    end
  end

  describe "no custom fields on Hops (D62 split Amendment)" do
    test "refused on Hops, and moving one there; allowed on Other Consumables", c do
      body = &%{category_id: &1, field_name: "Grower", field_type: "text"}

      assert %{"category_id" => ["Hops use features, not custom fields"]} =
               errors(req(c.brewer, :post, "/api/category_field_definitions", body.(c.hops.id)))

      # D64 §4.1: Yeast Strains takes no field any more; Other Consumables does.
      yeast = Repo.insert!(%IngredientCategory{name: "Other Consumables", key: "consumables"})

      assert {201, %{"data" => %{"id" => id}}} =
               req(c.brewer, :post, "/api/category_field_definitions", body.(yeast.id))

      assert %{"category_id" => ["Hops use features, not custom fields"]} =
               errors(
                 req(c.brewer, :patch, "/api/category_field_definitions/#{id}", %{
                   category_id: c.hops.id
                 })
               )
    end
  end

  describe "unique lot number per product (§3.3, carry-over 5)" do
    test "a second lot with a product's lot # is refused; another product may use it", c do
      body = fn product_id, number ->
        %{
          "product_id" => product_id,
          "supplier_party_id" => c.bsg.id,
          "lot_number" => number,
          "received_date" => Date.to_iso8601(Tasks.today()),
          "pack_size" => "55",
          "initial_kind" => "opening",
          "initial_quantity" => "110"
        }
      end

      assert {201, _} = req(c.brewer, :post, "/api/ingredient_lots", body.(c.product.id, "W123"))

      assert %{"base" => ["This product already has lot W123"]} =
               errors(req(c.brewer, :post, "/api/ingredient_lots", body.(c.product.id, "W123")))

      other = product!(c.two_row, c.root_shoot)

      assert {201, _} = req(c.brewer, :post, "/api/ingredient_lots", body.(other.id, "W123"))

      # Renaming a lot onto a taken number is refused too.
      assert {201, %{"data" => %{"id" => second}}} =
               req(c.brewer, :post, "/api/ingredient_lots", body.(c.product.id, "W124"))

      assert %{"base" => ["This product already has lot W123"]} =
               errors(
                 req(c.brewer, :patch, "/api/ingredient_lots/#{second}", %{lot_number: "W123"})
               )

      # Lots with no number aren't constrained.
      for _ <- 1..2 do
        assert {201, _} =
                 req(c.brewer, :post, "/api/ingredient_lots", body.(c.product.id, nil))
      end
    end
  end

  describe "late-evening price (carry-over 6)" do
    # 23:30 in Colorado is the next day in UTC, in winter (MST) and summer (MDT).
    for {label, now, today} <- [
          {"MST", ~U[2026-11-19 06:30:00Z], ~D[2026-11-18]},
          {"MDT", ~U[2026-07-02 05:30:00Z], ~D[2026-07-01]}
        ] do
      test "at 23:30 Colorado (#{label}) a price effective today is current, tomorrow's isn't",
           c do
        now = unquote(Macro.escape(now))
        today = unquote(Macro.escape(today))
        assert Tasks.today_at(now) == today
        assert DateTime.to_date(now) == Date.add(today, 1)

        for {price, on} <- [
              {"40.00", Date.add(today, -30)},
              {"45.00", today},
              {"50.00", Date.add(today, 1)}
            ] do
          Repo.insert!(%OfferPrice{
            offer_id: c.offer.id,
            price_per_pack: Decimal.new(price),
            effective_on: on
          })
        end

        current = Offers.current_prices([c.offer.id], Tasks.today_at(now))[c.offer.id]
        assert Decimal.eq?(current.price_per_pack, "45.00")
        assert current.effective_on == today
      end
    end
  end
end
