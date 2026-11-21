defmodule RockcutApiWeb.PurchasingApiTest do
  @moduledoc """
  D61 Stage 2: malt contracts (spec §3.1) and purchase orders (§3.2) on the
  API, who may use them (decisions 25, 26, 46), the delete rules they join
  (companies, offers) and lot numbers in any case (lead, Stop 1 note 4).
  Each rule has a refusal and an allowed case.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IngredientFixtures
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Ingredients.{OfferPrice, PurchaseOrder}

  setup do
    p = personas(~w(owner brewer1 brewer2 breweryMgr floater bartender1 office1))
    c = grain_catalog!()
    Repo.update!(Ecto.Changeset.change(c.bsg, order_target_packs: 40))
    price!(c.offer, "48.50")

    pils_grain =
      Repo.insert!(%RockcutApi.Brewing.Ingredient{name: "Pilsner", category_id: c.base.id})

    weyermann = party!("Weyermann", ~w(manufacturer))
    pils = product!(pils_grain, weyermann, extract_fgdb: "81.0")
    pils_offer = offer!(pils, c.bsg, "55", "55.00")

    Map.merge(c, %{
      p: p,
      brewer: p["brewer1"],
      mgr: p["breweryMgr"],
      pils: pils,
      pils_offer: pils_offer,
      this: Tasks.today().year,
      next: Tasks.today().year + 1
    })
  end

  defp today, do: Tasks.today()
  defp iso(offset), do: Date.to_iso8601(Date.add(today(), offset))

  defp req(user, verb, path, params \\ %{}) do
    conn = call(user, verb, path, with_version(verb, path, params))
    {conn.status, if(conn.resp_body == "", do: nil, else: Jason.decode!(conn.resp_body))}
  end

  # Lead decisions 2: an Edit sends back the version it opened. These tests
  # are about other rules, so a PUT without one sends the current one (the
  # version tests are in `d61_lead_decisions_2_test.exs`).
  defp with_version(:put, path, params)
       when not is_map_key(params, :lock_version) and not is_map_key(params, "lock_version") do
    schema =
      case path do
        "/api/purchase_orders/" <> _ -> RockcutApi.Ingredients.PurchaseOrder
        "/api/contracts/" <> _ -> RockcutApi.Ingredients.Contract
        _ -> nil
      end

    with true <- schema != nil,
         {id, ""} <- path |> String.split("/") |> List.last() |> Integer.parse(),
         %{lock_version: v} <- RockcutApi.Repo.get(schema, id) do
      Map.put(params, "lock_version", v)
    else
      _ -> params
    end
  end

  defp with_version(_verb, _path, params), do: params

  defp errors({422, %{"errors" => errors}}), do: errors
  defp base({422, %{"errors" => %{"base" => [message]}}}), do: message
  defp conflict({409, %{"errors" => %{"base" => [message]}}}), do: message

  defp eq(a, b), do: Decimal.eq?(Decimal.new(to_string(a)), Decimal.new(to_string(b)))

  defp contract_body(c, year, lines),
    do: %{"supplier_party_id" => c.bsg.id, "year" => year, "lines" => lines}

  defp line(product, sacks, price),
    do: %{"product_id" => product.id, "quantity" => sacks, "price" => price}

  defp contract!(c, year, lines) do
    {201, %{"data" => data}} = req(c.mgr, :post, "/api/contracts", contract_body(c, year, lines))
    data
  end

  defp order_body(c, lines, extra \\ %{}) do
    Map.merge(
      %{"supplier_party_id" => c.bsg.id, "ordered_on" => iso(0), "lines" => lines},
      extra
    )
  end

  defp order!(c, lines, extra \\ %{}) do
    {201, %{"data" => data}} =
      req(c.brewer, :post, "/api/purchase_orders", order_body(c, lines, extra))

    data
  end

  defp prices(offer) do
    Repo.all(
      from(p in OfferPrice,
        where: p.offer_id == ^offer.id,
        order_by: [asc: p.effective_on, asc: p.id]
      )
    )
  end

  defp by_product(contract, product),
    do: Enum.find(contract["lines"], &(&1["product_id"] == product.id))

  describe "who (decisions 25, 26, 46)" do
    test "Brewery members read contracts; only owners and Brewery managers write them", c do
      body = contract_body(c, c.next, [line(c.product, 200, "42.00")])

      for who <- ~w(brewer1 floater) do
        assert {200, %{"can_write" => false}} = req(c.p[who], :get, "/api/contracts")
        assert {200, _} = req(c.p[who], :get, "/api/contracts/shortfall")
        assert {403, _} = req(c.p[who], :post, "/api/contracts", body)
      end

      assert {200, %{"can_write" => true, "year" => year}} = req(c.mgr, :get, "/api/contracts")
      assert year == c.this
      assert {200, %{"can_write" => true}} = req(c.p["owner"], :get, "/api/contracts")
      assert {201, %{"data" => %{"id" => id}}} = req(c.mgr, :post, "/api/contracts", body)
      assert {403, _} = req(c.brewer, :put, "/api/contracts/#{id}", %{notes: "x"})
      assert {403, _} = req(c.brewer, :delete, "/api/contracts/#{id}")
      assert {200, _} = req(c.brewer, :get, "/api/contracts/#{id}")
      assert {200, _} = req(c.p["owner"], :put, "/api/contracts/#{id}", %{notes: "x"})
      assert {204, _} = req(c.p["owner"], :delete, "/api/contracts/#{id}")
    end

    test "any Brewery member places, changes, cancels and receives orders", c do
      for who <- ~w(brewer1 floater breweryMgr owner) do
        o = order!(%{c | brewer: c.p[who]}, [%{"offer_id" => c.offer.id, "packs_ordered" => 1}])
        assert {200, _} = req(c.p[who], :put, "/api/purchase_orders/#{o["id"]}", %{notes: "n"})

        assert {200, %{"data" => %{"status" => "cancelled"}}} =
                 req(c.p[who], :post, "/api/purchase_orders/#{o["id"]}/cancel")
      end
    end

    for who <- ~w(bartender1 office1) do
      test "#{who} gets 403 on every D61 route", c do
        user = c.p[unquote(who)]
        assert Enum.reject(d61_routes(c), &(status(user, elem(&1, 0), elem(&1, 1)) == 403)) == []
      end
    end

    test "the brewhouse device gets 403 on every D61 route (decision 26)", c do
      device = RockcutApi.AccountsFixtures.device_fixture(%{home: "brewery", name: "Brewhouse"})
      token = RockcutApi.AccountsFixtures.device_token_fixture(device, "Brewhouse Tab")

      assert Enum.reject(d61_routes(c), fn {verb, path} ->
               call_device(token, verb, path, %{staff_code: "1111"}).status == 403
             end) == []
    end
  end

  defp d61_routes(c) do
    contract = contract!(c, c.next, [line(c.product, 10, "42.00")])
    order = order!(c, [%{"offer_id" => c.offer.id, "packs_ordered" => 1}])
    cp = "/api/contracts/#{contract["id"]}"
    op = "/api/purchase_orders/#{order["id"]}"

    [
      {:get, "/api/contracts"},
      {:get, "/api/contracts/shortfall"},
      {:get, cp},
      {:post, "/api/contracts"},
      {:patch, cp},
      {:put, cp},
      {:delete, cp},
      {:get, "/api/purchase_orders"},
      {:get, op},
      {:post, "/api/purchase_orders"},
      {:patch, op},
      {:put, op},
      {:post, op <> "/cancel"},
      {:post, op <> "/receive"},
      {:get, "/api/ingredient_totals/inventory"},
      {:get, "/api/ingredient_totals/orders"},
      {:get, "/api/ingredient_reorder"}
    ]
  end

  describe "contracts (§3.1)" do
    test "a contract's prices go into the offers' history from Jan 1 of its year, note \"Contract <year>\"",
         c do
      data =
        contract!(c, c.next, [line(c.product, 200, "42.00"), line(c.pils, 40, "55.00")])

      assert data["supplier"]["name"] == "BSG" and data["year"] == c.next
      assert data["created_by"]["name"] == c.mgr.name

      for {offer, price} <- [{c.offer, "42.00"}, {c.pils_offer, "55.00"}] do
        row = List.last(prices(offer))
        assert eq(row.price_per_pack, price)
        assert row.effective_on == Date.new!(c.next, 1, 1)
        assert row.note == "Contract #{c.next}"
        assert row.entered_by_id == c.mgr.id
      end
    end

    test "this year's contract price is effective today (A2); a past year writes none (decision 40)",
         c do
      contract!(c, c.this, [line(c.product, 10, "44.00")])
      assert List.last(prices(c.offer)).effective_on == today()

      before = length(prices(c.pils_offer))
      past = contract!(c, c.this - 1, [line(c.pils, 10, "30.00")])
      assert length(prices(c.pils_offer)) == before

      # Lead decisions 2, item 5 (Matt 4a): nor does a changed price on it.
      assert {200, _} =
               req(c.mgr, :put, "/api/contracts/#{past["id"]}", %{
                 "lines" => [line(c.pils, 10, "31.00")]
               })

      assert length(prices(c.pils_offer)) == before
    end

    test "an unchanged price writes nothing on update; a changed one writes a row", c do
      data = contract!(c, c.next, [line(c.product, 200, "42.00")])
      n = length(prices(c.offer))
      path = "/api/contracts/#{data["id"]}"

      assert {200, _} =
               req(c.mgr, :put, path, %{"lines" => [line(c.product, 210, "42.00")]})

      assert length(prices(c.offer)) == n

      assert {200, %{"data" => %{"lines" => [l]}}} =
               req(c.mgr, :put, path, %{"lines" => [line(c.product, 210, "43.00")]})

      assert l["quantity"] == 210 and eq(l["price"], "43.00")
      assert length(prices(c.offer)) == n + 1

      # The full list replaces the lines: Pilsner added, Rahr dropped.
      assert {200, %{"data" => %{"lines" => [only]}}} =
               req(c.mgr, :put, path, %{"lines" => [line(c.pils, 5, "55.00")]})

      assert only["product_id"] == c.pils.id
    end

    test "a line remembers its offer (note 3): named when several, inferred when one; later prices go on it",
         c do
      data = contract!(c, c.next, [line(c.product, 10, "42.00")])
      assert hd(data["lines"])["offer_id"] == c.offer.id

      second = offer!(c.product, c.bsg, "50", "40.00")
      path = "/api/contracts/#{data["id"]}"
      n = length(prices(c.offer))

      # Several offers now, but the line has one: a price change goes on it.
      assert {200, %{"data" => %{"lines" => [l]}}} =
               req(c.mgr, :put, path, %{"lines" => [line(c.product, 10, "43.00")]})

      assert l["offer_id"] == c.offer.id and length(prices(c.offer)) == n + 1
      assert prices(second) |> length() == 1

      # Naming the other offer moves the line and writes the price there.
      assert {200, %{"data" => %{"lines" => [l]}}} =
               req(c.mgr, :put, path, %{
                 "lines" => [Map.put(line(c.product, 10, "43.00"), "offer_id", second.id)]
               })

      assert l["offer_id"] == second.id
      assert eq(List.last(prices(second)).price_per_pack, "43.00")
    end

    test "refusals: no offer, several offers, a product twice, not a supplier, one per supplier and year",
         c do
      other = product!(c.two_row, c.root_shoot)

      assert base(
               req(
                 c.mgr,
                 :post,
                 "/api/contracts",
                 contract_body(c, c.next, [line(other, 1, "1")])
               )
             ) ==
               "Add a BSG offer for Root Shoot 2-Row first"

      second = offer!(c.product, c.bsg, "50", "40.00")
      body = contract_body(c, c.next, [line(c.product, 1, "42")])

      assert base(req(c.mgr, :post, "/api/contracts", body)) ==
               "BSG has several offers for Rahr 2-Row; pick one"

      assert base(
               req(
                 c.mgr,
                 :post,
                 "/api/contracts",
                 contract_body(c, c.next, [line(c.product, 1, "42"), line(c.product, 2, "42")])
               )
             ) == "Rahr 2-Row is on this contract twice"

      assert %{"supplier_party_id" => ["must be a supplier"]} =
               errors(
                 req(c.mgr, :post, "/api/contracts", %{
                   "supplier_party_id" => c.rahr.id,
                   "year" => c.next,
                   "lines" => []
                 })
               )

      assert {201, _} =
               req(c.mgr, :post, "/api/contracts", %{
                 body
                 | "lines" => [Map.put(line(c.product, 1, "42"), "offer_id", second.id)]
               })

      assert eq(List.last(prices(second)).price_per_pack, "42")

      assert base(req(c.mgr, :post, "/api/contracts", contract_body(c, c.next, []))) ==
               "BSG already has a #{c.next} contract"

      assert %{"year" => [_]} =
               errors(req(c.mgr, :post, "/api/contracts", contract_body(c, 1999, [])))

      assert %{"quantity" => [_]} =
               errors(
                 req(
                   c.mgr,
                   :post,
                   "/api/contracts",
                   contract_body(c, c.next + 1, [
                     Map.put(line(c.product, 0, "1"), "offer_id", second.id)
                   ])
                 )
               )

      # Nothing half-written by the refusals.
      assert length(Repo.all(RockcutApi.Ingredients.Contract)) == 1
    end

    test "figures: on order, received, remaining and over (A5, decisions 38, 41); off-contract and other years don't count",
         c do
      contract = contract!(c, c.this, [line(c.product, 20, "42.00"), line(c.pils, 40, "55.00")])

      open = order!(c, [%{"offer_id" => c.offer.id, "packs_ordered" => 6}])

      received =
        order!(c, [
          %{"offer_id" => c.offer.id, "packs_ordered" => 25, "price_per_pack" => "40.00"}
        ])

      off =
        order!(c, [%{"offer_id" => c.offer.id, "packs_ordered" => 3}], %{"off_contract" => true})

      cancelled = order!(c, [%{"offer_id" => c.offer.id, "packs_ordered" => 7}])
      req(c.brewer, :post, "/api/purchase_orders/#{cancelled["id"]}/cancel")

      last_year =
        order!(c, [%{"offer_id" => c.offer.id, "packs_ordered" => 9}], %{
          "ordered_on" => "#{c.this - 1}-12-30"
        })

      for o <- [received, off] do
        assert {200, _} =
                 req(c.brewer, :post, "/api/purchase_orders/#{o["id"]}/receive", %{
                   "lines" => [
                     %{
                       "id" => hd(o["lines"])["id"],
                       "packs_received" => hd(o["lines"])["packs_ordered"],
                       "allocations" => [
                         %{
                           "lot_number" => "R-#{o["id"]}",
                           "packs" => hd(o["lines"])["packs_ordered"]
                         }
                       ]
                     }
                   ]
                 })
      end

      assert open["status"] == "open" and last_year["status"] == "open"
      {200, %{"data" => data}} = req(c.brewer, :get, "/api/contracts/#{contract["id"]}")
      rahr = by_product(data, c.product)

      assert rahr["contracted"] == 20 and eq(rahr["contracted_dollars"], "840.00")
      assert rahr["on_order"] == 6
      assert rahr["received"] == 25 and eq(rahr["received_dollars"], "1000.00")
      assert rahr["remaining"] == -5 and rahr["over_by"] == 5

      pils = by_product(data, c.pils)

      assert pils["received"] == 0 and pils["remaining"] == 40 and
               pils["over_by"] == nil

      {200, %{"data" => [listed]}} = req(c.brewer, :get, "/api/contracts?year=#{c.this}")
      assert listed["id"] == contract["id"]
      assert {200, %{"data" => []}} = req(c.brewer, :get, "/api/contracts?year=#{c.next}")

      # Shortfall: Pilsner 40 short; Rahr is over, so not listed.
      assert {200, %{"year" => year, "data" => [short]}} =
               req(c.brewer, :get, "/api/contracts/shortfall?year=#{c.this}")

      assert year == c.this
      assert short["product_id"] == c.pils.id and short["short"] == 40

      # Delete is refused once grain was received against it.
      assert base(req(c.mgr, :delete, "/api/contracts/#{contract["id"]}")) ==
               "Grain has been received against this contract, so it can't be deleted"
    end

    test "shortfall sorts by short, most first", c do
      contract!(c, c.next, [line(c.product, 5, "42"), line(c.pils, 40, "55")])

      assert {200, %{"data" => [first, second]}} =
               req(c.brewer, :get, "/api/contracts/shortfall?year=#{c.next}")

      assert {first["product_id"], first["short"]} == {c.pils.id, 40}
      assert {second["product_id"], second["short"]} == {c.product.id, 5}
    end
  end

  describe "orders (§3.2)" do
    test "the price defaults to the offer's current price; totals and the target progress", c do
      o =
        order!(c, [
          %{"offer_id" => c.offer.id, "packs_ordered" => 30},
          %{"offer_id" => c.pils_offer.id, "packs_ordered" => 6, "price_per_pack" => "0"}
        ])

      [rahr, pils] = o["lines"]
      assert eq(rahr["price_per_pack"], "48.50") and eq(pils["price_per_pack"], "0")
      assert rahr["offer"]["label"] == "Rahr - Standard 2-row (milled)"
      assert eq(rahr["line_dollars"], "1455.00") and eq(rahr["line_quantity"], "1650")
      assert o["status"] == "open" and o["created_by"]["name"] == c.brewer.name

      assert o["total_packs"] == 36 and eq(o["total_dollars"], "1455.00")
      assert [%{"unit" => "lb", "quantity" => total_lb}] = o["by_unit"]
      assert eq(total_lb, "1980")

      assert o["target"] == %{"packs" => 40, "next_multiple" => 40}

      {200, %{"data" => o}} =
        req(c.brewer, :put, "/api/purchase_orders/#{o["id"]}", %{
          "lines" => [
            %{"id" => rahr["id"], "offer_id" => c.offer.id, "packs_ordered" => 35},
            %{"offer_id" => c.pils_offer.id, "packs_ordered" => 6}
          ]
        })

      assert o["total_packs"] == 41 and o["target"]["next_multiple"] == 80
      assert hd(o["lines"])["id"] == rahr["id"]
      assert Enum.map(o["lines"], & &1["packs_ordered"]) == [35, 6]
    end

    test "no target: target is null", c do
      Repo.update!(Ecto.Changeset.change(Repo.reload!(c.bsg), order_target_packs: nil))
      assert order!(c, [%{"offer_id" => c.offer.id, "packs_ordered" => 1}])["target"] == nil
    end

    test "refusals: another supplier's offer, sacks, dates, no lines, no price", c do
      rs = offer!(c.product, c.root_shoot, "50", "30")
      ok = %{"offer_id" => c.offer.id, "packs_ordered" => 1}
      post = &req(c.brewer, :post, "/api/purchase_orders", &1)

      assert base(post.(order_body(c, [%{"offer_id" => rs.id, "packs_ordered" => 1}]))) ==
               "Rahr 2-Row isn't a BSG offer"

      assert %{"packs_ordered" => [_]} =
               errors(post.(order_body(c, [%{ok | "packs_ordered" => 0}])))

      assert %{"packs_ordered" => ["is invalid"]} =
               errors(post.(order_body(c, [%{ok | "packs_ordered" => "1.5"}])))

      assert %{"ordered_on" => ["can't be after today"]} =
               errors(post.(order_body(c, [ok], %{"ordered_on" => iso(1)})))

      assert %{"expected_on" => ["can't be before the order date"]} =
               errors(post.(order_body(c, [ok], %{"expected_on" => iso(-1)})))

      assert base(post.(order_body(c, []))) == "Add at least one line"

      assert %{"supplier_party_id" => ["must be a supplier"]} =
               errors(post.(%{order_body(c, [ok]) | "supplier_party_id" => c.rahr.id}))

      no_price = offer!(c.pils, c.bsg, "50")

      assert base(post.(order_body(c, [%{"offer_id" => no_price.id, "packs_ordered" => 1}]))) ==
               "Enter a price for Weyermann Pilsner; it has no current price"

      assert Repo.aggregate(PurchaseOrder, :count) == 0

      assert {201, %{"data" => %{"expected_on" => expected}}} =
               post.(order_body(c, [ok], %{"expected_on" => iso(0), "reference" => " PO-7 "}))

      assert expected == iso(0)
    end

    test "an inactive offer is refused on a new or changed line; a line already on it keeps it (note 7)",
         c do
      o = order!(c, [%{"offer_id" => c.offer.id, "packs_ordered" => 2}])
      Repo.update!(Ecto.Changeset.change(c.offer, active: false))
      path = "/api/purchase_orders/#{o["id"]}"
      kept = %{"id" => hd(o["lines"])["id"], "offer_id" => c.offer.id, "packs_ordered" => 3}

      assert {200, %{"data" => %{"lines" => [%{"packs_ordered" => 3}]}}} =
               req(c.brewer, :put, path, %{"lines" => [kept]})

      for lines <- [
            [kept, %{"offer_id" => c.offer.id, "packs_ordered" => 1}],
            [
              %{kept | "offer_id" => c.pils_offer.id},
              %{"offer_id" => c.offer.id, "packs_ordered" => 1}
            ]
          ] do
        assert base(req(c.brewer, :put, path, %{"lines" => lines})) == "That offer is inactive"
      end

      assert base(
               req(
                 c.brewer,
                 :post,
                 "/api/purchase_orders",
                 order_body(c, [%{"offer_id" => c.offer.id, "packs_ordered" => 1}])
               )
             ) ==
               "That offer is inactive"
    end

    test "a line from another order is refused on update", c do
      a = order!(c, [%{"offer_id" => c.offer.id, "packs_ordered" => 1}])
      b = order!(c, [%{"offer_id" => c.offer.id, "packs_ordered" => 2}])

      assert base(
               req(c.brewer, :put, "/api/purchase_orders/#{a["id"]}", %{
                 "lines" => [
                   %{"id" => hd(b["lines"])["id"], "offer_id" => c.offer.id, "packs_ordered" => 3}
                 ]
               })
             ) == "A line isn't on this order"
    end

    test "cancelled and received orders are read-only (409)", c do
      cancelled = order!(c, [%{"offer_id" => c.offer.id, "packs_ordered" => 1}])
      path = "/api/purchase_orders/#{cancelled["id"]}"

      assert {200, %{"data" => %{"status" => "cancelled", "cancelled_by" => %{"name" => _}}}} =
               req(c.p["brewer2"], :post, path <> "/cancel")

      for {verb, p, body} <- [
            {:put, path, %{notes: "x"}},
            {:post, path <> "/cancel", %{}},
            {:post, path <> "/receive", %{}}
          ] do
        assert conflict(req(c.brewer, verb, p, body)) == "This order has already been cancelled"
      end

      received = order!(c, [%{"offer_id" => c.offer.id, "packs_ordered" => 1}])
      path = "/api/purchase_orders/#{received["id"]}"
      stocked_lot!(c.product, Date.add(today(), -3), "55", "OLD")
      line = hd(received["lines"])

      assert {200, _} =
               req(c.brewer, :post, path <> "/receive", %{
                 "lines" => [%{"id" => line["id"], "packs_received" => 1}]
               })

      for {verb, p} <- [{:put, path}, {:post, path <> "/cancel"}, {:post, path <> "/receive"}] do
        assert conflict(req(c.brewer, verb, p, %{})) == "This order has already been received"
      end
    end

    test "list: open first, then newest; filters by supplier, status and order date", c do
      a =
        order!(c, [%{"offer_id" => c.offer.id, "packs_ordered" => 1}], %{"ordered_on" => iso(-10)})

      b =
        order!(c, [%{"offer_id" => c.offer.id, "packs_ordered" => 1}], %{"ordered_on" => iso(-2)})

      d =
        order!(c, [%{"offer_id" => c.offer.id, "packs_ordered" => 1}], %{"ordered_on" => iso(-1)})

      req(c.brewer, :post, "/api/purchase_orders/#{d["id"]}/cancel")
      rs_offer = offer!(c.product, c.root_shoot, "50", "30")

      {201, %{"data" => e}} =
        req(c.brewer, :post, "/api/purchase_orders", %{
          "supplier_party_id" => c.root_shoot.id,
          "ordered_on" => iso(-5),
          "lines" => [%{"offer_id" => rs_offer.id, "packs_ordered" => 1}]
        })

      ids = fn q ->
        {200, %{"data" => data}} = req(c.brewer, :get, "/api/purchase_orders" <> q)
        Enum.map(data, & &1["id"])
      end

      assert ids.("") == [b["id"], e["id"], a["id"], d["id"]]
      assert ids.("?supplier_id=#{c.root_shoot.id}") == [e["id"]]
      assert ids.("?status=cancelled") == [d["id"]]
      assert ids.("?from=#{iso(-5)}&to=#{iso(-2)}") == [b["id"], e["id"]]
    end
  end

  describe "delete rules joined (§3, lead note 5)" do
    test "a supplier with a contract or an order can't be deleted; the reason names them", c do
      supplier = party!("Malteurop", ~w(supplier))

      assert {200, %{"data" => %{"delete_blocked" => nil}}} =
               req(c.brewer, :get, "/api/parties/#{supplier.id}")

      Repo.insert!(%RockcutApi.Ingredients.Contract{supplier_party_id: supplier.id, year: c.next})
      Repo.insert!(%PurchaseOrder{supplier_party_id: supplier.id, ordered_on: today()})

      assert {200, %{"data" => %{"delete_blocked" => reason}}} =
               req(c.brewer, :get, "/api/parties/#{supplier.id}")

      assert reason == "This company has contracts and orders; deactivate it instead"
      assert base(req(c.brewer, :delete, "/api/parties/#{supplier.id}")) == reason

      assert %{"roles" => ["supplier is in use and can't be removed"]} =
               errors(
                 req(c.brewer, :patch, "/api/parties/#{supplier.id}", %{roles: ["manufacturer"]})
               )
    end

    test "an offer on an order or covered by a contract can't be deleted (no 500); a free one can",
         c do
      order!(c, [%{"offer_id" => c.offer.id, "packs_ordered" => 1}])

      assert base(req(c.brewer, :delete, "/api/supplier_offers/#{c.offer.id}")) ==
               "This offer is on an order; deactivate it instead"

      contract!(c, c.next, [line(c.pils, 1, "55")])

      assert base(req(c.brewer, :delete, "/api/supplier_offers/#{c.pils_offer.id}")) ==
               "A #{c.next} contract covers this offer; deactivate it instead"

      free = offer!(c.pils, c.root_shoot, "50")
      assert {204, _} = req(c.brewer, :delete, "/api/supplier_offers/#{free.id}")
    end
  end

  describe "lot numbers (lead note 4)" do
    test "trimmed on save; a product's lot numbers are unique in any case", c do
      body = fn number ->
        %{
          "product_id" => c.product.id,
          "supplier_party_id" => c.bsg.id,
          "lot_number" => number,
          "received_date" => iso(0),
          "pack_size" => "55",
          "initial_kind" => "opening",
          "initial_quantity" => "55"
        }
      end

      assert {201, %{"data" => %{"lot_number" => "W123", "id" => id}}} =
               req(c.brewer, :post, "/api/ingredient_lots", body.("  W123 "))

      for n <- ["w123", " W123", "W123"] do
        assert %{"base" => ["This product already has lot W123"]} =
                 errors(req(c.brewer, :post, "/api/ingredient_lots", body.(n)))
      end

      assert {201, %{"data" => %{"id" => other}}} =
               req(c.brewer, :post, "/api/ingredient_lots", body.("W124"))

      assert %{"base" => ["This product already has lot W123"]} =
               errors(
                 req(c.brewer, :patch, "/api/ingredient_lots/#{other}", %{lot_number: "w123"})
               )

      # A lot keeps its own number in another case.
      assert {200, %{"data" => %{"lot_number" => "w123"}}} =
               req(c.brewer, :patch, "/api/ingredient_lots/#{id}", %{lot_number: "w123"})

      assert {201, %{"data" => %{"lot_number" => nil}}} =
               req(c.brewer, :post, "/api/ingredient_lots", body.("   "))
    end
  end
end
