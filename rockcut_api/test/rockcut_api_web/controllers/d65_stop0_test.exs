defmodule RockcutApiWeb.D65Stop0Test do
  @moduledoc """
  D65 Stop 0 (D62 lead decisions 5, carried into D65) on the API: Add lot's
  supplier. A lot of a product with an active offer needs its supplier
  (decision 17), so `POST /api/ingredient_lots` without one is refused
  (422, nothing written). A product with no active offer keeps the old
  behavior. Gap 2 (a blank crop year into an existing lot #) is in
  `D62FixCycle1Test`.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IngredientFixtures
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Brewing.IngredientLot
  alias RockcutApi.Ingredients.SupplierOffer

  setup do
    p = personas(~w(brewer1))
    c = grain_catalog!()
    c = Map.merge(c, hop_catalog!(c))
    Map.put(c, :brewer, p["brewer1"])
  end

  defp req(user, verb, path, params) do
    conn = call(user, verb, path, params)
    {conn.status, Jason.decode!(conn.resp_body)}
  end

  defp lots(product_id),
    do: Repo.aggregate(from(l in IngredientLot, where: l.product_id == ^product_id), :count)

  defp grain_lot(c, product_id, extra) do
    req(
      c.brewer,
      :post,
      "/api/ingredient_lots",
      Map.merge(
        %{
          "product_id" => product_id,
          "pack_name" => "sack",
          "pack_size" => "55",
          "received_date" => Date.to_iso8601(Tasks.today()),
          "initial_kind" => "opening",
          "initial_quantity" => "110"
        },
        extra
      )
    )
  end

  defp hop_lot(c, extra) do
    req(
      c.brewer,
      :post,
      "/api/ingredient_lots",
      Map.merge(
        %{
          "product_id" => c.hop_product.id,
          "crop_year" => 2025,
          "received_date" => Date.to_iso8601(Tasks.today()),
          "initial_kind" => "opening",
          "initial_quantity" => "22",
          "features" => %{"alpha_acid_pct" => "12.5"}
        },
        extra
      )
    )
  end

  @refusal "Pick the supplier; this product's lots come from its offers' suppliers"

  describe "Add lot supplier" do
    test "a product with an offer: no supplier (missing, null or blank) is refused, nothing written",
         c do
      for extra <- [%{}, %{"supplier_party_id" => nil}, %{"supplier_party_id" => ""}] do
        assert {422, %{"errors" => %{"base" => [@refusal]}}} = grain_lot(c, c.product.id, extra)
        assert {422, %{"errors" => %{"base" => [@refusal]}}} = hop_lot(c, extra)
      end

      assert lots(c.product.id) == 0
      assert lots(c.hop_product.id) == 0
    end

    test "a product with an offer: with a supplier it saves", c do
      assert {201, %{"data" => lot}} =
               grain_lot(c, c.product.id, %{"supplier_party_id" => c.bsg.id})

      assert lot["supplier_party_id"] == c.bsg.id

      assert {201, %{"data" => hop}} =
               hop_lot(c, %{"supplier_party_id" => c.hop_offer.supplier_party_id})

      assert hop["supplier_party_id"] == c.hop_offer.supplier_party_id
    end

    test "a product with no offer, or only inactive ones, saves without a supplier as before",
         c do
      bare = product!(c.two_row, c.root_shoot)
      assert {201, %{"data" => lot}} = grain_lot(c, bare.id, %{})
      assert lot["supplier_party_id"] == nil

      Repo.update!(SupplierOffer.changeset(c.offer, %{active: false}))
      assert {201, %{"data" => _}} = grain_lot(c, c.product.id, %{})
    end
  end
end
