defmodule RockcutApiWeb.D63UseOrderTest do
  @moduledoc """
  D63 Stop 2 (spec §4, §7, §12 "Use order"): a hop's use lists. Where a lot's
  place comes from (every insert, every change of list), reading and
  reordering them, allocation and counts, who may, and the account's Hide
  used-up lots. Each rule has a refusal and an allowed case.
  """
  use RockcutApiWeb.ConnCase, async: false

  import Ecto.Query, only: [from: 2]
  import RockcutApi.PersonaFixtures
  import RockcutApi.IngredientFixtures

  alias RockcutApi.{Brewing, Repo, Tasks}
  alias RockcutApi.Brewing.{Ingredient, IngredientLot}
  alias RockcutApi.Ingredients.{Inventory, Movement, Product, UseOrder}

  setup do
    p = personas(~w(owner brewer1 brewer2 breweryMgr splitRole office1 bartender1 barMgr))
    c = grain_catalog!()
    c = Map.merge(c, hop_catalog!(c))
    Map.merge(c, %{p: p, brewer: p["brewer1"]})
  end

  ## Helpers

  defp day(offset), do: Date.add(Tasks.today(), offset)
  defp iso(offset), do: Date.to_iso8601(day(offset))

  defp req(user, verb, path, params \\ %{}) do
    conn = call(user, verb, path, params)
    {conn.status, if(conn.resp_body == "", do: nil, else: Jason.decode!(conn.resp_body))}
  end

  defp errors({422, %{"errors" => errors}}), do: errors

  defp lists(c, ingredient_id \\ nil) do
    {200, %{"data" => data}} =
      req(c.brewer, :get, "/api/hop_use_lists", %{"ingredient_id" => ingredient_id || c.citra.id})

    data
  end

  defp list(c, form \\ "T90 Pellet"), do: Enum.find(lists(c), &(&1["form"] == form))
  defp ids(list), do: Enum.map(list["lots"], & &1["id"])

  defp order(c, lot_ids, extra \\ %{}, user \\ nil) do
    body =
      Map.merge(
        %{
          "ingredient_id" => c.citra.id,
          "form" => "T90 Pellet",
          "lot_ids" => lot_ids,
          "version" => list(c)["version"]
        },
        extra
      )

    req(user || c.brewer, :put, "/api/hop_use_lists/order", body)
  end

  # A lot through the API: its place is the API's.
  defp lot!(c, number, opts \\ []) do
    {201, %{"data" => lot}} =
      req(c.brewer, :post, "/api/ingredient_lots", %{
        "product_id" => (opts[:product] || c.hop_product).id,
        "supplier_party_id" => c.ych.id,
        "lot_number" => number,
        "received_date" => iso(opts[:received] || -1),
        "crop_year" => opts[:crop] || 2025,
        "initial_kind" => "opening",
        "initial_quantity" => opts[:lb] || "11",
        "features" => %{"alpha_acid_pct" => "12.5"}
      })

    lot["id"]
  end

  defp pos(id), do: Repo.get!(IngredientLot, id).use_position

  defp put_pos(id, position),
    do:
      Repo.update_all(from(l in IngredientLot, where: l.id == ^id), set: [use_position: position])

  defp status!(id, status),
    do: Repo.update_all(from(l in IngredientLot, where: l.id == ^id), set: [status: status])

  # A second maker's Citra T90, and Citra Cryo.
  defp other_maker(c), do: product(c, c.root_shoot, "T90 Pellet")
  defp cryo(c), do: product(c, c.ych, "Cryo")

  defp product(c, maker, form),
    do:
      Repo.insert!(%Product{
        ingredient_id: c.citra.id,
        manufacturer_party_id: maker.id,
        form: form
      })

  defp use!(c, lb, extra) do
    req(
      c.brewer,
      :post,
      "/api/inventory_movements",
      Map.merge(%{"kind" => "used", "quantity" => lb, "occurred_on" => iso(0)}, extra)
    )
  end

  defp oldest(c), do: %{"product_id" => c.hop_product.id, "allocation" => "oldest_first"}

  defp took({201, %{"data" => movements}}),
    do: Enum.map(movements, &{&1["lot_id"], Decimal.to_float(Decimal.new(&1["quantity"]))})

  defp count!(c, counted, product \\ nil) do
    req(c.brewer, :post, "/api/ingredient_products/#{(product || c.hop_product).id}/count", %{
      "mode" => "total",
      "counted" => counted,
      "counted_on" => iso(0)
    })
  end

  ## §4.1

  describe "a lot's place (§4.1)" do
    test "a new lot goes to the end of its variety and form, across makers; Cryo is its own list",
         c do
      a = lot!(c, "A", received: -1)
      b = lot!(c, "B", received: -20, product: other_maker(c))
      x = lot!(c, "X", received: -30, product: cryo(c))
      d = lot!(c, "D", received: -40)

      assert Enum.map([a, b, x, d], &pos/1) == [1, 2, 1, 3]

      assert [%{"form" => "T90 Pellet"}, %{"form" => "Cryo"}] = lists(c)
      assert ids(list(c)) == [a, b, d]
      assert ids(list(c, "Cryo")) == [x]
    end

    test "max + 1, not the number of lots: after a delete, or a gap", c do
      [a, b] = for n <- ~w(A B), do: lot!(c, n)
      assert {204, nil} = req(c.brewer, :delete, "/api/ingredient_lots/#{a}")
      assert pos(lot!(c, "C")) == pos(b) + 1
    end

    test "every other lot has none", c do
      lot = stocked_lot!(c.product, day(-1), "55")

      {201, %{"data" => made}} =
        req(c.brewer, :post, "/api/ingredient_lots", %{
          "product_id" => c.product.id,
          "supplier_party_id" => c.bsg.id,
          "pack_size" => "55",
          "lot_number" => "G-1",
          "received_date" => iso(-1),
          "initial_kind" => "opening",
          "initial_quantity" => "55"
        })

      assert made["use_position"] == nil
      assert {nil, nil} = {pos(lot.id), pos(made["id"])}
      assert lists(c, c.two_row.id) == []
    end

    test "use_position isn't settable on a lot", c do
      a = lot!(c, "A")
      assert {200, _} = req(c.brewer, :put, "/api/ingredient_lots/#{a}", %{"use_position" => 9})
      assert pos(a) == 1
    end

    test "receiving a new lot puts it at the end; into an existing lot moves nothing", c do
      [a, b] = for n <- ~w(A B), do: lot!(c, n)
      assert {200, _} = order(c, [b, a])

      for {to, i} <-
            Enum.with_index([
              %{"lot_id" => b},
              %{
                "lot_number" => "R",
                "crop_year" => 2026,
                "features" => %{"alpha_acid_pct" => "11.9"}
              }
            ]) do
        {201, %{"data" => o}} =
          req(c.brewer, :post, "/api/purchase_orders", %{
            "supplier_party_id" => c.ych.id,
            "ordered_on" => iso(-2),
            "lines" => [
              %{"offer_id" => c.hop_offer.id, "packs_ordered" => 1, "price_per_pack" => "100"}
            ]
          })

        [line] = o["lines"]

        assert {200, _} =
                 req(c.brewer, :post, "/api/purchase_orders/#{o["id"]}/receive", %{
                   "received_on" => iso(0),
                   "lines" => [
                     %{
                       "id" => line["id"],
                       "packs_received" => 1,
                       "price_per_pack" => "100",
                       "allocations" => [Map.put(to, "packs", 1)]
                     }
                   ]
                 }),
               "receipt #{i}"
      end

      r = Repo.get_by!(IngredientLot, lot_number: "R")
      assert ids(list(c)) == [b, a, r.id]
      assert pos(r.id) == 3
    end

    test "Brewing.create_ingredient_lot takes the end too, and a bad one writes nothing", c do
      a = lot!(c, "A")

      assert {:ok, lot} =
               Brewing.create_ingredient_lot(%{
                 ingredient_id: c.citra.id,
                 product_id: c.hop_product.id
               })

      assert pos(lot.id) == pos(a) + 1
      assert {:error, %Ecto.Changeset{}} = Brewing.create_ingredient_lot(%{lot_number: "none"})

      assert {:error, %Ecto.Changeset{}} =
               Brewing.create_ingredient_lot(%{
                 ingredient_id: c.citra.id,
                 product_id: c.hop_product.id,
                 lot_number: "a"
               })
    end

    test "a lot given another maker's product of the form stays; given a Cryo, it goes to that list's end",
         c do
      cryo = cryo(c)
      x = lot!(c, "X", product: cryo)
      # No movements, so the API lets its product change.
      [a, b] =
        for n <- ~w(A B),
            do:
              UseOrder.insert_lot!(%IngredientLot{
                ingredient_id: c.citra.id,
                product_id: c.hop_product.id,
                lot_number: n,
                crop_year: 2025,
                received_date: day(-3),
                pack_name: "box",
                pack_size: Decimal.new(11)
              }).id

      for id <- [a, b], do: lot_features!(%{id: id}, alpha_acid_pct: "12")

      move = fn id, product ->
        req(c.brewer, :put, "/api/ingredient_lots/#{id}", %{"product_id" => product.id})
      end

      assert {200, _} = move.(a, other_maker(c))
      assert pos(a) == 1
      assert {200, _} = move.(a, cryo)
      assert {pos(x), pos(a), pos(b)} == {1, 2, 2}
      assert ids(list(c, "Cryo")) == [x, a]

      # With movements it's refused, and nothing moves.
      assert %{"product_id" => [_]} = errors(move.(x, c.hop_product))
      assert pos(x) == 1
    end

    test "a product moved to another hop takes its lots to that list's end, in their order; another maker's stay",
         c do
      mosaic = Repo.insert!(%Ingredient{name: "Mosaic", category_id: c.hops.id})

      there =
        Repo.insert!(%Product{
          ingredient_id: mosaic.id,
          manufacturer_party_id: c.root_shoot.id,
          form: "T90 Pellet"
        })

      m = hop_lot!(there, day(-9), "11", "12")
      put_pos(m.id, 1)
      other = other_maker(c)
      [a, b, o] = [lot!(c, "A"), lot!(c, "B"), lot!(c, "O", product: other)]
      assert {200, _} = order(c, [b, o, a])

      assert {200, _} =
               req(c.brewer, :put, "/api/ingredient_products/#{c.hop_product.id}", %{
                 "ingredient_id" => mosaic.id,
                 "lock_version" => product_version(c.hop_product.id)
               })

      assert [%{"lots" => moved}] = lists(c, mosaic.id)
      assert Enum.map(moved, & &1["id"]) == [m.id, b, a]
      assert Enum.map([m.id, b, a, o], &pos/1) == [1, 2, 3, 2]
      assert ids(list(c)) == [o]
    end

    test "a product's form can't change once it has lots, and an edit that keeps it moves nothing",
         c do
      a = lot!(c, "A")
      put_pos(a, 7)
      path = "/api/ingredient_products/#{c.hop_product.id}"
      v = fn -> product_version(c.hop_product.id) end

      assert %{"form" => [_]} =
               errors(req(c.brewer, :put, path, %{"form" => "Cryo", "lock_version" => v.()}))

      assert {200, _} = req(c.brewer, :put, path, %{"notes" => "x", "lock_version" => v.()})
      assert pos(a) == 7
    end

    test "a hop ingredient moved out of Hops: its lots have no place; moved in: the end, oldest first",
         c do
      [a, b] = [lot!(c, "A", received: -2), lot!(c, "B", received: -8)]
      path = "/api/ingredients/#{c.citra.id}"

      assert {200, _} = req(c.brewer, :put, path, %{"name" => "Citra!"})
      assert {pos(a), pos(b)} == {1, 2}

      assert {200, _} = req(c.brewer, :put, path, %{"category_id" => c.base.id})
      assert {pos(a), pos(b)} == {nil, nil}
      assert lists(c) == []

      assert {200, _} = req(c.brewer, :put, path, %{"category_id" => c.hops.id})
      assert {pos(b), pos(a)} == {1, 2}

      # A refused save moves nothing.
      assert %{"category_id" => _} =
               errors(req(c.brewer, :put, path, %{"category_id" => 999_999}))

      assert {pos(b), pos(a)} == {1, 2}
    end

    test "Brewing.update_ingredient and update_ingredient_lot keep the places too", c do
      a = lot!(c, "A")
      x = lot!(c, "X", product: cryo(c))
      cryo = Repo.get!(IngredientLot, x).product_id
      {:ok, _} = Brewing.update_ingredient_lot(Repo.get!(IngredientLot, a), %{product_id: cryo})
      assert pos(a) == 2
      {:ok, _} = Brewing.update_ingredient(c.citra, %{category_id: c.base.id})
      assert {pos(a), pos(x)} == {nil, nil}
    end

    test "counting, using and expiring move nothing; a lot at 0 keeps its place and has it back",
         c do
      [a, b, d] = for n <- ~w(A B D), do: lot!(c, n)
      assert {201, _} = use!(c, "11", %{"lot_id" => a})
      assert {200, _} = req(c.brewer, :put, "/api/ingredient_lots/#{b}", %{"status" => "expired"})
      assert ids(list(c)) == [a, b, d]
      assert Enum.map([a, b, d], &pos/1) == [1, 2, 3]

      assert {201, _} =
               req(c.brewer, :post, "/api/ingredient_products/#{c.hop_product.id}/count", %{
                 "mode" => "by_lot",
                 "counted_on" => iso(0),
                 "lots" => [%{"lot_id" => a, "counted" => "4"}]
               })

      assert Enum.map([a, b, d], &pos/1) == [1, 2, 3]
    end

    test "two lots added at once get two places", c do
      parent = self()

      made =
        for n <- ~w(A B C D) do
          Task.async(fn ->
            Ecto.Adapters.SQL.Sandbox.allow(Repo, parent, self())

            UseOrder.insert_lot!(%IngredientLot{
              ingredient_id: c.citra.id,
              product_id: c.hop_product.id,
              lot_number: n
            })
          end)
        end
        |> Task.await_many()

      assert made |> Enum.map(& &1.use_position) |> Enum.sort() == [1, 2, 3, 4]
    end
  end

  ## §4.2

  describe "reading (§4.2)" do
    test "each form's lots in order, with what the page shows; used-up lots too", c do
      other = other_maker(c)
      a = lot!(c, "A", crop: 2024, received: -5, lb: "8.5")
      b = lot!(c, "B", product: other)
      assert {201, _} = use!(c, "11", %{"lot_id" => b})

      assert [%{"form" => "T90 Pellet", "version" => v, "lots" => [first, second]}] = lists(c)
      assert byte_size(v) == 16

      assert %{
               "id" => ^a,
               "lot_number" => "A",
               "maker" => "Yakima Chief Hops",
               "supplier" => "Yakima Chief Hops",
               "crop_year" => 2024,
               "status" => "available",
               "pack_name" => "box",
               "unit" => "lb"
             } = first

      assert first["received_date"] == iso(-5)
      assert first["product_id"] == c.hop_product.id
      assert Decimal.eq?(Decimal.new(first["alpha"]), Decimal.new("12.5"))
      assert Decimal.eq?(Decimal.new(first["on_hand"]), Decimal.new("8.5"))
      assert %{"id" => ^b, "maker" => "Root Shoot", "status" => "depleted"} = second
    end

    test "no id is a 422; an ingredient that isn't a hop, or isn't there, has no lists", c do
      assert %{"ingredient_id" => ["can't be blank"]} =
               errors(req(c.brewer, :get, "/api/hop_use_lists"))

      assert lists(c, c.two_row.id) == []
      assert lists(c, 999_999) == []
    end

    test "Inventory.use_order is one list, across makers, for D68 and D66", c do
      a = lot!(c, "A")
      b = lot!(c, "B", product: other_maker(c))
      x = lot!(c, "X", product: cryo(c))
      assert Enum.map(Inventory.use_order(c.citra.id, "T90 Pellet"), & &1.id) == [a, b]
      assert Enum.map(Inventory.use_order(c.citra.id, "Cryo"), & &1.id) == [x]
      assert Inventory.use_order(c.citra.id, "Extract") == []
      assert Inventory.use_order(c.two_row.id, nil) == []
    end

    test "a null position crashes no read: last, by received date; the next reorder numbers them",
         c do
      [a, b, d] = [
        lot!(c, "A", received: -1),
        lot!(c, "B", received: -2),
        lot!(c, "D", received: -3)
      ]

      for id <- [a, b], do: put_pos(id, nil)
      assert ids(list(c)) == [d, b, a]
      assert [_ | _] = Inventory.list_lots(%{"ingredient_id" => c.citra.id})
      assert [{^d, -11.0}, {^b, -1.0}] = took(use!(c, "12", oldest(c)))
      assert {201, _} = count!(c, "21")
      # D is used up: it keeps the front.
      assert {200, _} = order(c, [a, b])
      assert Enum.map([d, a, b], &pos/1) == [1, 2, 3]
    end
  end

  describe "reordering (§4.2)" do
    test "the lots trade places; the reply is the list; a Brewery member, manager and owner may",
         c do
      [a, b, d] = [lot!(c, "A"), lot!(c, "B", product: other_maker(c)), lot!(c, "D")]

      assert {200, %{"data" => %{"form" => "T90 Pellet", "version" => v, "lots" => lots}}} =
               order(c, [d, a, b])

      assert Enum.map(lots, & &1["id"]) == [d, a, b]
      assert ids(list(c)) == [d, a, b]
      assert list(c)["version"] == v

      for {who, i} <- Enum.with_index(~w(brewer2 breweryMgr owner splitRole)) do
        [first | rest] = ids(list(c))
        assert {200, _} = order(c, rest ++ [first], %{}, c.p[who]), "#{who} #{i}"
      end
    end

    test "a used-up lot keeps its place, and is back in it; Expired lots are ordered", c do
      [a, b, d, e] = for n <- ~w(A B D E), do: lot!(c, n)
      status!(d, "expired")
      assert {201, _} = use!(c, "11", %{"lot_id" => b})
      assert {200, _} = order(c, [e, d, a])
      assert Enum.map([e, b, d, a], &pos/1) == [1, 2, 3, 4]
      assert ids(list(c)) == [e, b, d, a]
    end

    test "positions with gaps stay as they are; shared ones are numbered first", c do
      [a, b, d] = for n <- ~w(A B D), do: lot!(c, n)
      for {id, n} <- [{a, 3}, {b, 10}, {d, 40}], do: put_pos(id, n)
      assert {200, _} = order(c, [d, b, a])
      assert Enum.map([d, b, a], &pos/1) == [3, 10, 40]
      for id <- [a, b, d], do: put_pos(id, 5)
      assert {200, _} = order(c, [b, d, a])
      assert Enum.map([b, d, a], &pos/1) == [1, 2, 3]
    end

    test "the other form's and other hops' lots don't move", c do
      [a, b] = for n <- ~w(A B), do: lot!(c, n)

      [x, y] =
        for n <- ~w(X Y), do: lot!(c, n, product: Repo.get_by(Product, form: "Cryo") || cryo(c))

      assert {200, _} = order(c, [b, a])
      assert {pos(x), pos(y)} == {1, 2}
    end

    test "a lot of another list, a repeated, a missing, an unknown and a used-up one are 422; nothing moves",
         c do
      [a, b, d] = for n <- ~w(A B D), do: lot!(c, n)
      x = lot!(c, "X", product: cryo(c))
      assert {201, _} = use!(c, "11", %{"lot_id" => d})

      for {ids, message} <- [
            {[b, a, x], "A lot isn't in this use list, or has no stock"},
            {[b, x], "A lot isn't in this use list, or has no stock"},
            {[b, a, 999_999], "A lot isn't in this use list, or has no stock"},
            {[b, a, d], "A lot isn't in this use list, or has no stock"},
            {[b, a, a], "A lot is listed twice"},
            {[b], "List every lot with stock"},
            {[], "List every lot with stock"}
          ] do
        assert %{"lot_ids" => [^message]} = errors(order(c, ids))
      end

      assert Enum.map([a, b, d, x], &pos/1) == [1, 2, 3, 1]
    end

    test "malformed: lot_ids, form, version, ingredient", c do
      a = lot!(c, "A")
      assert %{"lot_ids" => ["can't be blank"]} = errors(order(c, nil))
      assert %{"lot_ids" => [_]} = errors(order(c, ["x"]))
      assert %{"lot_ids" => ["is invalid"]} = errors(order(c, [0]))
      assert %{"form" => [_]} = errors(order(c, [a], %{"form" => "Pellet"}))
      assert %{"form" => [_]} = errors(order(c, [a], %{"form" => %{"a" => 1}}))

      for v <- [nil, "", 3, ["x"]],
          do:
            assert(%{"version" => ["can't be blank"]} = errors(order(c, [a], %{"version" => v})))

      assert %{"ingredient_id" => ["can't be blank"]} =
               errors(order(c, [a], %{"ingredient_id" => nil}))

      assert %{"ingredient_id" => ["Only hops have a use order"]} =
               errors(order(c, [a], %{"ingredient_id" => c.two_row.id}))

      assert {404, _} = order(c, [a], %{"ingredient_id" => 999_999})
    end

    test "409 with a sentence, and nothing written, when a lot was reordered, added, used up, back or deleted",
         c do
      [a, b] = for n <- ~w(A B), do: lot!(c, n)

      changes = [
        fn -> {200, _} = order(c, [b, a]) end,
        fn -> lot!(c, "C") end,
        fn -> {201, _} = use!(c, "11", %{"lot_id" => a}) end,
        fn ->
          {201, _} =
            req(c.brewer, :post, "/api/ingredient_products/#{c.hop_product.id}/count", %{
              "mode" => "by_lot",
              "counted_on" => iso(0),
              "lots" => [%{"lot_id" => a, "counted" => "2"}]
            })
        end,
        fn ->
          [last | _] = Enum.reverse(ids(list(c)))
          {204, nil} = req(c.brewer, :delete, "/api/ingredient_lots/#{last}")
        end
      ]

      for {change, i} <- Enum.with_index(changes) do
        seen = list(c)
        change.()
        before = ids(list(c))

        assert {409, %{"errors" => %{"base" => [message]}}} =
                 order(
                   c,
                   Enum.reverse(ids(seen)),
                   %{"version" => seen["version"]},
                   c.p["brewer2"]
                 ),
               "change #{i}"

        assert message ==
                 "The use order changed since you opened it. This is the order now; move the lot again."

        assert ids(list(c)) == before
      end

      # Read again, it saves.
      shown = for l <- list(c)["lots"], Decimal.gt?(Decimal.new(l["on_hand"]), 0), do: l["id"]
      assert {200, _} = order(c, Enum.reverse(shown), %{}, c.p["brewer2"])
    end

    test "using some of a lot, or an edit that isn't the order's, isn't a conflict", c do
      [a, b] = for n <- ~w(A B), do: lot!(c, n)
      v = list(c)["version"]
      assert {201, _} = use!(c, "3", %{"lot_id" => a})
      assert {200, _} = req(c.brewer, :put, "/api/ingredient_lots/#{a}", %{"notes" => "x"})
      assert {200, _} = order(c, [b, a], %{"version" => v})
    end

    test "two brewers at once on one version: one saves, the other is a conflict", c do
      [a, b, d] = for n <- ~w(A B D), do: lot!(c, n)
      v = list(c)["version"]
      parent = self()

      results =
        for ids <- [[d, a, b], [b, a, d]] do
          Task.async(fn ->
            Ecto.Adapters.SQL.Sandbox.allow(Repo, parent, self())

            {ids,
             UseOrder.reorder(%{
               "ingredient_id" => c.citra.id,
               "form" => "T90 Pellet",
               "lot_ids" => ids,
               "version" => v
             })}
          end)
        end
        |> Task.await_many()

      assert [{won, {:ok, _}}] = Enum.filter(results, &match?({_, {:ok, _}}, &1))
      assert [{_, {:error, {:conflict, _}}}] = Enum.reject(results, &match?({_, {:ok, _}}, &1))
      assert ids(list(c)) == won
    end
  end

  ## §4.3

  describe "allocation (§4.3)" do
    setup c do
      # The newest first in use order; the oldest last.
      [old, mid, new] = [
        lot!(c, "OLD", received: -30),
        lot!(c, "MID", received: -20),
        lot!(c, "NEW", received: -1)
      ]

      {200, _} = order(c, [new, old, mid])
      %{old: old, mid: mid, new: new}
    end

    test "in use order, spilling to the next as a second movement; a lot picked by hand still works",
         c do
      {new, old, mid} = {c.new, c.old, c.mid}
      assert [{^new, -11.0}, {^old, -3.0}] = took(use!(c, "14", oldest(c)))
      assert [{^mid, -2.0}] = took(use!(c, "2", %{"lot_id" => mid}))
    end

    test "Traded out and Loaned out follow it too", c do
      new = c.new

      for kind <- ~w(traded_out loaned_out) do
        assert [{^new, -1.0}] =
                 took(
                   use!(
                     c,
                     "1",
                     Map.merge(oldest(c), %{"kind" => kind, "party_id" => c.mountain.id})
                   )
                 )
      end
    end

    test "only that maker's lots, whatever is ahead in the list", c do
      o = lot!(c, "O", product: other_maker(c), received: -50)
      {200, _} = order(c, [o, c.new, c.old, c.mid])
      new = c.new
      assert [{^new, -2.0}] = took(use!(c, "2", oldest(c)))
      assert {422, _} = use!(c, "34", oldest(c))
    end

    test "Expired lots are skipped, and refused past what isn't expired; one picked by hand isn't",
         c do
      status!(c.new, "expired")
      {old, new} = {c.old, c.new}
      assert [{^old, -2.0}] = took(use!(c, "2", oldest(c)))
      assert %{"base" => [message]} = errors(use!(c, "21", oldest(c)))
      assert message =~ "plus 1 box in expired lots"
      assert [{^new, -1.0}] = took(use!(c, "1", %{"lot_id" => new}))
    end

    test "a count short comes off in use order", c do
      {new, old} = {c.new, c.old}
      assert [{^new, -1.0}] = took(count!(c, "32"))
      assert [{^new, -10.0}, {^old, -1.0}] = took(count!(c, "21"))
    end

    test "a count over goes onto the newest by received date, which is first in use order", c do
      new = c.new
      assert [{^new, 1.0}] = took(count!(c, "34"))
    end

    test "a count over with the newest expired goes onto the newest that isn't, not the last in use order",
         c do
      # By date: OLD, MID, NEW. In use order: NEW, MID, OLD.
      {200, _} = order(c, [c.new, c.mid, c.old])
      status!(c.new, "expired")
      mid = c.mid
      assert [{^mid, 1.0}] = took(count!(c, "34"))
    end

    test "two received the same day: the newest is the higher id", c do
      same = lot!(c, "SAME", received: -1)
      {200, _} = order(c, [same, c.new, c.old, c.mid])
      assert [{^same, 1.0}] = took(count!(c, "45"))
    end

    test "Counted, no change goes on the newest that isn't expired; all expired: the newest", c do
      new = c.new
      assert [{^new, +0.0}] = took(count!(c, "33"))
      status!(c.new, "expired")
      mid = c.mid
      assert [{^mid, +0.0}] = took(count!(c, "33"))
      for id <- [c.old, c.mid], do: status!(id, "expired")
      assert [{^new, +0.0}] = took(count!(c, "33"))
      assert %{"base" => ["Every lot is expired; count by lot instead"]} = errors(count!(c, "34"))
    end

    test "a count by lot still works in any order", c do
      assert {201, _} =
               req(c.brewer, :post, "/api/ingredient_products/#{c.hop_product.id}/count", %{
                 "mode" => "by_lot",
                 "counted_on" => iso(0),
                 "lots" => [%{"lot_id" => c.mid, "counted" => "4"}]
               })
    end

    test "grain: oldest received first, whatever a stray position says; over onto the newest",
         c do
      [g1, g2] = [
        stocked_lot!(c.product, day(-9), "55", "G1"),
        stocked_lot!(c.product, day(-2), "55", "G2")
      ]

      put_pos(g1.id, 2)
      put_pos(g2.id, 1)
      {a, b} = {g1.id, g2.id}
      grain = %{"product_id" => c.product.id, "allocation" => "oldest_first"}
      assert [{^a, -55.0}, {^b, -5.0}] = took(use!(c, "60", grain))
      assert [{^b, 5.0}] = took(count!(c, "55", c.product))
    end

    test "a yeast pitch takes the oldest received first", c do
      y = yeast_catalog!()
      product = yeast_product!(y.chico, y.fermentis, "US-05")

      [new, old] =
        for {n, received} <- [{"Y-NEW", -1}, {"Y-OLD", -9}] do
          lot =
            Repo.insert!(%IngredientLot{
              ingredient_id: y.chico.id,
              product_id: product.id,
              lot_number: n,
              received_date: day(received),
              pack_name: "brick",
              pack_size: Decimal.new(1)
            })

          Repo.insert!(%Movement{
            lot_id: lot.id,
            kind: "opening",
            quantity: Decimal.new(2),
            occurred_on: day(received)
          })

          lot.id
        end

      batch = batch!("44")
      attrs = %{"quantity" => "3", "occurred_on" => iso(0), "batch_id" => batch.id}
      assert {:ok, [%{lot_id: ^old}, %{lot_id: ^new}]} = Inventory.pitch(product, attrs, c.brewer)
    end
  end

  ## §7

  describe "who (§7, D31)" do
    test "office1, the Taproom and the brewhouse device: 403 on both, before anything is read",
         c do
      a = lot!(c, "A")

      body = %{
        "ingredient_id" => c.citra.id,
        "form" => "T90 Pellet",
        "lot_ids" => [a],
        "version" => list(c)["version"]
      }

      for who <- ~w(office1 bartender1 barMgr) do
        assert {403, _} =
                 req(c.p[who], :get, "/api/hop_use_lists", %{"ingredient_id" => c.citra.id})

        assert {403, _} = req(c.p[who], :put, "/api/hop_use_lists/order", body)
        assert {403, _} = req(c.p[who], :put, "/api/hop_use_lists/order", %{})
      end

      for home <- ~w(bar brewery) do
        device = RockcutApi.AccountsFixtures.device_fixture(%{home: home, name: "D63 #{home}"})
        token = RockcutApi.AccountsFixtures.device_token_fixture(device, "D63 #{home}")

        assert call_device(token, :get, "/api/hop_use_lists", %{"ingredient_id" => c.citra.id}).status ==
                 403

        assert call_device(token, :put, "/api/hop_use_lists/order", body).status == 403

        refute RockcutApi.Authz.can?(
                 RockcutApi.Accounts.get_user!(device.id),
                 :write,
                 :ingredients
               )
      end

      assert {200, _} = req(c.p["brewer2"], :put, "/api/hop_use_lists/order", body)
    end
  end

  ## §4.4

  describe "Hide used-up lots (§4.4, A9)" do
    test "kept per account beside the display, true until changed; only a boolean", c do
      path = "/api/me/board_settings/ingredients"

      assert RockcutApi.Accounts.BoardSettings.defaults("ingredients")["hide_used_up_lots"] ==
               true

      assert {200, _} = req(c.brewer, :put, path, %{"hide_used_up_lots" => false})
      assert {200, _} = req(c.brewer, :put, path, %{"quantity_display" => "lb"})
      {200, me} = req(c.brewer, :get, "/api/me")

      assert %{"hide_used_up_lots" => false, "quantity_display" => "lb"} =
               me["board_settings"]["ingredients"]

      {200, other} = req(c.p["brewer2"], :get, "/api/me")
      refute get_in(other, ["board_settings", "ingredients", "hide_used_up_lots"]) == false

      for bad <- ["maybe", nil, 3, []] do
        assert {422, _} = req(c.brewer, :put, path, %{"hide_used_up_lots" => bad})
      end
    end
  end
end
