defmodule RockcutApiWeb.IngredientsApiTest do
  @moduledoc """
  D60 Stage 2: the grain catalog and inventory API (spec §3.2–3.9). Each
  rule has a refusal and an allowed case; who may use the routes (Brewery
  members of any role and owners; not other departments, not a device);
  the product list's query count; the quantity display setting.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IngredientFixtures
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Brewing.{IngredientCategory, IngredientLot}
  alias RockcutApi.Ingredients.{LotFeatureValue, Movement, OfferPrice, Products}

  setup do
    p = personas(~w(owner brewer1 breweryMgr floater splitRole bartender1 office1))
    Map.merge(grain_catalog!(), %{p: p, brewer: p["brewer1"]})
  end

  defp day(offset), do: Date.add(Tasks.today(), offset)
  defp iso(offset), do: Date.to_iso8601(day(offset))

  defp req(user, verb, path, params \\ %{}) do
    conn = call(user, verb, path, params)
    {conn.status, if(conn.resp_body == "", do: nil, else: Jason.decode!(conn.resp_body))}
  end

  defp errors({422, %{"errors" => errors}}), do: errors

  defp list(user, category_id) do
    {200, %{"data" => data}} = req(user, :get, "/api/ingredients", %{category_id: category_id})
    data
  end

  defp on_hand(product_id) do
    {200, %{"data" => p}} = req(user_cache(), :get, "/api/ingredient_products/#{product_id}")
    p["on_hand_lb"]
  end

  # Any Brewery member reads; the on-hand helper doesn't need a particular one.
  defp user_cache, do: Repo.get_by!(RockcutApi.Accounts.User, email: "brewer1@rockcut-test.com")

  defp lot_body(c, extra) do
    Map.merge(
      %{
        "product_id" => c.product.id,
        "supplier_party_id" => c.bsg.id,
        "lot_number" => "L-1",
        "received_date" => iso(-1),
        "sack_size_lb" => "55",
        "initial_kind" => "opening",
        "initial_quantity_lb" => "660"
      },
      extra
    )
  end

  defp expire!(lot),
    do: lot |> Ecto.Changeset.change(status: "expired") |> Repo.update!()

  defp decimal(s), do: Decimal.new(s)
  defp eq(a, b), do: Decimal.eq?(decimal(to_string(a)), decimal(to_string(b)))

  describe "who (spec decision 12)" do
    @reads ~w(/api/parties /api/ingredient_products /api/feature_types /api/supplier_offers)

    for who <- ~w(brewer1 floater splitRole owner) do
      test "#{who} reads every list and records a movement", c do
        user = c.p[unquote(who)]
        for path <- @reads, do: assert(status(user, :get, path) == 200, path)

        lot = stocked_lot!(c.product, day(-3), "110")

        assert {201, _} =
                 req(user, :post, "/api/inventory_movements", %{
                   "kind" => "used",
                   "quantity_lb" => "10",
                   "occurred_on" => iso(0),
                   "lot_id" => lot.id
                 })
      end
    end

    for who <- ~w(bartender1 office1) do
      test "#{who} gets 403 on every D60 route", c do
        user = c.p[unquote(who)]
        assert Enum.reject(d60_routes(c), &(status(user, elem(&1, 0), elem(&1, 1)) == 403)) == []
      end
    end

    test "the brewhouse device gets 403 on every D60 route (breweryDevice)", c do
      device = RockcutApi.AccountsFixtures.device_fixture(%{home: "brewery", name: "Brewhouse"})
      token = RockcutApi.AccountsFixtures.device_token_fixture(device, "Brewhouse Tab")

      refused =
        Enum.reject(d60_routes(c), fn {verb, path} ->
          call_device(token, verb, path, %{staff_code: "1111"}).status == 403
        end)

      assert refused == []

      assert call_device(token, :put, "/api/me/board_settings/ingredients", %{
               quantity_display: "lb"
             }).status == 403
    end
  end

  defp d60_routes(c) do
    lot = stocked_lot!(c.product, day(-3), "55")
    product = "/api/ingredient_products/#{c.product.id}"
    party = "/api/parties/#{c.rahr.id}"
    offer = "/api/supplier_offers/#{c.offer.id}"
    lot_path = "/api/ingredient_lots/#{lot.id}"

    [
      {:get, "/api/parties"},
      {:get, party},
      {:post, "/api/parties"},
      {:patch, party},
      {:put, party},
      {:delete, party},
      {:get, "/api/ingredient_products"},
      {:get, product},
      {:post, "/api/ingredient_products"},
      {:patch, product},
      {:put, product},
      {:delete, product},
      {:post, product <> "/count"},
      {:get, "/api/feature_types"},
      {:get, "/api/supplier_offers"},
      {:get, offer},
      {:post, "/api/supplier_offers"},
      {:patch, offer},
      {:put, offer},
      {:delete, offer},
      {:get, offer <> "/prices"},
      {:post, offer <> "/prices"},
      {:get, "/api/inventory_movements?product_id=#{c.product.id}"},
      {:post, "/api/inventory_movements"},
      {:get, "/api/ingredient_lots"},
      {:get, lot_path},
      {:post, "/api/ingredient_lots"},
      {:patch, lot_path},
      {:delete, lot_path}
    ]
  end

  describe "parties (§3.2)" do
    test "roles are a closed set and at least one", c do
      assert %{"roles" => _} =
               errors(req(c.brewer, :post, "/api/parties", %{name: "X", roles: ["brewer"]}))

      assert %{"roles" => _} = errors(req(c.brewer, :post, "/api/parties", %{name: "X"}))

      assert {201, %{"data" => %{"roles" => ["maltster", "supplier"]}}} =
               req(c.p["owner"], :post, "/api/parties", %{
                 name: "Weyermann",
                 roles: ["supplier", "maltster"]
               })
    end

    test "?role= lists the parties holding it", c do
      {200, %{"data" => data}} = req(c.brewer, :get, "/api/parties?role=supplier")
      assert data |> Enum.map(& &1["name"]) |> Enum.sort() == ["BSG", "Root Shoot"]
    end

    test "a party in use can't be deleted, only deactivated; an unused one can", c do
      assert %{"base" => ["This company has maltster products; deactivate it instead"]} =
               errors(req(c.p["owner"], :delete, "/api/parties/#{c.rahr.id}"))

      assert {200, %{"data" => %{"active" => false}}} =
               req(c.brewer, :patch, "/api/parties/#{c.rahr.id}", %{active: false})

      unused = party!("Crisp", ~w(maltster))
      assert {204, _} = req(c.brewer, :delete, "/api/parties/#{unused.id}")
    end

    test "a role in use can't be taken away; an unused one can", c do
      assert %{"roles" => ["maltster is in use and can't be removed"]} =
               errors(req(c.brewer, :patch, "/api/parties/#{c.rahr.id}", %{roles: ["supplier"]}))

      assert {200, %{"data" => %{"roles" => ["supplier"]}}} =
               req(c.brewer, :patch, "/api/parties/#{c.root_shoot.id}", %{roles: ["supplier"]})
    end
  end

  describe "maltster products (§3.3, §3.4)" do
    test "the maltster must hold the maltster role", c do
      body = %{ingredient_id: c.two_row.id, name: "Other"}

      assert %{"maltster_party_id" => ["must be a maltster"]} =
               errors(
                 req(
                   c.brewer,
                   :post,
                   "/api/ingredient_products",
                   Map.put(body, :maltster_party_id, c.bsg.id)
                 )
               )

      assert {201, _} =
               req(
                 c.brewer,
                 :post,
                 "/api/ingredient_products",
                 Map.put(body, :maltster_party_id, c.root_shoot.id)
               )
    end

    test "feature values: applicability, range, entered units", c do
      post = fn features ->
        req(c.brewer, :post, "/api/ingredient_products", %{
          ingredient_id: c.two_row.id,
          maltster_party_id: c.root_shoot.id,
          features: features
        })
      end

      assert %{"features" => %{"alpha_acid_pct" => ["Alpha acid doesn't apply to this category"]}} =
               errors(post.(%{alpha_acid_pct: "5"}))

      assert %{"features" => %{"extract_fgdb" => ["Extract must be between 0 and 100"]}} =
               errors(post.(%{extract_fgdb: "120"}))

      assert %{"features" => %{"color_lovibond" => ["Color must be between 0 and 1,000"]}} =
               errors(post.(%{color_lovibond: "1001"}))

      assert %{
               "features" => %{
                 "color_lovibond" => ["Color has an entered unit but no entered value"]
               }
             } =
               errors(post.(%{color_lovibond: %{value: "2.8", entered_unit: "srm"}}))

      assert %{"features" => %{"color_lovibond" => ["Color has an entered value but no unit"]}} =
               errors(post.(%{color_lovibond: %{value: "2.8", entered_value: "3.0"}}))

      assert %{
               "features" => %{"color_lovibond" => ["Color can be entered in lovibond, srm, ebc"]}
             } =
               errors(
                 post.(%{
                   color_lovibond: %{value: "2.8", entered_value: "3", entered_unit: "ppg"}
                 })
               )

      assert %{"features" => %{"protein_pct" => ["Protein is entered in its own unit only"]}} =
               errors(
                 post.(%{protein_pct: %{value: "11", entered_value: "11", entered_unit: "pct"}})
               )

      assert %{"features" => %{"nope" => ["nope is not a feature"]}} = errors(post.(%{nope: "1"}))

      assert {201, %{"data" => p}} =
               post.(%{
                 color_lovibond: %{value: "2.8", entered_value: "3.0", entered_unit: "srm"},
                 extract_fgdb: "80.1",
                 diastatic_power_lintner: "0"
               })

      assert %{"value" => "2.8", "entered_value" => entered, "entered_unit" => "srm"} =
               p["features"]["color_lovibond"]

      assert eq(entered, "3.0")

      assert %{"value" => "80.1", "entered_value" => nil} = p["features"]["extract_fgdb"]
      assert p["features"]["diastatic_power_lintner"]["value"] == "0"

      # nil drops one; others stay
      {200, %{"data" => p}} =
        req(c.brewer, :patch, "/api/ingredient_products/#{p["id"]}", %{
          features: %{extract_fgdb: nil, moisture_pct: "4.1"}
        })

      assert Map.keys(p["features"]) |> Enum.sort() ==
               ~w(color_lovibond diastatic_power_lintner moisture_pct)
    end

    test "the JSON: grain, category, maltster, features, offers with current price, on hand", c do
      Repo.insert!(%OfferPrice{
        offer_id: c.offer.id,
        price_per_sack: decimal("48.50"),
        effective_on: day(-10)
      })

      stocked_lot!(c.product, day(-2), "110")

      {200, %{"data" => p}} = req(c.brewer, :get, "/api/ingredient_products/#{c.product.id}")

      assert p["display_name"] == "Rahr 2-Row"
      assert p["ingredient"]["name"] == "2-Row"
      assert p["category"] == %{"id" => c.base.id, "name" => "Base", "parent_id" => c.grains.id}
      assert p["maltster"] == %{"id" => c.rahr.id, "name" => "Rahr"}
      assert p["features"]["extract_fgdb"]["value"] == "81.5"
      assert [%{"supplier" => %{"name" => "BSG"}, "current_price" => price}] = p["offers"]
      assert eq(price["price_per_sack"], "48.50")
      assert price["price_per_lb"] == "0.8818"
      assert eq(p["on_hand_lb"], 110)
    end

    test "list filters: category with children, maltster, supplier, on hand", c do
      other_grain =
        Repo.insert!(%RockcutApi.Brewing.Ingredient{name: "Pilsner", category_id: c.base.id})

      rs = product!(other_grain, c.root_shoot)
      stocked_lot!(c.product, day(-2), "55")

      ids = fn q ->
        {200, %{"data" => data}} = req(c.brewer, :get, "/api/ingredient_products" <> q)
        data |> Enum.map(& &1["id"]) |> Enum.sort()
      end

      both = Enum.sort([c.product.id, rs.id])
      assert ids.("?category_id=#{c.grains.id}") == both
      assert ids.("?category_id=#{c.base.id}") == both
      assert ids.("?category_id=#{c.hops.id}") == []
      assert ids.("?ingredient_id=#{other_grain.id}") == [rs.id]
      assert ids.("?maltster_id=#{c.rahr.id}") == [c.product.id]
      assert ids.("?supplier_id=#{c.bsg.id}") == [c.product.id]
      assert ids.("?on_hand=true") == [c.product.id]
    end

    test "the list is five queries however many products", c do
      count = fn ->
        ref = make_ref()
        parent = self()

        :telemetry.attach(
          inspect(ref),
          [:rockcut_api, :repo, :query],
          fn _, _, _, _ -> send(parent, {ref, :query}) end,
          nil
        )

        Products.list(%{})
        :telemetry.detach(inspect(ref))
        count_messages(ref, 0)
      end

      assert count.() == 5

      for n <- 1..6 do
        grain =
          Repo.insert!(%RockcutApi.Brewing.Ingredient{name: "G#{n}", category_id: c.base.id})

        product = product!(grain, c.rahr, extract_fgdb: "80", moisture_pct: "4")
        stocked_lot!(product, day(-n), "55")
      end

      assert count.() == 5
    end

    test "a product with offers or lots can't be deleted; one without can", c do
      assert %{"base" => [_]} =
               errors(req(c.brewer, :delete, "/api/ingredient_products/#{c.product.id}"))

      bare = product!(c.two_row, c.root_shoot)
      assert {204, _} = req(c.brewer, :delete, "/api/ingredient_products/#{bare.id}")
    end
  end

  defp count_messages(ref, n) do
    receive do
      {^ref, :query} -> count_messages(ref, n + 1)
    after
      0 -> n
    end
  end

  test "feature types list the categories each applies to", c do
    {200, %{"data" => types}} = req(c.brewer, :get, "/api/feature_types")
    by_key = Map.new(types, &{&1["key"], &1})

    assert [%{"name" => "Grains"}] = by_key["extract_fgdb"]["categories"]
    assert by_key["extract_fgdb"]["entered_units"] == ~w(fgdb as_is ppg)
    assert [%{"name" => "Hops"}] = by_key["alpha_acid_pct"]["categories"]
    assert by_key["attenuation_pct"]["categories"] == []
  end

  describe "supplier offers and prices (§3.6)" do
    test "the supplier must hold the supplier role", c do
      body = %{product_id: c.product.id, sack_size_lb: "50", form: "whole"}

      assert %{"supplier_party_id" => ["must be a supplier"]} =
               errors(
                 req(
                   c.brewer,
                   :post,
                   "/api/supplier_offers",
                   Map.put(body, :supplier_party_id, c.rahr.id)
                 )
               )

      flaked = %{body | form: "flaked"} |> Map.put(:supplier_party_id, c.root_shoot.id)
      assert %{"form" => _} = errors(req(c.brewer, :post, "/api/supplier_offers", flaked))

      assert {201,
              %{"data" => %{"supplier" => %{"name" => "Root Shoot"}, "current_price" => nil}}} =
               req(
                 c.brewer,
                 :post,
                 "/api/supplier_offers",
                 Map.put(body, :supplier_party_id, c.root_shoot.id)
               )
    end

    test "current price is the latest effective on or before today in Colorado; history newest first",
         c do
      path = "/api/supplier_offers/#{c.offer.id}/prices"

      assert {201, _} =
               req(c.brewer, :post, path, %{price_per_sack: "48.50", effective_on: iso(0)})

      assert {201, %{"data" => %{"entered_by" => %{"name" => _}}}} =
               req(c.brewer, :post, path, %{price_per_sack: "51.00", effective_on: iso(1)})

      assert %{"price_per_sack" => _} =
               errors(req(c.brewer, :post, path, %{price_per_sack: "-1", effective_on: iso(0)}))

      {200, %{"data" => offer}} = req(c.brewer, :get, "/api/supplier_offers/#{c.offer.id}")
      assert eq(offer["current_price"]["price_per_sack"], "48.50")
      assert offer["current_price"]["effective_on"] == iso(0)

      {200, %{"data" => history}} = req(c.brewer, :get, path)
      assert [new, old] = history
      assert eq(new["price_per_sack"], 51) and eq(old["price_per_sack"], "48.5")

      # Tomorrow in Colorado, the newer price is current.
      tomorrow = RockcutApi.Ingredients.Offers.current_prices([c.offer.id], day(1))
      assert eq(tomorrow[c.offer.id].price_per_sack, "51.00")
    end
  end

  describe "lots (§3.7)" do
    test "a grain lot needs its product and its first movement", c do
      assert %{"product_id" => ["A grain lot needs its maltster product"]} =
               errors(
                 req(c.brewer, :post, "/api/ingredient_lots", %{
                   ingredient_id: c.two_row.id,
                   initial_kind: "opening",
                   initial_quantity_lb: "55"
                 })
               )

      assert %{"initial_kind" => ["must be opening or received"]} =
               errors(
                 req(
                   c.brewer,
                   :post,
                   "/api/ingredient_lots",
                   lot_body(c, %{"initial_kind" => "used"})
                 )
               )

      assert %{"base" => ["Enter a quantity of at least 0.01 lb and under 1,000,000 lb"]} =
               errors(
                 req(
                   c.brewer,
                   :post,
                   "/api/ingredient_lots",
                   lot_body(c, %{"initial_quantity_lb" => "0"})
                 )
               )

      assert %{"supplier_party_id" => ["must be a supplier"]} =
               errors(
                 req(
                   c.brewer,
                   :post,
                   "/api/ingredient_lots",
                   lot_body(c, %{"supplier_party_id" => c.rahr.id})
                 )
               )

      assert {201, %{"data" => lot}} =
               req(c.brewer, :post, "/api/ingredient_lots", lot_body(c, %{}))

      assert lot["ingredient_id"] == c.two_row.id
      assert lot["product"]["display_name"] == "Rahr 2-Row"
      assert lot["supplier"]["name"] == "BSG"
      assert eq(lot["on_hand_lb"], 660)
      assert lot["status"] == "available"

      assert [%Movement{kind: "opening"} = m] = Repo.all(Movement)
      assert eq(m.quantity_lb, 660)
      assert m.occurred_on == day(-1)
    end

    test "a lot copies the standard features unless the body gives its own", c do
      {201, %{"data" => copied}} = req(c.brewer, :post, "/api/ingredient_lots", lot_body(c, %{}))
      assert copied["features"]["extract_fgdb"]["value"] == "81.5"
      assert eq(copied["features"]["color_lovibond"]["value"], "2.0")

      {201, %{"data" => own}} =
        req(
          c.brewer,
          :post,
          "/api/ingredient_lots",
          lot_body(c, %{
            "lot_number" => "L-2",
            "features" => %{
              "extract_fgdb" => "80.1",
              "color_lovibond" => nil,
              "moisture_pct" => "4.3"
            }
          })
        )

      assert own["features"]["extract_fgdb"]["value"] == "80.1"
      assert own["features"]["moisture_pct"]["value"] == "4.3"
      refute Map.has_key?(own["features"], "color_lovibond")

      # The product's standard is unchanged; a lot's features change on their own.
      {200, %{"data" => lot}} =
        req(c.brewer, :patch, "/api/ingredient_lots/#{own["id"]}", %{
          features: %{moisture_pct: "5.2"}
        })

      assert lot["features"]["moisture_pct"]["value"] == "5.2"

      assert %{"features" => %{"moisture_pct" => _}} =
               errors(
                 req(c.brewer, :patch, "/api/ingredient_lots/#{own["id"]}", %{
                   features: %{moisture_pct: "101"}
                 })
               )

      {200, %{"data" => p}} = req(c.brewer, :get, "/api/ingredient_products/#{c.product.id}")
      refute Map.has_key?(p["features"], "moisture_pct")
    end

    test "a hop lot (not a grain) needs no product or movement and keeps its status", c do
      cascade =
        Repo.insert!(%RockcutApi.Brewing.Ingredient{name: "Cascade", category_id: c.hops.id})

      # The product decides the grain; another grain with it is refused.
      assert %{"ingredient_id" => ["isn't this product's grain"]} =
               errors(
                 req(c.brewer, :post, "/api/ingredient_lots", %{
                   ingredient_id: cascade.id,
                   product_id: c.product.id
                 })
               )

      {201, %{"data" => lot}} =
        req(c.brewer, :post, "/api/ingredient_lots", %{
          ingredient_id: cascade.id,
          lot_number: "H-1",
          features: %{alpha_acid_pct: "5.5"}
        })

      assert lot["features"]["alpha_acid_pct"]["value"] == "5.5"
      assert lot["status"] == "available"

      {200, %{"data" => lot}} =
        req(c.brewer, :patch, "/api/ingredient_lots/#{lot["id"]}", %{notes: "x"})

      assert lot["status"] == "available"
    end

    test "delete: only with just its first movement and no recipe", c do
      {201, %{"data" => %{"id" => id, "delete_blocked" => nil}}} =
        req(c.brewer, :post, "/api/ingredient_lots", lot_body(c, %{}))

      {201, %{"data" => %{"id" => id2}}} =
        req(c.brewer, :post, "/api/ingredient_lots", lot_body(c, %{"lot_number" => "L-2"}))

      {201, _} =
        req(c.brewer, :post, "/api/inventory_movements", %{
          kind: "used",
          quantity_lb: "5",
          occurred_on: iso(0),
          lot_id: id
        })

      later = "This lot has movements after its first; correct it with a movement or a count"
      assert %{"base" => [^later]} = errors(req(c.brewer, :delete, "/api/ingredient_lots/#{id}"))

      # Gap 15: the lot JSON says why, so the UI can disable Delete.
      assert {200, %{"data" => %{"delete_blocked" => ^later}}} =
               req(c.brewer, :get, "/api/ingredient_lots/#{id}")

      {:ok, brand} = RockcutApi.Brewing.create_brand(%{name: "Lot user"})
      {:ok, recipe} = RockcutApi.Brewing.create_recipe(%{brand_id: brand.id, batch_size: "15"})

      {:ok, ri} =
        RockcutApi.Brewing.create_recipe_ingredient(%{
          recipe_id: recipe.id,
          lot_id: id2,
          amount: 1,
          unit: "lb"
        })

      assert %{"base" => ["A recipe uses this lot, so it can't be deleted"]} =
               errors(req(c.brewer, :delete, "/api/ingredient_lots/#{id2}"))

      blocked =
        for l <-
              elem(req(c.brewer, :get, "/api/ingredient_lots?product_id=#{c.product.id}"), 1)[
                "data"
              ],
            into: %{},
            do: {l["id"], l["delete_blocked"]}

      assert blocked[id] == later
      assert blocked[id2] == "A recipe uses this lot, so it can't be deleted"

      Repo.delete!(ri)
      assert {204, _} = req(c.brewer, :delete, "/api/ingredient_lots/#{id2}")
      refute Repo.get(IngredientLot, id2)
      refute Repo.get_by(LotFeatureValue, lot_id: id2)
    end

    test "the sack size changes only while the lot has just its first movement (gap 14)", c do
      {201, %{"data" => %{"id" => id}}} =
        req(c.brewer, :post, "/api/ingredient_lots", lot_body(c, %{"sack_size_lb" => "50"}))

      path = "/api/ingredient_lots/#{id}"

      assert {200, %{"data" => %{"sack_size_lb" => "55"}}} =
               req(c.brewer, :patch, path, %{sack_size_lb: "55"})

      {201, _} =
        req(c.brewer, :post, "/api/inventory_movements", %{
          kind: "used",
          quantity_lb: "5",
          occurred_on: iso(0),
          lot_id: id
        })

      assert %{"base" => ["This lot has movements after its first" <> _]} =
               errors(req(c.brewer, :patch, path, %{sack_size_lb: "50"}))

      assert eq(Repo.get!(IngredientLot, id).sack_size_lb, 55)

      # The same size (as the edit dialog sends it) and other fields still save.
      assert {200, %{"data" => %{"lot_number" => "L-9"}}} =
               req(c.brewer, :patch, path, %{sack_size_lb: "55.0", lot_number: "L-9"})
    end

    test "feature values are kept to the type's decimals (gap 4)", c do
      {200, %{"data" => p}} =
        req(c.brewer, :patch, "/api/ingredient_products/#{c.product.id}", %{
          features: %{color_lovibond: "2.789", extract_fgdb: "80.16", protein_pct: "11.456"}
        })

      assert p["features"]["color_lovibond"]["value"] == "2.79"
      assert p["features"]["extract_fgdb"]["value"] == "80.2"
      assert p["features"]["protein_pct"]["value"] == "11.46"

      {201, %{"data" => lot}} =
        req(
          c.brewer,
          :post,
          "/api/ingredient_lots",
          lot_body(c, %{"features" => %{"moisture_pct" => "4.004", "color_lovibond" => "100"}})
        )

      assert lot["features"]["moisture_pct"]["value"] == "4"
      assert lot["features"]["color_lovibond"]["value"] == "100"
      # Copied from the standard as stored.
      assert lot["features"]["extract_fgdb"]["value"] == "80.2"

      # Rounding happens before the range check: 100.04 is 100.0.
      assert {200, _} =
               req(c.brewer, :patch, "/api/ingredient_lots/#{lot["id"]}", %{
                 features: %{moisture_pct: "100.004"}
               })
    end

    test "status follows on hand unless expired", c do
      lot = stocked_lot!(c.product, day(-3), "55", "S-1")

      {201, _} =
        req(c.brewer, :post, "/api/inventory_movements", %{
          kind: "used",
          quantity_lb: "55",
          occurred_on: iso(0),
          lot_id: lot.id
        })

      assert Repo.get!(IngredientLot, lot.id).status == "depleted"

      {201, _} =
        req(c.brewer, :post, "/api/inventory_movements", %{
          kind: "received",
          quantity_lb: "10",
          occurred_on: iso(0),
          lot_id: lot.id
        })

      assert Repo.get!(IngredientLot, lot.id).status == "available"

      {200, %{"data" => %{"status" => "expired"}}} =
        req(c.brewer, :patch, "/api/ingredient_lots/#{lot.id}", %{status: "expired"})

      {201, _} =
        req(c.brewer, :post, "/api/inventory_movements", %{
          kind: "used",
          quantity_lb: "10",
          occurred_on: iso(0),
          lot_id: lot.id
        })

      assert Repo.get!(IngredientLot, lot.id).status == "expired"

      # A manual "available" on an empty lot follows on hand again.
      {200, %{"data" => %{"status" => "depleted"}}} =
        req(c.brewer, :patch, "/api/ingredient_lots/#{lot.id}", %{status: "available"})
    end
  end

  describe "movements (§3.7, §3.8)" do
    setup c do
      older = stocked_lot!(c.product, day(-30), "165", "OLD")
      newer = stocked_lot!(c.product, day(-7), "550", "NEW")
      %{older: older, newer: newer}
    end

    defp move(c, body),
      do:
        req(c.brewer, :post, "/api/inventory_movements", Map.put_new(body, "occurred_on", iso(0)))

    test "oldest first takes the older lot to 0, then the newer, one movement per lot", c do
      assert {201, %{"data" => [a, b]}} =
               move(c, %{
                 "kind" => "used",
                 "quantity_lb" => "275",
                 "product_id" => c.product.id,
                 "allocation" => "oldest_first",
                 "note" => "P3"
               })

      assert {a["lot_id"], b["lot_id"]} == {c.older.id, c.newer.id}
      assert eq(a["quantity_lb"], -165) and eq(b["quantity_lb"], -110)
      assert Repo.get!(IngredientLot, c.older.id).status == "depleted"
      assert eq(on_hand(c.product.id), 440)
    end

    test "a chosen lot gives it all", c do
      assert {201, %{"data" => [m]}} =
               move(c, %{"kind" => "used", "quantity_lb" => "55", "lot_id" => c.newer.id})

      assert m["lot_id"] == c.newer.id
      assert Repo.get!(IngredientLot, c.older.id).status == "available"
    end

    test "more than on hand is refused with the on-hand, in the person's sacks or lb", c do
      assert %{"base" => ["That's more than the 13 sacks on hand"]} =
               errors(
                 move(c, %{
                   "kind" => "used",
                   "quantity_lb" => "716",
                   "product_id" => c.product.id,
                   "allocation" => "oldest_first"
                 })
               )

      assert %{"base" => ["That's more than lot OLD has on hand (3 sacks)"]} =
               errors(
                 move(c, %{"kind" => "used", "quantity_lb" => "166", "lot_id" => c.older.id})
               )

      {200, _} =
        req(c.brewer, :put, "/api/me/board_settings/ingredients", %{quantity_display: "lb"})

      assert %{"base" => ["That's more than the 715 lb on hand"]} =
               errors(
                 move(c, %{
                   "kind" => "used",
                   "quantity_lb" => "716",
                   "product_id" => c.product.id,
                   "allocation" => "oldest_first"
                 })
               )

      assert eq(on_hand(c.product.id), 715)
    end

    test "oldest first skips an expired lot; a chosen expired lot still gives", c do
      expire!(c.older)

      assert {201, %{"data" => [m]}} =
               move(c, %{
                 "kind" => "used",
                 "quantity_lb" => "100",
                 "product_id" => c.product.id,
                 "allocation" => "oldest_first"
               })

      assert m["lot_id"] == c.newer.id and eq(m["quantity_lb"], -100)

      assert {201, %{"data" => [m]}} =
               move(c, %{"kind" => "used", "quantity_lb" => "55", "lot_id" => c.older.id})

      assert m["lot_id"] == c.older.id
      assert Repo.get!(IngredientLot, c.older.id).status == "expired"
    end

    test "oldest first past the non-expired stock is refused and says so", c do
      expire!(c.older)

      assert %{"base" => [message]} =
               errors(
                 move(c, %{
                   "kind" => "used",
                   "quantity_lb" => "551",
                   "product_id" => c.product.id,
                   "allocation" => "oldest_first"
                 })
               )

      assert message ==
               "That's more than the 10 sacks on hand in lots that aren't expired " <>
                 "(plus 3 sacks in expired lots; pick that lot to use it)"

      assert eq(on_hand(c.product.id), 715)
    end

    test "the product shows its expired stock apart; on_hand_lb stays the total", c do
      expire!(c.older)

      {200, %{"data" => p}} = req(c.brewer, :get, "/api/ingredient_products/#{c.product.id}")
      assert eq(p["on_hand_lb"], 715) and eq(p["expired_lb"], 165)

      {200, %{"data" => list}} = req(c.brewer, :get, "/api/ingredient_products")
      listed = Enum.find(list, &(&1["id"] == c.product.id))
      assert eq(listed["expired_lb"], 165)
      assert Enum.all?(list, &(&1["expired_lb"] != nil))
    end

    test "trades and loans need a partner brewery; other kinds take none", c do
      body = %{"kind" => "loaned_out", "quantity_lb" => "165", "lot_id" => c.newer.id}

      assert %{"base" => ["Pick the partner brewery for a trade or loan"]} = errors(move(c, body))

      assert %{"base" => ["The partner must be a partner brewery"]} =
               errors(move(c, Map.put(body, "party_id", c.bsg.id)))

      assert {201, %{"data" => [%{"partner" => %{"name" => "Mountain Brewing"}} = m]}} =
               move(c, Map.put(body, "party_id", c.mountain.id))

      assert eq(m["quantity_lb"], -165)

      assert {201, %{"data" => [m]}} =
               move(c, %{
                 "kind" => "traded_in",
                 "quantity_lb" => "55",
                 "lot_id" => c.newer.id,
                 "party_id" => c.mountain.id
               })

      assert eq(m["quantity_lb"], 55)

      assert %{"base" => ["Only a trade or a loan names a partner brewery"]} =
               errors(
                 move(c, %{
                   "kind" => "used",
                   "quantity_lb" => "1",
                   "lot_id" => c.newer.id,
                   "party_id" => c.mountain.id
                 })
               )
    end

    test "kind, quantity, target and date are checked", c do
      base = %{"kind" => "used", "quantity_lb" => "1", "lot_id" => c.newer.id}

      assert %{"kind" => ["Counts are recorded with Count"]} =
               errors(move(c, %{base | "kind" => "count"}))

      assert %{"kind" => _} = errors(move(c, %{base | "kind" => "spilled"}))
      too_small = %{"base" => ["Enter a quantity of at least 0.01 lb and under 1,000,000 lb"]}
      assert errors(move(c, %{base | "quantity_lb" => "0"})) == too_small
      assert errors(move(c, %{base | "quantity_lb" => "-5"})) == too_small
      assert errors(move(c, %{base | "quantity_lb" => "0.0001"})) == too_small
      assert errors(move(c, %{base | "quantity_lb" => "0.009"})) == too_small

      assert %{"base" => ["Pick the date"]} =
               errors(move(c, Map.put(base, "occurred_on", "soon")))

      assert %{"allocation" => _} =
               errors(
                 move(c, %{"kind" => "used", "quantity_lb" => "1", "product_id" => c.product.id})
               )

      assert %{"base" => ["Pick the lot this goes into"]} =
               errors(
                 move(c, %{
                   "kind" => "received",
                   "quantity_lb" => "1",
                   "product_id" => c.product.id,
                   "allocation" => "oldest_first"
                 })
               )

      other = product!(c.two_row, c.root_shoot)

      assert %{"base" => ["That lot isn't this product's"]} =
               errors(move(c, Map.put(base, "product_id", other.id)))

      assert Repo.aggregate(Movement, :count) == 2
    end

    test "lb are kept to 2 decimals; 0.01 lb is enough", c do
      assert {201, %{"data" => [m]}} =
               move(c, %{"kind" => "used", "quantity_lb" => "1.006", "lot_id" => c.newer.id})

      assert eq(m["quantity_lb"], "-1.01")
      assert eq(Repo.get!(Movement, m["id"]).quantity_lb, "-1.01")

      assert {201, %{"data" => [m]}} =
               move(c, %{"kind" => "used", "quantity_lb" => "0.01", "lot_id" => c.newer.id})

      assert eq(m["quantity_lb"], "-0.01")
    end

    test "a movement can't be dated after today in Colorado (gap 13)", c do
      body = %{"kind" => "used", "quantity_lb" => "1", "lot_id" => c.newer.id}

      assert %{"base" => ["The date can't be in the future"]} =
               errors(move(c, Map.put(body, "occurred_on", iso(1))))

      assert {201, _} = move(c, Map.put(body, "occurred_on", iso(0)))
      assert {201, _} = move(c, Map.put(body, "occurred_on", iso(-400)))

      assert %{"base" => ["The date can't be in the future"]} =
               errors(
                 req(
                   c.brewer,
                   :post,
                   "/api/ingredient_lots",
                   lot_body(c, %{"received_date" => iso(1)})
                 )
               )

      assert %{"base" => ["The date can't be in the future"]} =
               errors(
                 req(c.brewer, :post, "/api/ingredient_products/#{c.product.id}/count", %{
                   mode: "total",
                   counted_lb: "700",
                   counted_on: iso(1)
                 })
               )
    end

    test "listed by product or lot, newest first; no update or delete routes", c do
      {201, _} = move(c, %{"kind" => "used", "quantity_lb" => "5", "lot_id" => c.older.id})

      {200, %{"data" => by_product}} =
        req(c.brewer, :get, "/api/inventory_movements?product_id=#{c.product.id}")

      assert Enum.map(by_product, & &1["kind"]) == ["used", "opening", "opening"]
      assert hd(by_product)["entered_by"]["name"] == "Jake Brewer"

      {200, %{"data" => by_lot}} =
        req(c.brewer, :get, "/api/inventory_movements?lot_id=#{c.newer.id}")

      assert [%{"lot_number" => "NEW"}] = by_lot

      assert {422, _} = req(c.brewer, :get, "/api/inventory_movements")

      [m | _] = Repo.all(Movement)

      for verb <- [:patch, :delete] do
        assert call(c.brewer, verb, "/api/inventory_movements/#{m.id}").status == 404
      end
    end
  end

  describe "counts (§3.8)" do
    setup c do
      older = stocked_lot!(c.product, day(-30), "165", "OLD")
      newer = stocked_lot!(c.product, day(-7), "550", "NEW")
      %{older: older, newer: newer, path: "/api/ingredient_products/#{c.product.id}/count"}
    end

    test "a total under on hand comes off the oldest lots first", c do
      assert {201, %{"data" => [a, b]}} =
               req(c.p["breweryMgr"], :post, c.path, %{
                 mode: "total",
                 counted_lb: "500",
                 counted_on: iso(0)
               })

      assert {a["lot_id"], a["kind"]} == {c.older.id, "count"}
      assert eq(a["quantity_lb"], -165) and eq(b["quantity_lb"], -50)
      assert a["occurred_on"] == iso(0) and b["occurred_on"] == iso(0)
      assert Repo.get!(IngredientLot, c.older.id).status == "depleted"
      assert eq(on_hand(c.product.id), 500)
    end

    test "a total over on hand goes onto the newest lot; equal writes Counted, no change", c do
      assert {201, %{"data" => [m]}} =
               req(c.brewer, :post, c.path, %{
                 mode: "total",
                 counted_lb: "720",
                 counted_on: iso(0)
               })

      assert m["lot_id"] == c.newer.id and eq(m["quantity_lb"], 5)

      assert {201, %{"data" => [m]}} =
               req(c.brewer, :post, c.path, %{
                 mode: "total",
                 counted_lb: "720",
                 counted_on: iso(0)
               })

      assert %{"kind" => "count", "lot_id" => lot_id, "entered_by" => %{"name" => _}} = m
      assert lot_id == c.newer.id and eq(m["quantity_lb"], 0)
      assert eq(on_hand(c.product.id), 720)
    end

    test "a by-lot count with no difference leaves a 0 on each lot counted", c do
      assert {201, %{"data" => [a, b]}} =
               req(c.brewer, :post, c.path, %{
                 mode: "by_lot",
                 counted_on: iso(0),
                 lots: [
                   %{lot_id: c.older.id, counted_lb: "165"},
                   %{lot_id: c.newer.id, counted_lb: "550"}
                 ]
               })

      assert Enum.sort([a["lot_id"], b["lot_id"]]) == Enum.sort([c.older.id, c.newer.id])
      assert eq(a["quantity_lb"], 0) and eq(b["quantity_lb"], 0)
      assert Repo.get!(IngredientLot, c.older.id).status == "available"
    end

    test "a total overage with every lot expired is refused (gap 11)", c do
      expire!(c.older)
      expire!(c.newer)

      assert %{"base" => ["Every lot is expired; count by lot instead"]} =
               errors(
                 req(c.brewer, :post, c.path, %{
                   mode: "total",
                   counted_lb: "730",
                   counted_on: iso(0)
                 })
               )

      assert eq(on_hand(c.product.id), 715)
    end

    test "by lot writes an adjustment for every lot that differs", c do
      assert {201, %{"data" => [m]}} =
               req(c.brewer, :post, c.path, %{
                 mode: "by_lot",
                 counted_on: iso(0),
                 lots: [
                   %{lot_id: c.older.id, counted_lb: "0"},
                   %{lot_id: c.newer.id, counted_lb: "550"}
                 ]
               })

      assert m["lot_id"] == c.older.id and eq(m["quantity_lb"], -165)
      assert Repo.get!(IngredientLot, c.older.id).status == "depleted"

      assert {201, %{"data" => [m]}} =
               req(c.brewer, :post, c.path, %{
                 mode: "by_lot",
                 counted_on: iso(0),
                 lots: [%{lot_id: c.newer.id, counted_lb: "440"}]
               })

      assert eq(m["quantity_lb"], -110)
    end

    test "a total shortfall skips expired lots; past the non-expired stock is a 422", c do
      expire!(c.older)

      assert {201, %{"data" => [m]}} =
               req(c.brewer, :post, c.path, %{
                 mode: "total",
                 counted_lb: "665",
                 counted_on: iso(0)
               })

      assert m["lot_id"] == c.newer.id and eq(m["quantity_lb"], -50)

      assert %{"base" => [message]} =
               errors(
                 req(c.brewer, :post, c.path, %{
                   mode: "total",
                   counted_lb: "100",
                   counted_on: iso(0)
                 })
               )

      assert message ==
               "The count is 10 sacks 15 lb under on-hand, more than the 9 sacks 5 lb in lots " <>
                 "that aren't expired; count by lot instead"

      assert eq(on_hand(c.product.id), 665)
    end

    test "a total overage goes onto the newest lot that isn't expired", c do
      expire!(c.newer)

      assert {201, %{"data" => [m]}} =
               req(c.brewer, :post, c.path, %{
                 mode: "total",
                 counted_lb: "720",
                 counted_on: iso(0)
               })

      assert m["lot_id"] == c.older.id and eq(m["quantity_lb"], 5)
    end

    test "a by-lot count includes an expired lot", c do
      expire!(c.older)

      assert {201, %{"data" => [m]}} =
               req(c.brewer, :post, c.path, %{
                 mode: "by_lot",
                 counted_on: iso(0),
                 lots: [%{lot_id: c.older.id, counted_lb: "110"}]
               })

      assert m["lot_id"] == c.older.id and eq(m["quantity_lb"], -55)
      assert Repo.get!(IngredientLot, c.older.id).status == "expired"
    end

    test "refusals: mode, date, negative, another product's lot, a lot twice", c do
      post = &req(c.brewer, :post, c.path, &1)
      other = stocked_lot!(product!(c.two_row, c.root_shoot), day(-1), "50")

      assert %{"mode" => _} = errors(post.(%{counted_on: iso(0), counted_lb: "1"}))
      assert %{"base" => ["Pick the date"]} = errors(post.(%{mode: "total", counted_lb: "1"}))

      assert %{"base" => ["The count must be 0 or more and under 1,000,000 lb"]} =
               errors(post.(%{mode: "total", counted_lb: "-1", counted_on: iso(0)}))

      assert %{"lots" => ["a lot isn't this product's"]} =
               errors(
                 post.(%{
                   mode: "by_lot",
                   counted_on: iso(0),
                   lots: [%{lot_id: other.id, counted_lb: "0"}]
                 })
               )

      assert %{"lots" => ["a lot is listed twice"]} =
               errors(
                 post.(%{
                   mode: "by_lot",
                   counted_on: iso(0),
                   lots: [
                     %{lot_id: c.older.id, counted_lb: "0"},
                     %{lot_id: c.older.id, counted_lb: "1"}
                   ]
                 })
               )

      assert Repo.aggregate(Movement, :count) == 3
    end
  end

  describe "categories (§3.1)" do
    test "one level: not its own parent, no grandchildren, a parent stays top-level", c do
      patch = &req(c.brewer, :patch, "/api/ingredient_categories/#{&1}", %{parent_id: &2})

      assert %{"parent_id" => ["can't be the category itself"]} =
               errors(patch.(c.hops.id, c.hops.id))

      assert %{"parent_id" => ["is a subcategory; pick a top-level category"]} =
               errors(patch.(c.hops.id, c.base.id))

      assert %{"parent_id" => [_]} = errors(patch.(c.grains.id, c.hops.id))

      assert {201, %{"data" => %{"parent_id" => parent}}} =
               req(c.brewer, :post, "/api/ingredient_categories", %{
                 name: "Kilned",
                 parent_id: c.grains.id
               })

      assert parent == c.grains.id
      assert Repo.get_by!(IngredientCategory, name: "Kilned").parent_id == c.grains.id
    end

    test "delete: refused with a message while it has grains, ingredients or sub-categories (gap 12)",
         c do
      del = &req(c.brewer, :delete, "/api/ingredient_categories/#{&1}")

      assert %{"base" => ["This category has grains; move them first"]} = errors(del.(c.base.id))

      assert %{"base" => ["This category has sub-categories; move or delete them first"]} =
               errors(del.(c.grains.id))

      Repo.insert!(%RockcutApi.Brewing.Ingredient{name: "Cascade", category_id: c.hops.id})

      assert %{"base" => ["This category has ingredients; move them first"]} =
               errors(del.(c.hops.id))

      empty =
        Repo.insert!(%IngredientCategory{name: "Smoked", sort_order: 9, parent_id: c.grains.id})

      assert {204, _} = del.(empty.id)
      refute Repo.get(IngredientCategory, empty.id)
    end

    test "a new child goes after its siblings; a new top-level category after the top level", c do
      Repo.insert!(%IngredientCategory{name: "Crystal", sort_order: 1, parent_id: c.grains.id})

      top =
        Repo.aggregate(
          from(x in IngredientCategory, where: is_nil(x.parent_id)),
          :max,
          :sort_order
        )

      {201, %{"data" => child}} =
        req(c.brewer, :post, "/api/ingredient_categories", %{
          name: "Smoked",
          parent_id: c.grains.id
        })

      assert child["sort_order"] == 2

      {201, %{"data" => parent}} =
        req(c.brewer, :post, "/api/ingredient_categories", %{name: "Gums"})

      assert parent["sort_order"] == top + 1
    end

    test "the ingredient list's category filter: a parent includes its children, a child only itself",
         c do
      crystal =
        Repo.insert!(%IngredientCategory{name: "Crystal", sort_order: 1, parent_id: c.grains.id})

      Repo.insert!(%RockcutApi.Brewing.Ingredient{name: "C60", category_id: crystal.id})
      Repo.insert!(%RockcutApi.Brewing.Ingredient{name: "Cascade", category_id: c.hops.id})
      names = fn id -> for(i <- list(c.brewer, id), do: i["name"]) end

      assert names.(c.grains.id) == ["2-Row", "C60"]
      assert names.(c.base.id) == ["2-Row"]
      assert names.(crystal.id) == ["C60"]
      assert names.(c.hops.id) == ["Cascade"]
      assert length(names.("")) == 3
    end
  end

  describe "quantity display (§3.9)" do
    test "a Brewery member saves sacks or lb; another person's is unaffected", c do
      path = "/api/me/board_settings/ingredients"

      assert {200, %{"quantity_display" => "lb"}} =
               req(c.brewer, :put, path, %{quantity_display: "lb"})

      assert %{"quantity_display" => _} =
               errors(req(c.brewer, :put, path, %{quantity_display: "kg"}))

      assert %{"span" => _} = errors(req(c.brewer, :put, path, %{span: 7}))

      assert {200, %{"quantity_display" => "sacks"}} =
               req(c.p["floater"], :put, path, %{})

      {200, me} = req(c.brewer, :get, "/api/me")
      assert me["board_settings"]["ingredients"] == %{"quantity_display" => "lb"}

      assert {403, _} = req(c.p["bartender1"], :put, path, %{quantity_display: "lb"})
    end
  end

  test "inventory_on_hand: a product's or an ingredient's lb", c do
    stocked_lot!(c.product, day(-2), "110.5")
    ctx = %{repo: Repo}
    run = &RockcutApi.Formulas.FormulaRuntime.execute("inventory_on_hand", &1, ctx)

    assert {:ok, %{value: 110.5}} = run.(%{"product_id" => c.product.id})
    assert {:ok, %{value: 110.5}} = run.(%{"ingredient_id" => c.two_row.id})
    assert {:error, :validation_error, _} = run.(%{})
  end
end
