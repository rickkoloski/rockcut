defmodule RockcutApiWeb.D64Stop1Test do
  @moduledoc """
  D64 Stop 1 on the API (spec §2 decisions 1–6, §4.1–§4.3, §4.6, §6.4,
  Amendment; plan Stop 1): yeast managed in the Catalog (Dry and Liquid,
  `each` read as bricks and pitchables, brick / pitchable / case packs by
  form), the lab required, the code as the product's name, the yeast
  features (temp and attenuation ranges, pitch size on Liquid only, copied
  to a lot and required there), no subcategory or field on Yeast Strains,
  Strain Types (`/api/yeast/strain_types`, managers and owners write), the
  Pitch of purchased yeast into a batch, and the batches it names. Every
  rule has a refusal and an allowed case.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IngredientFixtures, except: [product!: 2]
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Ingredients.{Catalog, Movement, Products}
  alias RockcutApi.Yeast.StrainType

  setup do
    p = personas(~w(owner brewer1 breweryMgr bartender1 splitRole))
    c = Map.merge(grain_catalog!(), yeast_catalog!())

    Map.merge(c, %{
      brewer: p["brewer1"],
      owner: p["owner"],
      mgr: p["breweryMgr"],
      bartender: p["bartender1"],
      split: p["splitRole"]
    })
  end

  defp req(user, verb, path, params \\ %{}) do
    conn = call(user, verb, path, params)
    {conn.status, if(conn.resp_body == "", do: nil, else: Jason.decode!(conn.resp_body))}
  end

  defp errors({422, %{"errors" => errors}}), do: errors
  defp base({422, %{"errors" => %{"base" => [message]}}}), do: message
  defp today, do: Date.to_iso8601(Tasks.today())
  defp days_ago(n), do: Date.to_iso8601(Date.add(Tasks.today(), -n))

  defp product(c, attrs), do: req(c.brewer, :post, "/api/ingredient_products", attrs)

  defp product!(c, attrs) do
    {201, %{"data" => p}} = product(c, attrs)
    p
  end

  defp us05!(c, extra \\ %{}),
    do:
      product!(
        c,
        Map.merge(
          %{
            "ingredient_id" => c.chico.id,
            "manufacturer_party_id" => c.fermentis.id,
            "form" => "Dry",
            "name" => "US-05"
          },
          extra
        )
      )

  defp wlp001!(c, extra \\ %{}),
    do:
      product!(
        c,
        Map.merge(
          %{
            "ingredient_id" => c.california.id,
            "manufacturer_party_id" => c.white_labs.id,
            "form" => "Liquid",
            "name" => "WLP001"
          },
          extra
        )
      )

  defp lot(c, product_id, quantity, extra \\ %{}) do
    req(
      c.brewer,
      :post,
      "/api/ingredient_lots",
      Map.merge(
        %{
          "product_id" => product_id,
          "received_date" => today(),
          "initial_kind" => "opening",
          "initial_quantity" => quantity
        },
        extra
      )
    )
  end

  defp lot!(c, product_id, quantity, extra \\ %{}) do
    {201, %{"data" => lot}} = lot(c, product_id, quantity, extra)
    lot
  end

  describe "Catalog (§4.1)" do
    test "yeast is managed: Dry and Liquid, each, packs by form, labels by form; a Liquid fining stays each" do
      assert Catalog.managed?("yeast")
      assert Catalog.forms("yeast") == ["Dry", "Liquid"]
      assert Catalog.units("yeast") == ["each"]
      assert Catalog.pack_names("yeast") == ~w(brick pitchable case)
      assert Catalog.pack_names_for("yeast", nil, "Dry") == ~w(brick case)
      assert Catalog.pack_names_for("yeast", nil, "Liquid") == ~w(pitchable case)
      assert Catalog.yeast_pack("Dry") == "brick" and Catalog.yeast_pack("Liquid") == "pitchable"
      assert Catalog.unit_label("each", "Dry", "yeast") == "bricks"
      assert Catalog.unit_label("each", "Liquid", "yeast") == "pitchables"
      # The refusal side: the same form and unit elsewhere reads as before.
      assert Catalog.unit_label("each", "Liquid", "consumables") == "each"
      assert Catalog.unit_label("each", "Tablet") == "tablets"
      assert Catalog.manufacturer_required?("yeast")
      refute Catalog.manufacturer_required?("fruits")
      refute Catalog.allows_children?("yeast") or Catalog.allows_fields?("yeast")
      assert Catalog.allows_children?("grains") and Catalog.allows_fields?("consumables")
    end

    test "the category describes its form packs and labels", c do
      {200, %{"data" => category}} =
        req(c.brewer, :get, "/api/ingredient_categories/#{c.yeast.id}")

      assert category["catalog"]["managed"]
      assert category["catalog"]["forms"] == ["Dry", "Liquid"]
      assert category["catalog"]["form_packs"] == %{"Dry" => "brick", "Liquid" => "pitchable"}

      assert category["catalog"]["form_unit_labels"] == %{
               "Dry" => "bricks",
               "Liquid" => "pitchables"
             }

      refute category["catalog"]["allows_children"] or category["catalog"]["allows_fields"]
    end
  end

  describe "yeast products (§4.1, §4.2, A1, A3)" do
    test "the lab is required; with one it saves", c do
      body = %{"ingredient_id" => c.chico.id, "form" => "Dry", "name" => "US-05"}
      assert %{"manufacturer_party_id" => ["can't be blank"]} = errors(product(c, body))

      p = product!(c, Map.put(body, "manufacturer_party_id", c.fermentis.id))
      assert p["manufacturer"]["name"] == "Fermentis"
    end

    test "the code (product name) is required; with one it saves", c do
      body = %{
        "ingredient_id" => c.chico.id,
        "manufacturer_party_id" => c.fermentis.id,
        "form" => "Dry"
      }

      assert %{"name" => ["Enter the lab's code (the strain ID, e.g. US-05)"]} =
               errors(product(c, body))

      assert %{"name" => [_]} = errors(product(c, Map.put(body, "name", "  ")))
      assert product!(c, Map.put(body, "name", "US-05"))["name"] == "US-05"
    end

    test "Dry or Liquid only, and the unit is each", c do
      body = %{
        "ingredient_id" => c.chico.id,
        "manufacturer_party_id" => c.fermentis.id,
        "name" => "US-05"
      }

      assert %{"form" => ["must be one of Dry, Liquid"]} =
               errors(product(c, Map.put(body, "form", "Slurry")))

      assert %{"unit" => ["must be one of each"]} =
               errors(product(c, Map.merge(body, %{"form" => "Dry", "unit" => "lb"})))

      p = product!(c, Map.put(body, "form", "Dry"))
      assert p["unit"] == "each"
    end

    test "reads 'Chico Ale US-05 · Fermentis' in bricks; a Liquid one in pitchables", c do
      p = us05!(c)
      assert p["display_name"] == "Chico Ale US-05 · Fermentis"
      assert p["unit_label"] == "bricks"
      assert p["category_key"] == "yeast"

      w = wlp001!(c)
      assert w["display_name"] == "California Ale WLP001 · White Labs"
      assert w["unit_label"] == "pitchables"

      # Grain keeps its own name.
      {200, %{"data" => grain}} = req(c.brewer, :get, "/api/ingredient_products/#{c.product.id}")
      assert grain["display_name"] == "Rahr 2-Row"
    end

    test "the same code from the same lab and form, any case, is a duplicate", c do
      us05!(c)

      assert %{"base" => ["Fermentis already has Dry Chico Ale (US-05)."]} =
               errors(
                 product(c, %{
                   "ingredient_id" => c.chico.id,
                   "manufacturer_party_id" => c.fermentis.id,
                   "form" => "Dry",
                   "name" => "us-05"
                 })
               )

      assert us05!(c, %{"name" => "S-04"})["name"] == "S-04"
    end

    test "search: a list filter by manufacturer finds the lab's products", c do
      us05!(c)
      wlp001!(c)

      {200, %{"data" => list}} =
        req(c.brewer, :get, "/api/ingredient_products?manufacturer_id=#{c.white_labs.id}")

      assert Enum.map(list, & &1["name"]) == ["WLP001"]
    end
  end

  describe "features (§4.3, Amendment 6)" do
    test "temp and attenuation are typical ranges on the product, in bounds", c do
      p =
        us05!(c, %{
          "features" => %{
            "ferm_temp_f" => %{"low" => "59", "high" => "75"},
            "attenuation_pct" => %{"low" => "78", "high" => "82"}
          }
        })

      assert p["features"]["ferm_temp_f"]["value"] == "59"
      assert p["features"]["ferm_temp_f"]["value_high"] == "75"

      assert %{"features" => %{"ferm_temp_f" => ["Fermentation temp must be between 32 and 100"]}} =
               errors(
                 req(c.brewer, :put, "/api/ingredient_products/#{p["id"]}", %{
                   "lock_version" => p["lock_version"],
                   "features" => %{"ferm_temp_f" => %{"low" => "59", "high" => "101"}}
                 })
               )

      assert %{"features" => %{"attenuation_pct" => ["Attenuation: low is above high"]}} =
               errors(
                 req(c.brewer, :put, "/api/ingredient_products/#{p["id"]}", %{
                   "lock_version" => p["lock_version"],
                   "features" => %{"attenuation_pct" => %{"low" => "82", "high" => "78"}}
                 })
               )
    end

    test "pitch size is for Liquid products only, and optional there", c do
      assert %{"features" => %{"pitch_bbl" => ["Pitch size is only for Liquid yeast"]}} =
               errors(
                 product(c, %{
                   "ingredient_id" => c.chico.id,
                   "manufacturer_party_id" => c.fermentis.id,
                   "form" => "Dry",
                   "name" => "US-05",
                   "features" => %{"pitch_bbl" => "7"}
                 })
               )

      assert wlp001!(c)["features"] == %{}
      w = wlp001!(c, %{"name" => "WLP002", "features" => %{"pitch_bbl" => "7"}})
      assert w["features"]["pitch_bbl"]["value"] == "7"

      assert %{"features" => %{"pitch_bbl" => ["Pitch size must be between 0.5 and 60"]}} =
               errors(
                 req(c.brewer, :put, "/api/ingredient_products/#{w["id"]}", %{
                   "lock_version" => w["lock_version"],
                   "features" => %{"pitch_bbl" => "0.4"}
                 })
               )

      assert %{"features" => %{"pitch_bbl" => ["Pitch size: Use at most 1 decimal"]}} =
               errors(
                 req(c.brewer, :put, "/api/ingredient_products/#{w["id"]}", %{
                   "lock_version" => w["lock_version"],
                   "features" => %{"pitch_bbl" => "7.25"}
                 })
               )
    end

    test "a Liquid product changed to Dry (no lots yet) drops its pitch size", c do
      w = wlp001!(c, %{"features" => %{"pitch_bbl" => "7"}})

      {200, %{"data" => dry}} =
        req(c.brewer, :put, "/api/ingredient_products/#{w["id"]}", %{
          "lock_version" => w["lock_version"],
          "form" => "Dry"
        })

      assert dry["features"] == %{}
      assert dry["unit_label"] == "bricks"
    end

    test "a Liquid lot needs its pitch size: copied from the product, or typed", c do
      bare = wlp001!(c)

      assert %{"features" => %{"pitch_bbl" => ["Pitch size can't be blank"]}} =
               errors(lot(c, bare["id"], "2"))

      typed = lot!(c, bare["id"], "2", %{"features" => %{"pitch_bbl" => "10"}})
      assert typed["features"]["pitch_bbl"]["value"] == "10"

      seven = wlp001!(c, %{"name" => "WLP002", "features" => %{"pitch_bbl" => "7"}})
      copied = lot!(c, seven["id"], "1")
      assert copied["features"]["pitch_bbl"]["value"] == "7"

      # The lot keeps its own size; the product still says 7.
      ten =
        lot!(c, seven["id"], "1", %{"lot_number" => "L10", "features" => %{"pitch_bbl" => "10"}})

      assert ten["features"]["pitch_bbl"]["value"] == "10"

      {200, %{"data" => p}} = req(c.brewer, :get, "/api/ingredient_products/#{seven["id"]}")
      assert p["features"]["pitch_bbl"]["value"] == "7"
    end

    test "a Dry lot takes no pitch size and needs none", c do
      p = us05!(c)

      assert %{"features" => %{"pitch_bbl" => ["Pitch size is only for Liquid yeast"]}} =
               errors(lot(c, p["id"], "2", %{"features" => %{"pitch_bbl" => "7"}}))

      assert lot!(c, p["id"], "2")["features"] == %{}
    end

    test "temp and attenuation aren't on a lot", c do
      p = us05!(c)

      assert %{"features" => %{"ferm_temp_f" => ["Fermentation temp isn't set on a lot"]}} =
               errors(lot(c, p["id"], "2", %{"features" => %{"ferm_temp_f" => "60"}}))
    end
  end

  describe "whole bricks and pitchables (§4.1)" do
    test "a fraction is refused naming the code; a whole count is kept", c do
      p = us05!(c)

      assert base(lot(c, p["id"], "1.5")) == "US-05 is counted in whole bricks"
      lot = lot!(c, p["id"], "4")
      assert lot["on_hand"] == "4"
      assert lot["pack_name"] == "brick"

      w = wlp001!(c, %{"features" => %{"pitch_bbl" => "7"}})
      assert base(lot(c, w["id"], "0.5")) =~ "pitchable"
      assert lot!(c, w["id"], "1")["pack_name"] == "pitchable"

      assert base(
               req(c.brewer, :post, "/api/inventory_movements", %{
                 "kind" => "used",
                 "quantity" => "1.5",
                 "occurred_on" => today(),
                 "lot_id" => lot["id"]
               })
             ) == "US-05 is counted in whole bricks"
    end

    test "too little reads in bricks: 'at least 1 brick'", c do
      p = us05!(c)
      assert base(lot(c, p["id"], "0")) =~ "at least 1 brick and under 1,000,000 bricks"
    end
  end

  describe "offers and lots by form (§4.1)" do
    test "a Dry offer starts as a brick and takes brick or case; a pitchable is refused", c do
      p = us05!(c)
      body = %{"product_id" => p["id"], "supplier_party_id" => c.bsg.id, "pack_size" => "1"}

      {201, %{"data" => offer}} = req(c.brewer, :post, "/api/supplier_offers", body)
      assert offer["pack_name"] == "brick"

      assert %{"pack_name" => ["must be brick or case"]} =
               errors(
                 req(
                   c.brewer,
                   :post,
                   "/api/supplier_offers",
                   Map.put(body, "pack_name", "pitchable")
                 )
               )

      {201, %{"data" => case_offer}} =
        req(
          c.brewer,
          :post,
          "/api/supplier_offers",
          Map.merge(body, %{"pack_name" => "case", "pack_size" => "10"})
        )

      assert case_offer["pack_name"] == "case"
    end

    test "a Liquid offer starts as a pitchable; a brick is refused", c do
      w = wlp001!(c)

      body = %{
        "product_id" => w["id"],
        "supplier_party_id" => c.white_labs.id,
        "pack_size" => "1"
      }

      {201, %{"data" => offer}} = req(c.brewer, :post, "/api/supplier_offers", body)
      assert offer["pack_name"] == "pitchable"

      assert %{"pack_name" => ["must be pitchable or case"]} =
               errors(
                 req(c.brewer, :post, "/api/supplier_offers", Map.put(body, "pack_name", "brick"))
               )
    end

    test "a fractional pack size is refused on an offer", c do
      p = us05!(c)

      assert base(
               req(c.brewer, :post, "/api/supplier_offers", %{
                 "product_id" => p["id"],
                 "supplier_party_id" => c.bsg.id,
                 "pack_size" => "1.5"
               })
             ) == "US-05 is counted in whole bricks"
    end

    test "a yeast lot needs its product", c do
      assert %{"product_id" => ["A lot needs its product"]} =
               errors(
                 req(c.brewer, :post, "/api/ingredient_lots", %{
                   "ingredient_id" => c.chico.id,
                   "received_date" => today(),
                   "initial_kind" => "opening",
                   "initial_quantity" => "1"
                 })
               )
    end
  end

  describe "no subcategory or field on Yeast Strains (§4.1)" do
    test "both refused (422); Grains still takes a child", c do
      assert %{"parent_id" => ["Yeast Strains has no subcategories"]} =
               errors(
                 req(c.owner, :post, "/api/ingredient_categories", %{
                   "name" => "Lager yeast",
                   "parent_id" => c.yeast.id
                 })
               )

      assert %{"category_id" => ["Yeast Strains use products, not custom fields"]} =
               errors(
                 req(c.owner, :post, "/api/category_field_definitions", %{
                   "category_id" => c.yeast.id,
                   "field_name" => "Lab",
                   "field_type" => "text"
                 })
               )

      {201, _} =
        req(c.owner, :post, "/api/ingredient_categories", %{
          "name" => "Smoked",
          "parent_id" => c.grains.id
        })
    end
  end

  describe "strain types (A13)" do
    test "seeded Ale, Lager, Brett and Lacto; every Brewery member lists them", c do
      {200, %{"data" => types, "can_manage" => false}} =
        req(c.brewer, :get, "/api/yeast/strain_types")

      assert Enum.take(Enum.map(types, & &1["name"]), 4) == ~w(Ale Lager Brett Lacto)
      assert Enum.find(types, &(&1["name"] == "Ale"))["in_use"] == 1

      {200, %{"can_manage" => true}} = req(c.mgr, :get, "/api/yeast/strain_types")
      {200, %{"can_manage" => true}} = req(c.owner, :get, "/api/yeast/strain_types")
      {403, _} = req(c.bartender, :get, "/api/yeast/strain_types")
    end

    test "a Brewery member can't add, change or delete one; a manager and an owner can", c do
      {403, _} = req(c.brewer, :post, "/api/yeast/strain_types", %{"name" => "Kveik"})
      # splitRole manages Taproom and is an employee in Brewery.
      {403, _} = req(c.split, :post, "/api/yeast/strain_types", %{"name" => "Kveik"})

      {201, %{"data" => kveik}} =
        req(c.mgr, :post, "/api/yeast/strain_types", %{"name" => "Kveik", "position" => "9"})

      assert kveik["active"] and kveik["in_use"] == 0
      {403, _} = req(c.brewer, :patch, "/api/yeast/strain_types/#{kveik["id"]}", %{"name" => "K"})
      {403, _} = req(c.brewer, :delete, "/api/yeast/strain_types/#{kveik["id"]}")

      {200, %{"data" => %{"name" => "Kveik (Voss)"}}} =
        req(c.owner, :patch, "/api/yeast/strain_types/#{kveik["id"]}", %{"name" => "Kveik (Voss)"})

      {204, _} = req(c.mgr, :delete, "/api/yeast/strain_types/#{kveik["id"]}")
      {404, _} = req(c.mgr, :delete, "/api/yeast/strain_types/#{kveik["id"]}")
    end

    test "names are unique in any case", c do
      assert %{"base" => ["There's already a strain type with that name"]} =
               errors(req(c.mgr, :post, "/api/yeast/strain_types", %{"name" => "ale"}))

      assert %{"name" => ["can't be blank"]} =
               errors(req(c.mgr, :post, "/api/yeast/strain_types", %{"name" => " "}))

      {201, _} = req(c.mgr, :post, "/api/yeast/strain_types", %{"name" => "Ale blend"})
    end

    test "a type in use is renamed or retired, not deleted", c do
      {201, %{"data" => t}} = req(c.mgr, :post, "/api/yeast/strain_types", %{"name" => "Wild"})

      {200, _} =
        req(c.brewer, :put, "/api/ingredients/#{c.california.id}", %{
          "yeast_strain_type_id" => t["id"]
        })

      assert base(req(c.mgr, :delete, "/api/yeast/strain_types/#{t["id"]}")) ==
               "Strains use this type, so it can't be deleted; retire it instead"

      {200, %{"data" => %{"name" => "Wild yeast", "in_use" => 1}}} =
        req(c.mgr, :patch, "/api/yeast/strain_types/#{t["id"]}", %{"name" => "Wild yeast"})

      {200, %{"data" => %{"active" => false}}} =
        req(c.mgr, :patch, "/api/yeast/strain_types/#{t["id"]}", %{"active" => false})

      {200, %{"data" => %{"active" => true}}} =
        req(c.mgr, :patch, "/api/yeast/strain_types/#{t["id"]}", %{"active" => "true"})
    end

    test "a strain takes an active type; a retired one stays where it is but isn't a new pick",
         c do
      {201, %{"data" => t}} = req(c.mgr, :post, "/api/yeast/strain_types", %{"name" => "Old"})

      put =
        &req(c.brewer, :put, "/api/ingredients/#{&1.id}", %{"yeast_strain_type_id" => t["id"]})

      {200, %{"data" => %{"yeast_strain_type_id" => id}}} = put.(c.california)
      assert id == t["id"]
      {200, _} = req(c.mgr, :patch, "/api/yeast/strain_types/#{t["id"]}", %{"active" => false})

      # Kept on save; a new pick of it is refused.
      {200, %{"data" => %{"yeast_strain_type_id" => ^id}}} =
        req(c.brewer, :put, "/api/ingredients/#{c.california.id}", %{"notes" => "x"})

      assert %{"yeast_strain_type_id" => ["Old is retired"]} = errors(put.(c.chico))
    end

    test "only a yeast strain has a type", c do
      ale = Repo.get_by!(StrainType, name: "Ale")

      assert %{"yeast_strain_type_id" => ["is only for yeast strains"]} =
               errors(
                 req(c.brewer, :put, "/api/ingredients/#{c.two_row.id}", %{
                   "yeast_strain_type_id" => ale.id
                 })
               )

      {201, %{"data" => strain}} =
        req(c.brewer, :post, "/api/ingredients", %{
          "name" => "London Ale",
          "category_id" => c.yeast.id,
          "yeast_strain_type_id" => ale.id
        })

      assert strain["yeast_strain_type_id"] == ale.id
    end

    test "the product's ingredient carries its type for the library", c do
      us05!(c)

      {200, %{"data" => [p]}} =
        req(c.brewer, :get, "/api/ingredient_products?ingredient_id=#{c.chico.id}")

      assert p["ingredient"]["yeast_strain_type_id"] == c.ale.id
    end
  end

  describe "pitch from purchased yeast (§4.6, §6.4)" do
    setup c do
      p = us05!(c)
      old = lot!(c, p["id"], "2", %{"lot_number" => "F1", "received_date" => days_ago(10)})
      new = lot!(c, p["id"], "3", %{"lot_number" => "F2", "received_date" => days_ago(2)})
      %{us05: p, old_lot: old, new_lot: new, batch: batch!("41")}
    end

    defp pitch(c, attrs, user \\ nil),
      do:
        req(
          user || c.brewer,
          :post,
          "/api/ingredient_products/#{c.us05["id"]}/pitch",
          Map.merge(
            %{"occurred_on" => today(), "batch_id" => c.batch.id, "quantity" => "1"},
            attrs
          )
        )

    test "Oldest first without a lot: 3 bricks take F1's 2 and 1 of F2, each naming the batch",
         c do
      {201, %{"data" => movements}} = pitch(c, %{"quantity" => "3", "note" => "brew day"})

      assert Enum.map(movements, &{&1["lot_number"], &1["quantity"], &1["kind"]}) ==
               [{"F1", "-2", "used"}, {"F2", "-1", "used"}]

      assert Enum.all?(movements, &(&1["batch_id"] == c.batch.id))
      assert Enum.all?(movements, &(&1["note"] == "brew day"))

      {200, %{"data" => p}} = req(c.brewer, :get, "/api/ingredient_products/#{c.us05["id"]}")
      assert p["on_hand"] == "2"
    end

    test "a picked lot gives it all; another product's lot is refused", c do
      {201, %{"data" => [m]}} = pitch(c, %{"lot_id" => c.new_lot["id"], "quantity" => "2"})
      assert m["lot_number"] == "F2" and m["batch_id"] == c.batch.id

      other = lot!(c, wlp001!(c, %{"features" => %{"pitch_bbl" => "7"}})["id"], "1")
      assert base(pitch(c, %{"lot_id" => other["id"]})) == "That lot isn't this product's"
    end

    test "the batch is required and must exist", c do
      assert %{"batch_id" => ["Pick the batch"]} = errors(pitch(c, %{"batch_id" => ""}))
      assert %{"batch_id" => ["does not exist"]} = errors(pitch(c, %{"batch_id" => 999_999}))
      # A wrong-type id is D55's `ParamIds` 422.
      assert %{"batch_id" => ["is invalid"]} = errors(pitch(c, %{"batch_id" => "x"}))
    end

    test "whole bricks only, at least 1, and no more than on hand", c do
      assert base(pitch(c, %{"quantity" => "1.5"})) == "US-05 is counted in whole bricks"
      assert base(pitch(c, %{"quantity" => "0"})) =~ "at least 1 brick"
      assert base(pitch(c, %{"quantity" => "6"})) =~ "That's more than the"
      assert base(pitch(c, %{"lot_id" => c.old_lot["id"], "quantity" => "3"})) =~ "lot F1"

      refute Repo.exists?(from m in Movement, where: not is_nil(m.batch_id))
    end

    test "the date can't be in the future; today or before is fine", c do
      tomorrow = Date.to_iso8601(Date.add(Tasks.today(), 1))
      assert base(pitch(c, %{"occurred_on" => tomorrow})) == "The date can't be in the future"
      {201, _} = pitch(c, %{"occurred_on" => days_ago(1)})
    end

    test "only yeast is pitched", c do
      stocked_lot!(c.product, Tasks.today(), "110")

      assert base(
               req(c.brewer, :post, "/api/ingredient_products/#{c.product.id}/pitch", %{
                 "occurred_on" => today(),
                 "batch_id" => c.batch.id,
                 "quantity" => "1"
               })
             ) == "Only yeast is pitched into a batch; record a movement instead"
    end

    test "a bartender and the brewhouse device are refused (403); an owner pitches", c do
      {403, _} = pitch(c, %{}, c.bartender)
      {201, _} = pitch(c, %{}, c.owner)

      device = RockcutApi.AccountsFixtures.device_fixture(%{home: "brewery", name: "Brewhouse"})
      token = RockcutApi.AccountsFixtures.device_token_fixture(device, "Brewhouse iPad")

      assert call_device(token, :post, "/api/ingredient_products/#{c.us05["id"]}/pitch", %{
               "occurred_on" => today(),
               "batch_id" => c.batch.id,
               "quantity" => "1"
             }).status == 403

      assert call_device(token, :get, "/api/yeast/strain_types").status == 403
      assert call_device(token, :get, "/api/yeast/batches").status == 403
    end

    test "movements list the batch", c do
      {201, _} = pitch(c, %{"quantity" => "1"})

      {200, %{"data" => [m | _]}} =
        req(c.brewer, :get, "/api/inventory_movements?product_id=#{c.us05["id"]}")

      assert m["batch_id"] == c.batch.id
    end
  end

  describe "the batches a pitch names" do
    test "every batch with its label, newest first; completed and dumped aren't open", c do
      done = batch!("39", "completed")
      open = batch!("41")

      {200, %{"data" => batches}} = req(c.brewer, :get, "/api/yeast/batches")
      by_id = Map.new(batches, &{&1["id"], &1})

      assert by_id[open.id]["label"] == "Galactic #41" and by_id[open.id]["open"]
      assert by_id[done.id]["number"] == "#39"
      refute by_id[done.id]["open"]

      {403, _} = req(c.bartender, :get, "/api/yeast/batches")
    end
  end

  test "Products.unit_label by id reads the yeast label", c do
    p = us05!(c)
    assert Products.unit_label(p["id"]) == "bricks"
    assert Products.unit_label(c.product.id) == "lb"
  end
end
