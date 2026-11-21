defmodule RockcutApiWeb.D61FixCycle1Test do
  @moduledoc """
  D61 local QA fix cycle 1 (`d61_lead_decisions_1.md`, spec Amendments) on
  the API: contract figures by expected year and by weight, totals that
  don't net, delete_blocked (gaps 2, 3, 17, 18); 2-decimal prices (11);
  receive dates, every line and feature places (12, 13, 15); order totals
  dates and sacks (8, 9); the saved reorder offer (4); the order in a
  receipt's note (item 18). Each rule has a refusal and an allowed case.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IngredientFixtures

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Brewing.IngredientLot
  alias RockcutApi.Ingredients.{Movement, PurchaseOrder}

  setup do
    p = personas(~w(brewer1 breweryMgr))
    c = grain_catalog!()
    price!(c.offer, "44.00")
    offer50 = offer!(c.product, c.bsg, "50", "40.00")

    pils_grain =
      Repo.insert!(%RockcutApi.Brewing.Ingredient{name: "Pilsner", category_id: c.base.id})

    pils = product!(pils_grain, party!("Weyermann", ~w(manufacturer)), extract_fgdb: "81.0")
    pils_offer = offer!(pils, c.bsg, "55", "55.00")

    Map.merge(c, %{
      p: p,
      brewer: p["brewer1"],
      mgr: p["breweryMgr"],
      offer50: offer50,
      pils: pils,
      pils_offer: pils_offer,
      this: Tasks.today().year
    })
  end

  defp today, do: Tasks.today()
  defp iso(offset), do: Date.to_iso8601(Date.add(today(), offset))

  defp req(user, verb, path, params \\ %{}) do
    conn = call(user, verb, path, params)
    {conn.status, if(conn.resp_body == "", do: nil, else: Jason.decode!(conn.resp_body))}
  end

  defp base({422, %{"errors" => %{"base" => [message]}}}), do: message
  defp errors({422, %{"errors" => errors}}), do: errors

  defp order!(c, lines, extra \\ %{}) do
    {201, %{"data" => data}} =
      req(
        c.brewer,
        :post,
        "/api/purchase_orders",
        Map.merge(
          %{"supplier_party_id" => c.bsg.id, "ordered_on" => iso(0), "lines" => lines},
          extra
        )
      )

    data
  end

  defp line(offer, sacks, extra \\ %{}),
    do: Map.merge(%{"offer_id" => offer.id, "packs_ordered" => sacks}, extra)

  # Every line in full into a new lot named after the line.
  defp receive_all!(c, order, on \\ iso(0)) do
    lines =
      for l <- order["lines"] do
        %{
          "id" => l["id"],
          "packs_received" => l["packs_ordered"],
          "allocations" => [%{"lot_number" => "L-#{l["id"]}", "packs" => l["packs_ordered"]}]
        }
      end

    {200, %{"data" => data}} =
      req(c.brewer, :post, "/api/purchase_orders/#{order["id"]}/receive", %{
        "received_on" => on,
        "lines" => lines
      })

    data
  end

  defp by_product(contract, product),
    do: Enum.find(contract["lines"], &(&1["product_id"] == product.id))

  describe "contract figures (amendments 2a, 17a; gaps 3, 18)" do
    test "a line counts every offer of its product by weight in its sack size; open orders by expected year; totals don't net; delete_blocked",
         c do
      {201, %{"data" => contract}} =
        req(c.mgr, :post, "/api/contracts", %{
          "supplier_party_id" => c.bsg.id,
          "year" => c.this,
          "lines" => [
            %{
              "product_id" => c.product.id,
              "offer_id" => c.offer50.id,
              "quantity" => 10,
              "price" => "40.00"
            },
            %{"product_id" => c.pils.id, "quantity" => 20, "price" => "55.00"}
          ]
        })

      assert contract["delete_blocked"] == nil
      assert contract["remaining"] == 30 and contract["over"] == 0

      # 5 × 50 lb + 5 × 55 lb = 525 lb = 10.5 of the line's 50 lb sacks.
      receive_all!(c, order!(c, [line(c.offer50, 5)]))
      receive_all!(c, order!(c, [line(c.offer, 5)]))

      # Open: ordered last year, expected this year → on order this year
      # (4 × 55 lb = 4.4 × 50 lb); ordered this year, expected next → not.
      order!(c, [line(c.offer, 4)], %{
        "ordered_on" => "#{c.this - 1}-12-31",
        "expected_on" => iso(0)
      })

      order!(c, [line(c.offer50, 7)], %{"expected_on" => "#{c.this + 1}-01-02"})

      {200, %{"data" => got}} = req(c.brewer, :get, "/api/contracts/#{contract["id"]}")
      rahr = by_product(got, c.product)

      assert rahr["received"] == 10.5 and rahr["on_order"] == 4.4
      assert rahr["remaining"] == -0.5 and rahr["over_by"] == 0.5
      # Dollars at the order line prices: 5 × $40 + 5 × $44.
      assert rahr["received_dollars"] == "420.00"
      assert by_product(got, c.pils)["remaining"] == 20

      # Gap 3: what's still owed is 20 (as Shortfall), the 0.5 over is apart.
      assert got["remaining"] == 20 and got["over"] == 0.5

      assert {200, %{"data" => [short]}} =
               req(c.brewer, :get, "/api/contracts/shortfall?year=#{c.this}")

      assert short["product_id"] == c.pils.id and short["short"] == 20

      # Gap 18: the reason on the JSON, and the same refusal.
      reason = "Grain has been received against this contract, so it can't be deleted"
      assert got["delete_blocked"] == reason
      assert base(req(c.mgr, :delete, "/api/contracts/#{contract["id"]}")) == reason

      # Next year's: the order expected then is on order there; nothing received.
      {201, %{"data" => next}} =
        req(c.mgr, :post, "/api/contracts", %{
          "supplier_party_id" => c.bsg.id,
          "year" => c.this + 1,
          "lines" => [
            %{
              "product_id" => c.product.id,
              "offer_id" => c.offer50.id,
              "quantity" => 10,
              "price" => "40.00"
            }
          ]
        })

      assert by_product(next, c.product)["on_order"] == 7
      assert next["delete_blocked"] == nil
      assert {204, _} = req(c.mgr, :delete, "/api/contracts/#{next["id"]}")
    end
  end

  describe "prices to 2 decimals (gap 11)" do
    test "order lines, contract lines and offer prices refuse a third decimal; 2 are fine", c do
      for {path, body, who, key} <- [
            {"/api/purchase_orders",
             %{
               "supplier_party_id" => c.bsg.id,
               "ordered_on" => iso(0),
               "lines" => [line(c.offer, 1, %{"price_per_pack" => "42.555"})]
             }, c.brewer, "price_per_pack"},
            {"/api/contracts",
             %{
               "supplier_party_id" => c.bsg.id,
               "year" => c.this + 2,
               "lines" => [
                 %{"product_id" => c.pils.id, "quantity" => 1, "price" => "35.555"}
               ]
             }, c.mgr, "price"},
            {"/api/supplier_offers/#{c.pils_offer.id}/prices",
             %{"price_per_pack" => "35.555", "effective_on" => iso(0)}, c.brewer,
             "price_per_pack"}
          ] do
        assert %{^key => ["Use at most 2 decimals"]} = errors(req(who, :post, path, body))
      end

      # Nothing written: no contract price row of 35.555.
      refute Enum.any?(
               Repo.all(RockcutApi.Ingredients.OfferPrice),
               &Decimal.eq?(&1.price_per_pack, Decimal.new("35.555"))
             )

      assert %{"lines" => [%{"price_per_pack" => "42.55"}]} =
               order!(c, [line(c.offer, 1, %{"price_per_pack" => "42.55"})])

      assert {201, _} =
               req(c.brewer, :post, "/api/supplier_offers/#{c.pils_offer.id}/prices", %{
                 "price_per_pack" => 35.5,
                 "effective_on" => iso(0)
               })
    end
  end

  describe "receive (gaps 12, 13, 15)" do
    setup c do
      stocked_lot!(c.product, Date.add(today(), -20), "110", "OLD")
      :ok
    end

    test "the received date can't be before the order date; the order date itself is fine", c do
      o = order!(c, [line(c.offer, 2)], %{"ordered_on" => iso(-3)})
      l = hd(o["lines"])
      body = &%{"received_on" => &1, "lines" => [%{"id" => l["id"], "packs_received" => 2}]}
      path = "/api/purchase_orders/#{o["id"]}/receive"

      assert base(req(c.brewer, :post, path, body.(iso(-4)))) ==
               "The received date can't be before the order date"

      assert {200, %{"data" => %{"received_on" => on}}} =
               req(c.brewer, :post, path, body.(iso(-3)))

      assert on == iso(-3)
    end

    test "every line needs a received quantity; a listed line with no allocations goes to its previous lot",
         c do
      o = order!(c, [line(c.offer, 2), line(c.offer, 3)])
      [a, b] = o["lines"]
      path = "/api/purchase_orders/#{o["id"]}/receive"

      for body <- [
            %{},
            %{"lines" => []},
            %{"lines" => [%{"id" => a["id"], "packs_received" => 2}]},
            %{"lines" => [%{"id" => a["id"], "packs_received" => 2}, %{"id" => b["id"]}]}
          ] do
        assert base(req(c.brewer, :post, path, body)) == "Every line needs a received quantity"
      end

      assert Repo.get!(PurchaseOrder, o["id"]).status == "open"

      assert {200, _} =
               req(c.brewer, :post, path, %{
                 "lines" => [
                   %{"id" => a["id"], "packs_received" => 2},
                   %{"id" => b["id"], "packs_received" => 0}
                 ]
               })

      old = Repo.get_by!(IngredientLot, lot_number: "OLD")
      assert Decimal.eq?(RockcutApi.Ingredients.Inventory.on_hand_by_lot([old.id])[old.id], 220)
    end

    test "a new lot's feature value with more places than the feature keeps is refused, not rounded",
         c do
      o = order!(c, [line(c.offer, 1)])
      l = hd(o["lines"])
      path = "/api/purchase_orders/#{o["id"]}/receive"

      alloc =
        &%{
          "lines" => [
            %{
              "id" => l["id"],
              "packs_received" => 1,
              "allocations" => [
                %{"lot_number" => "FEAT", "packs" => 1, "features" => %{"extract_fgdb" => &1}}
              ]
            }
          ]
        }

      assert %{"features" => %{"extract_fgdb" => ["Extract: Use at most 1 decimal"]}} =
               errors(req(c.brewer, :post, path, alloc.("80.155")))

      assert Repo.get_by(IngredientLot, lot_number: "FEAT") == nil
      assert {200, _} = req(c.brewer, :post, path, alloc.("80.2"))
    end
  end

  describe "order totals (gaps 8, 9)" do
    test "an invalid from or to is a 422; subtotals and the total carry sacks ordered and received",
         c do
      for q <- ["from=x&to=#{iso(0)}", "to=2026-02-31"] do
        assert {422, _} = req(c.brewer, :get, "/api/ingredient_totals/orders?" <> q)
      end

      order!(c, [line(c.offer, 3)])
      got = order!(c, [line(c.offer, 10)])

      {200, _} =
        req(c.brewer, :post, "/api/purchase_orders/#{got["id"]}/receive", %{
          "lines" => [
            %{
              "id" => hd(got["lines"])["id"],
              "packs_received" => 8,
              "allocations" => [%{"lot_number" => "T", "packs" => 8}]
            }
          ]
        })

      {200, %{"data" => data}} =
        req(c.brewer, :get, "/api/ingredient_totals/orders?from=#{iso(-1)}&to=#{iso(0)}")

      assert [%{"packs_ordered" => 13, "packs_received" => 8}] = data["by_supplier"]
      assert %{"packs_ordered" => 13, "packs_received" => 8, "packs" => 11} = data["total"]
    end
  end

  describe "reorder offer (gap 4)" do
    test "the offer picked is saved on the product and To order uses it; inactive or another product's is refused; null is the default",
         c do
      Repo.update!(Ecto.Changeset.change(c.product, min_on_hand_packs: 10))
      path = "/api/ingredient_products/#{c.product.id}"

      reorder_offer = fn ->
        {200, %{"data" => rows}} = req(c.brewer, :get, "/api/ingredient_reorder")
        Enum.find(rows, &(&1["product_id"] == c.product.id))["offer"]["id"]
      end

      assert reorder_offer.() == c.offer.id

      assert {200, %{"data" => %{"reorder_offer_id" => id}}} =
               req(c.brewer, :put, path, %{
                 "lock_version" => product_version(c.product.id),
                 "reorder_offer_id" => c.offer50.id
               })

      assert id == c.offer50.id and reorder_offer.() == c.offer50.id

      inactive = offer!(c.product, c.bsg, "25")
      Repo.update!(Ecto.Changeset.change(inactive, active: false))

      for bad <- [inactive.id, c.pils_offer.id] do
        assert %{"reorder_offer_id" => ["must be one of this product's active offers"]} =
                 errors(
                   req(c.brewer, :put, path, %{
                     "lock_version" => product_version(c.product.id),
                     "reorder_offer_id" => bad
                   })
                 )
      end

      # Deactivated later: back to the default.
      Repo.update!(Ecto.Changeset.change(c.offer50, active: false))
      assert reorder_offer.() == c.offer.id
      Repo.update!(Ecto.Changeset.change(c.offer50, active: true))

      assert {200, %{"data" => %{"reorder_offer_id" => nil}}} =
               req(c.brewer, :put, path, %{
                 "lock_version" => product_version(c.product.id),
                 "reorder_offer_id" => nil
               })

      assert reorder_offer.() == c.offer.id
    end
  end

  describe "reorder on order by weight (item 20)" do
    test "50 + 55 lb sacks on order are converted to the reorder offer's sack size; to order rounds up",
         c do
      Repo.update!(Ecto.Changeset.change(c.product, min_on_hand_packs: 10))
      # 2 × 50 lb + 2 × 55 lb = 210 lb.
      order!(c, [line(c.offer50, 2), line(c.offer, 2)])

      row = fn ->
        {200, %{"data" => rows}} = req(c.brewer, :get, "/api/ingredient_reorder")
        Enum.find(rows, &(&1["product_id"] == c.product.id))
      end

      # The default reorder offer is the latest order line's: the 55 lb one.
      # 210 / 55 = 3.82 on order; ⌈10 − 3.82⌉ = 7.
      r = row.()
      assert r["offer"]["id"] == c.offer.id
      assert r["on_order"] == "210" and r["on_order_packs"] == 3.82 and r["to_order"] == 7

      # On the 50 lb offer: 210 / 50 = 4.2 on order; ⌈10 − 4.2⌉ = 6.
      {200, _} =
        req(c.brewer, :put, "/api/ingredient_products/#{c.product.id}", %{
          "lock_version" => product_version(c.product.id),
          "reorder_offer_id" => c.offer50.id
        })

      r = row.()
      assert r["on_order_packs"] == 4.2 and r["to_order"] == 6

      # 4 × 50 lb more: 410 lb = 8.2; then 1 × 50 + 2 × 55: 570 lb = 11.4, nothing to order.
      order!(c, [line(c.offer50, 4)])
      assert %{"on_order_packs" => 8.2, "to_order" => 2} = row.()
      order!(c, [line(c.offer50, 1), line(c.offer, 2)])
      assert %{"on_order_packs" => 11.4, "to_order" => 0} = row.()
    end
  end

  describe "History (item 18)" do
    test "a receipt from an order names the order in its note: the reference, else Order #id; others keep theirs",
         c do
      a = order!(c, [line(c.offer, 1)], %{"reference" => "PO-7"})
      b = order!(c, [line(c.offer, 1)])
      receive_all!(c, a)
      receive_all!(c, b)

      {200, %{"data" => moves}} =
        req(c.brewer, :get, "/api/inventory_movements?product_id=#{c.product.id}")

      received = Enum.filter(moves, &(&1["kind"] == "received"))

      assert received |> Enum.map(&{&1["note"], &1["purchase_order_id"]}) |> Enum.sort() ==
               Enum.sort([{"PO-7", a["id"]}, {"Order ##{b["id"]}", b["id"]}])

      assert Enum.all?(
               Repo.all(Movement),
               &(&1.kind == "received" or &1.purchase_order_line_id == nil)
             )
    end
  end
end
