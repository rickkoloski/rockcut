defmodule RockcutApiWeb.ReceivingTotalsApiTest do
  @moduledoc """
  D61 Stage 2: receiving an order into lots (spec §3.3, A3), lot cost and
  value as of a date (§3.4, A4), the inventory and order totals (§3.6) and
  reorder (§3.5). Each rule has a refusal and an allowed case.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IngredientFixtures
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Brewing.IngredientLot
  alias RockcutApi.Ingredients.{Movement, Products}

  setup do
    p = personas(~w(brewer1 brewer2))
    c = grain_catalog!()
    price!(c.offer, "44.00")
    Map.merge(c, %{p: p, brewer: p["brewer1"]})
  end

  defp today, do: Tasks.today()
  defp day(offset), do: Date.add(today(), offset)
  defp iso(offset), do: Date.to_iso8601(day(offset))

  defp req(user, verb, path, params \\ %{}) do
    conn = call(user, verb, path, params)
    {conn.status, if(conn.resp_body == "", do: nil, else: Jason.decode!(conn.resp_body))}
  end

  defp base({422, %{"errors" => %{"base" => [message]}}}), do: message
  defp eq(a, b), do: Decimal.eq?(Decimal.new(to_string(a)), Decimal.new(to_string(b)))

  defp order!(c, lines, extra \\ %{}) do
    {201, %{"data" => data}} =
      req(
        c.brewer,
        :post,
        "/api/purchase_orders",
        Map.merge(
          %{"supplier_party_id" => c.bsg.id, "ordered_on" => iso(-2), "lines" => lines},
          extra
        )
      )

    data
  end

  defp receive_order(c, order, body),
    do: req(c.brewer, :post, "/api/purchase_orders/#{order["id"]}/receive", body)

  defp line_id(order, n \\ 0), do: Enum.at(order["lines"], n)["id"]

  defp lot_on_hand(lot_id),
    do: RockcutApi.Ingredients.Inventory.on_hand_by_lot([lot_id])[lot_id]

  defp receipts(lot_id),
    do:
      Repo.all(
        from(m in Movement, where: m.lot_id == ^lot_id and m.kind == "received", order_by: m.id)
      )

  describe "receive (§3.3)" do
    test "in full into the previous lot: a Received movement with the line and cost; the lot's received date stays",
         c do
      old = stocked_lot!(c.product, day(-30), "110", "OLD")
      prev = stocked_lot!(c.product, day(-10), "55", "PREV")

      o =
        order!(c, [%{"offer_id" => c.offer.id, "sacks_ordered" => 4, "price_per_sack" => "44.00"}])

      assert {200, %{"data" => r}} = receive_order(c, o, %{"received_on" => iso(0)})
      assert r["status"] == "received" and r["received_on"] == iso(0)
      assert r["received_by"]["name"] == c.brewer.name
      assert hd(r["lines"])["sacks_received"] == 4
      assert eq(r["total_dollars"], "176.00")

      assert eq(lot_on_hand(prev.id), 275) and eq(lot_on_hand(old.id), 110)
      assert Repo.reload!(prev).received_date == day(-10)
      [m] = receipts(prev.id)
      assert m.purchase_order_line_id == line_id(o)

      assert eq(m.quantity_lb, 220) and m.occurred_on == today() and
               m.entered_by_id == c.brewer.id

      assert eq(m.unit_cost_per_lb, "0.8")
    end

    test "the previous lot skips expired lots and other sack sizes (A3)", c do
      kept = stocked_lot!(c.product, day(-20), "55", "KEEP")
      expired = stocked_lot!(c.product, day(-5), "55", "EXP")
      Repo.update!(Ecto.Changeset.change(expired, status: "expired"))
      big = stocked_lot!(c.product, day(-3), "50", "BIG")
      Repo.update!(Ecto.Changeset.change(big, sack_size_lb: Decimal.new(50)))
      o = order!(c, [%{"offer_id" => c.offer.id, "sacks_ordered" => 1}])

      assert {200, _} = receive_order(c, o, %{})
      assert [_] = receipts(kept.id)
      assert receipts(expired.id) == [] and receipts(big.id) == []
    end

    test "a new lot number makes a lot (supplier, sack size, received date, standard specs plus given ones)",
         c do
      o = order!(c, [%{"offer_id" => c.offer.id, "sacks_ordered" => 3}])

      body = %{
        "received_on" => iso(-1),
        "lines" => [
          %{
            "id" => line_id(o),
            "sacks_received" => 3,
            "allocations" => [
              %{
                "lot_number" => " W123 ",
                "sacks" => 3,
                "features" => %{"moisture_pct" => %{"value" => "4.2"}},
                "notes" => "dock 2"
              }
            ]
          }
        ]
      }

      assert {200, _} = receive_order(c, o, body)

      lot =
        Repo.get_by!(IngredientLot, lot_number: "W123")
        |> Repo.preload(feature_values: :feature_type)

      assert lot.product_id == c.product.id and lot.supplier_party_id == c.bsg.id
      assert eq(lot.sack_size_lb, 55) and lot.received_date == day(-1) and lot.notes == "dock 2"
      assert lot.status == "available" and eq(lot_on_hand(lot.id), 165)
      features = Map.new(lot.feature_values, &{&1.feature_type.key, &1.value})
      assert eq(features["extract_fgdb"], "81.5") and eq(features["moisture_pct"], "4.2")
    end

    test "a lot number the product has, in any case, adds to that lot; a different sack size needs a new number",
         c do
      w = stocked_lot!(c.product, day(-9), "55", "W123")
      o = order!(c, [%{"offer_id" => c.offer.id, "sacks_ordered" => 2}])

      alloc =
        &%{
          "lines" => [
            %{"id" => line_id(o), "allocations" => [%{"lot_number" => &1, "sacks" => 2}]}
          ]
        }

      fifty = stocked_lot!(c.product, day(-9), "50", "F50")
      Repo.update!(Ecto.Changeset.change(fifty, sack_size_lb: Decimal.new(50)))

      assert base(receive_order(c, o, alloc.("f50"))) ==
               "Lot F50 holds 50 lb sacks; use a new lot number"

      assert {200, _} = receive_order(c, o, alloc.("w123"))
      assert eq(lot_on_hand(w.id), 165)

      assert Repo.aggregate(
               from(l in IngredientLot, where: l.product_id == ^c.product.id),
               :count
             ) == 2
    end

    test "split across lots: the rows must add up to the sacks received", c do
      a = stocked_lot!(c.product, day(-9), "55", "A")
      o = order!(c, [%{"offer_id" => c.offer.id, "sacks_ordered" => 10}])

      split = fn x, y ->
        %{
          "lines" => [
            %{
              "id" => line_id(o),
              "sacks_received" => 10,
              "allocations" => [
                %{"lot_id" => a.id, "sacks" => x},
                %{"lot_number" => "B", "sacks" => y}
              ]
            }
          ]
        }
      end

      assert base(receive_order(c, o, split.(6, 3))) ==
               "The lots for Rahr 2-Row add up to 9 sacks, not the 10 received"

      assert base(receive_order(c, o, split.(6, 0))) ==
               "Enter whole sacks (1 or more) for Rahr - Standard 2-row (milled)"

      assert {200, _} = receive_order(c, o, split.(6, 4))
      assert eq(lot_on_hand(a.id), 55 + 330)
      b = Repo.get_by!(IngredientLot, lot_number: "B")
      assert eq(lot_on_hand(b.id), 220)
    end

    test "short (decision 29, 44): closed with both numbers; 0 writes no movement", c do
      stocked_lot!(c.product, day(-9), "55", "A")
      offer2 = offer!(product!(c.two_row, c.root_shoot), c.bsg, "50", "30")

      o =
        order!(c, [
          %{"offer_id" => c.offer.id, "sacks_ordered" => 10},
          %{"offer_id" => offer2.id, "sacks_ordered" => 5}
        ])

      assert {200, %{"data" => r}} =
               receive_order(c, o, %{
                 "lines" => [
                   %{"id" => line_id(o), "sacks_received" => 8},
                   %{"id" => line_id(o, 1), "sacks_received" => 0}
                 ]
               })

      assert r["status"] == "received"

      assert Enum.map(r["lines"], &{&1["sacks_ordered"], &1["sacks_received"]}) == [
               {10, 8},
               {5, 0}
             ]

      assert r["total_sacks"] == 8 and eq(r["total_dollars"], "352.00")
      assert Repo.aggregate(from(m in Movement, where: m.kind == "received"), :count) == 1
    end

    test "refusals: no previous lot, received date after today, a line not on the order, nothing half-written",
         c do
      o = order!(c, [%{"offer_id" => c.offer.id, "sacks_ordered" => 1}])
      assert base(receive_order(c, o, %{})) == "Enter a lot number for Rahr 2-Row"

      assert base(receive_order(c, o, %{"received_on" => iso(1)})) ==
               "The received date can't be after today"

      assert base(receive_order(c, o, %{"lines" => [%{"id" => 999_999}]})) ==
               "A line isn't on this order"

      assert base(
               receive_order(c, o, %{"lines" => [%{"id" => line_id(o), "sacks_received" => -1}]})
             ) =~ "Enter whole sacks"

      assert {200, %{"data" => %{"status" => "open"}}} =
               req(c.brewer, :get, "/api/purchase_orders/#{o["id"]}")

      assert Repo.aggregate(IngredientLot, :count) == 0
    end

    test "two receives at once: one wins, the other is 409; stock counted once", c do
      lot = stocked_lot!(c.product, day(-9), "55", "A")
      o = order!(c, [%{"offer_id" => c.offer.id, "sacks_ordered" => 2}])
      order = RockcutApi.Ingredients.Orders.get!(o["id"])
      parent = self()

      results =
        [c.p["brewer1"], c.p["brewer2"]]
        |> Enum.map(fn who ->
          Task.async(fn ->
            Ecto.Adapters.SQL.Sandbox.allow(Repo, parent, self())
            RockcutApi.Ingredients.Orders.receive(order, %{}, who)
          end)
        end)
        |> Task.await_many()

      assert [{:ok, _}] = Enum.filter(results, &match?({:ok, _}, &1))

      assert [{:error, {:conflict, "This order has already been received"}}] =
               Enum.reject(results, &match?({:ok, _}, &1))

      assert eq(lot_on_hand(lot.id), 165)
    end
  end

  describe "lot cost and value (§3.4, A4)" do
    test "costed at the latest receipt; a lot with none at the offer price (estimated); no price: unvalued",
         c do
      topped = stocked_lot!(c.product, day(-30), "55", "T")

      for {price, sacks, on} <- [{"44.00", 2, -20}, {"49.50", 1, -5}] do
        o =
          order!(
            c,
            [%{"offer_id" => c.offer.id, "sacks_ordered" => sacks, "price_per_sack" => price}],
            %{"ordered_on" => iso(on)}
          )

        assert {200, _} = receive_order(c, o, %{"received_on" => iso(on)})
      end

      {200, %{"data" => t}} = req(c.brewer, :get, "/api/ingredient_lots/#{topped.id}")
      assert eq(t["on_hand_lb"], 220) and eq(t["cost_per_lb"], "0.9")
      assert eq(t["value"], "198.00") and t["estimated"] == false and t["unvalued"] == false

      plain = stocked_lot!(c.product, day(-3), "110", "P")
      Repo.update!(Ecto.Changeset.change(plain, supplier_party_id: c.bsg.id))
      {200, %{"data" => p}} = req(c.brewer, :get, "/api/ingredient_lots/#{plain.id}")
      assert eq(p["cost_per_lb"], "0.8") and eq(p["value"], "88.00") and p["estimated"] == true

      other = product!(c.two_row, c.root_shoot)
      bare = stocked_lot!(other, day(-3), "50", "N")
      {200, %{"data" => [n]}} = req(c.brewer, :get, "/api/ingredient_lots?product_id=#{other.id}")

      assert n["id"] == bare.id and n["unvalued"] == true and n["value"] == nil and
               n["cost_per_lb"] == nil
    end
  end

  describe "inventory totals (§3.6)" do
    setup c do
      lot = stocked_lot!(c.product, day(-30), "110", "A")
      Repo.update!(Ecto.Changeset.change(lot, supplier_party_id: c.bsg.id))

      o =
        order!(
          c,
          [%{"offer_id" => c.offer.id, "sacks_ordered" => 2, "price_per_sack" => "55.00"}],
          %{"ordered_on" => iso(-3)}
        )

      {200, _} = receive_order(c, o, %{"received_on" => iso(-3)})

      other = product!(c.two_row, c.root_shoot)
      bare = stocked_lot!(other, day(-10), "100", "N")
      Repo.update!(Ecto.Changeset.change(bare, supplier_party_id: c.root_shoot.id))
      expired = stocked_lot!(other, day(-10), "20", "X")

      Repo.update!(
        Ecto.Changeset.change(expired,
          status: "expired",
          supplier_party_id: c.root_shoot.id,
          sack_size_lb: Decimal.new(50)
        )
      )

      %{other: other}
    end

    defp inventory(c, q) do
      {200, %{"data" => data}} = req(c.brewer, :get, "/api/ingredient_totals/inventory" <> q)
      data
    end

    test "rows per product with lb, sacks, $ and marks; the grand total", c do
      data = inventory(c, "")
      assert data["as_of"] == iso(0)
      [rahr, rs] = data["rows"]

      assert rahr["product_id"] == c.product.id and rahr["display_name"] == "Rahr 2-Row"

      assert rahr["grain"] == "2-Row" and rahr["maltster"] == "Rahr" and
               rahr["category"] == "Base"

      assert eq(rahr["lb"], 220) and eq(rahr["sacks"], 4) and eq(rahr["expired_lb"], 0)
      # The receipt topped up lot A, so all 220 lb are at its latest price, 55/55 (A4).
      assert eq(rahr["value"], "220.00") and eq(rahr["per_lb"], "1") and
               rahr["estimated"] == false

      assert eq(rahr["unvalued_lb"], 0)

      assert rs["product_id"] == c.other.id and eq(rs["lb"], 120) and eq(rs["expired_lb"], 20)

      assert rs["sacks"] == nil and eq(rs["value"], 0) and eq(rs["unvalued_lb"], 120) and
               rs["per_lb"] == nil

      assert eq(data["total"]["lb"], 340) and eq(data["total"]["value"], "220.00")
    end

    test "as of a date before the last receipt drops it; filters; not after today", c do
      before = inventory(c, "?as_of=#{iso(-4)}")
      [rahr | _] = before["rows"]
      # Before the receipt, lot A had no costed receipt: 110 lb at the offer price, 44/55.
      assert eq(rahr["lb"], 110) and eq(rahr["value"], "88.00") and rahr["estimated"] == true

      assert [%{"product_id" => id}] = inventory(c, "?supplier_id=#{c.root_shoot.id}")["rows"]
      assert id == c.other.id
      assert [%{"product_id" => id}] = inventory(c, "?maltster_id=#{c.rahr.id}")["rows"]
      assert id == c.product.id
      assert length(inventory(c, "?category_id=#{c.grains.id}")["rows"]) == 2
      assert inventory(c, "?category_id=#{c.hops.id}")["rows"] == []

      assert {422, %{"errors" => %{"as_of" => ["can't be after today"]}}} =
               req(c.brewer, :get, "/api/ingredient_totals/inventory?as_of=#{iso(1)}")
    end
  end

  describe "order totals (§3.6, decision 35)" do
    test "open counts sacks ordered, received counts sacks received; cancelled only when asked; by supplier",
         c do
      stocked_lot!(c.product, day(-30), "55", "A")

      open =
        order!(c, [%{"offer_id" => c.offer.id, "sacks_ordered" => 3}], %{
          "ordered_on" => iso(-1),
          "reference" => "PO-1"
        })

      got =
        order!(c, [%{"offer_id" => c.offer.id, "sacks_ordered" => 10}], %{"ordered_on" => iso(-5)})

      {200, _} =
        receive_order(c, got, %{"lines" => [%{"id" => line_id(got), "sacks_received" => 8}]})

      gone =
        order!(c, [%{"offer_id" => c.offer.id, "sacks_ordered" => 7}], %{"ordered_on" => iso(-2)})

      {200, _} = req(c.brewer, :post, "/api/purchase_orders/#{gone["id"]}/cancel")

      old =
        order!(c, [%{"offer_id" => c.offer.id, "sacks_ordered" => 1}], %{"ordered_on" => iso(-40)})

      {200, %{"data" => data}} =
        req(c.brewer, :get, "/api/ingredient_totals/orders?from=#{iso(-10)}&to=#{iso(0)}")

      assert Enum.map(data["rows"], & &1["order_id"]) == [got["id"], open["id"]]
      [r_got, r_open] = data["rows"]
      assert {r_got["sacks_ordered"], r_got["sacks_received"]} == {10, 8}

      assert eq(r_got["lb"], 440) and eq(r_got["dollars"], "352.00") and
               r_got["status"] == "received"

      assert eq(r_open["lb"], 165) and eq(r_open["dollars"], "132.00") and
               r_open["reference"] == "PO-1"

      assert r_open["supplier"] == "BSG" and r_open["product"] == "Rahr 2-Row" and
               r_open["ordered_on"] == iso(-1)

      assert [%{"supplier" => "BSG", "sacks" => 11} = s] = data["by_supplier"]
      assert eq(s["dollars"], "484.00")
      assert data["total"]["sacks"] == 11 and eq(data["total"]["lb"], 605)

      {200, %{"data" => cancelled}} =
        req(c.brewer, :get, "/api/ingredient_totals/orders?status=cancelled")

      assert Enum.map(cancelled["rows"], & &1["order_id"]) == [gone["id"]]

      {200, %{"data" => all}} =
        req(c.brewer, :get, "/api/ingredient_totals/orders?supplier_id=#{c.bsg.id}")

      assert length(all["rows"]) == 3 and old["id"] in Enum.map(all["rows"], & &1["order_id"])

      {200, %{"data" => none}} =
        req(c.brewer, :get, "/api/ingredient_totals/orders?supplier_id=#{c.root_shoot.id}")

      assert none["rows"] == [] and none["total"]["sacks"] == 0
    end
  end

  describe "reorder (§3.5)" do
    test "minimum set by a brewer; below minimum, to order and on order (spec §8 scenario)", c do
      lot = stocked_lot!(c.product, day(-30), "330", "A")

      assert {200, %{"data" => %{"min_on_hand_sacks" => 3, "below_minimum" => false}}} =
               req(c.p["brewer2"], :put, "/api/ingredient_products/#{c.product.id}", %{
                 min_on_hand_sacks: 3
               })

      assert {422, %{"errors" => %{"min_on_hand_sacks" => [_]}}} =
               req(c.brewer, :put, "/api/ingredient_products/#{c.product.id}", %{
                 min_on_hand_sacks: -1
               })

      list = fn ->
        {200, %{"data" => [row]}} = req(c.brewer, :get, "/api/ingredient_reorder")
        row
      end

      row = list.()
      assert row["product_id"] == c.product.id and row["offer"]["id"] == c.offer.id
      assert eq(row["on_hand_sacks"], 6) and row["on_order_sacks"] == 0 and row["to_order"] == 0
      refute row["below_minimum"]

      Repo.insert!(%Movement{
        lot_id: lot.id,
        kind: "used",
        quantity_lb: Decimal.new(-220),
        occurred_on: today()
      })

      row = list.()
      assert eq(row["on_hand_sacks"], 2) and row["to_order"] == 1 and row["below_minimum"]

      assert {200, %{"data" => %{"below_minimum" => true}}} =
               req(c.brewer, :get, "/api/ingredient_products/#{c.product.id}")

      {200, %{"data" => products}} = req(c.brewer, :get, "/api/ingredient_products")
      assert Enum.find(products, &(&1["id"] == c.product.id))["below_minimum"] == true

      order!(c, [%{"offer_id" => c.offer.id, "sacks_ordered" => 4}])
      row = list.()
      assert row["on_order_sacks"] == 4 and row["to_order"] == 0 and row["below_minimum"]
    end

    test "expired stock doesn't count; the reorder offer is the last order's, else the first active",
         c do
      Repo.update!(Ecto.Changeset.change(c.product, min_on_hand_sacks: 2))
      lot = stocked_lot!(c.product, day(-30), "165", "A")
      Repo.update!(Ecto.Changeset.change(lot, status: "expired"))
      Repo.update!(Ecto.Changeset.change(c.offer, active: false))
      fifty = offer!(c.product, c.root_shoot, "50", "30")

      {200, %{"data" => [row]}} = req(c.brewer, :get, "/api/ingredient_reorder")

      assert row["offer"]["id"] == fifty.id and eq(row["on_hand_sacks"], 0) and
               row["to_order"] == 2

      {201, %{"data" => o}} =
        req(c.brewer, :post, "/api/purchase_orders", %{
          "supplier_party_id" => c.bsg.id,
          "ordered_on" => iso(-1),
          "lines" => [%{"offer_id" => c.offer.id, "sacks_ordered" => 1}]
        })

      {200, _} = req(c.brewer, :post, "/api/purchase_orders/#{o["id"]}/cancel")
      {200, %{"data" => [row]}} = req(c.brewer, :get, "/api/ingredient_reorder")
      assert row["offer"]["id"] == c.offer.id and row["to_order"] == 2
    end

    test "a product with no minimum isn't listed; the products list stays a fixed number of queries",
         c do
      assert {200, %{"data" => []}} = req(c.brewer, :get, "/api/ingredient_reorder")

      count = fn ->
        ref = make_ref()
        parent = self()

        :telemetry.attach(
          inspect(ref),
          [:rockcut_api, :repo, :query],
          fn _, _, _, _ -> send(parent, {ref, :q}) end,
          nil
        )

        Products.list(%{})
        :telemetry.detach(inspect(ref))
        drain(ref, 0)
      end

      Repo.update!(Ecto.Changeset.change(c.product, min_on_hand_sacks: 2))
      first = count.()

      for n <- 1..4 do
        p = product!(c.two_row, c.root_shoot, [], "R#{n}")
        Repo.update!(Ecto.Changeset.change(p, min_on_hand_sacks: n))
        offer!(p, c.bsg, "50", "30")
      end

      assert count.() == first
    end
  end

  defp drain(ref, n) do
    receive do
      {^ref, :q} -> drain(ref, n + 1)
    after
      0 -> n
    end
  end
end
