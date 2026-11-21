defmodule RockcutApiWeb.D61LeadDecisions2Test do
  @moduledoc """
  D61 DEV QA fix cycle (`d61_lead_decisions_2.md`) on the API: an order or
  contract saved from a version someone else has since changed is refused
  (409) and nothing is written; a PUT without a version is 422; cancel and
  receive bump an order's version (gaps 1, 2). The contracts list names
  every year that has a contract (gap 3). Each rule has a refusal and an
  allowed case.
  """
  use RockcutApiWeb.ConnCase, async: false

  import Ecto.Query
  import RockcutApi.PersonaFixtures
  import RockcutApi.IngredientFixtures

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Ingredients.{ContractLine, OfferPrice}

  @order_changed "Someone else changed this order since you opened it. Close and reopen it to see their change."
  @contract_changed "Someone else changed this contract since you opened it. Close and reopen it to see their change."

  setup do
    p = personas(~w(owner brewer1 brewer2 breweryMgr))
    c = grain_catalog!()
    price!(c.offer, "44.00")

    Map.merge(c, %{
      brewer: p["brewer1"],
      brewer2: p["brewer2"],
      mgr: p["breweryMgr"],
      owner: p["owner"],
      this: Tasks.today().year
    })
  end

  defp req(user, verb, path, params \\ %{}) do
    conn = call(user, verb, path, params)
    {conn.status, if(conn.resp_body == "", do: nil, else: Jason.decode!(conn.resp_body))}
  end

  defp conflict({409, %{"errors" => %{"base" => [message]}}}), do: message
  defp errors({422, %{"errors" => errors}}), do: errors

  defp order!(c) do
    {201, %{"data" => data}} =
      req(c.brewer, :post, "/api/purchase_orders", %{
        "supplier_party_id" => c.bsg.id,
        "ordered_on" => Date.to_iso8601(Tasks.today()),
        "lines" => [%{"offer_id" => c.offer.id, "packs_ordered" => 5}]
      })

    data
  end

  # The body the Edit dialog sends: the whole order as opened, with changes.
  defp order_body(order, changes) do
    Map.merge(
      %{
        "supplier_party_id" => order["supplier_party_id"],
        "ordered_on" => order["ordered_on"],
        "reference" => order["reference"],
        "notes" => order["notes"],
        "lock_version" => order["lock_version"],
        "lines" =>
          for(
            l <- order["lines"],
            do: %{
              "id" => l["id"],
              "offer_id" => l["offer_id"],
              "packs_ordered" => l["packs_ordered"]
            }
          )
      },
      changes
    )
  end

  defp sacks(order), do: hd(order["lines"])["packs_ordered"]

  defp fetch!(c, path) do
    {200, %{"data" => data}} = req(c.brewer, :get, path)
    data
  end

  describe "an order saved from an older version (gap 1)" do
    test "the second of two saves from one version is 409 and writes nothing; the first bumps the version",
         c do
      opened = order!(c)
      assert opened["lock_version"] == 1
      path = "/api/purchase_orders/#{opened["id"]}"
      [line] = opened["lines"]

      nine =
        put_in(order_body(opened, %{})["lines"], [
          %{"id" => line["id"], "offer_id" => c.offer.id, "packs_ordered" => 9}
        ])

      assert {200, %{"data" => saved}} = req(c.brewer, :put, path, nine)
      assert saved["lock_version"] == 2 and sacks(saved) == 9

      stale = order_body(opened, %{"reference" => "PO-STALE"})
      assert conflict(req(c.brewer2, :put, path, stale)) == @order_changed

      now = fetch!(c, path)
      assert sacks(now) == 9 and now["reference"] == nil and now["lock_version"] == 2
      assert hd(now["lines"])["id"] == line["id"]

      # Reopened (the current version): saves.
      assert {200, %{"data" => again}} =
               req(c.brewer2, :put, path, order_body(now, %{"reference" => "PO-NEW"}))

      assert again["reference"] == "PO-NEW" and sacks(again) == 9 and again["lock_version"] == 3
    end

    test "a PUT without a version, or with one that isn't a whole number, is 422; nothing is written",
         c do
      opened = order!(c)
      path = "/api/purchase_orders/#{opened["id"]}"

      body = opened |> order_body(%{"reference" => "PO-X"}) |> Map.delete("lock_version")
      assert errors(req(c.brewer, :put, path, body)) == %{"lock_version" => ["can't be blank"]}

      assert errors(req(c.brewer, :put, path, Map.put(body, "lock_version", "one"))) ==
               %{"lock_version" => ["is invalid"]}

      assert fetch!(c, path)["reference"] == nil
      assert {200, _} = req(c.brewer, :put, path, Map.put(body, "lock_version", "1"))
    end

    test "cancel and receive bump the version; an Edit opened before them is refused", c do
      cancelled = order!(c)
      path = "/api/purchase_orders/#{cancelled["id"]}"
      assert {200, %{"data" => after_cancel}} = req(c.brewer2, :post, path <> "/cancel")
      assert after_cancel["lock_version"] == 2

      assert conflict(req(c.brewer, :put, path, order_body(cancelled, %{"notes" => "x"}))) ==
               "This order has already been cancelled"

      received = order!(c)
      path = "/api/purchase_orders/#{received["id"]}"
      [line] = received["lines"]

      assert {200, %{"data" => after_receive}} =
               req(c.brewer2, :post, path <> "/receive", %{
                 "lines" => [
                   %{
                     "id" => line["id"],
                     "packs_received" => 5,
                     "allocations" => [%{"lot_number" => "LD2-#{line["id"]}", "packs" => 5}]
                   }
                 ]
               })

      assert after_receive["lock_version"] == 2

      assert conflict(req(c.brewer, :put, path, order_body(received, %{"notes" => "x"}))) ==
               "This order has already been received"

      assert fetch!(c, path)["notes"] == nil
    end
  end

  describe "a contract saved from an older version (gap 2)" do
    defp contract_body(contract, changes) do
      Map.merge(
        %{
          "supplier_party_id" => contract["supplier_party_id"],
          "year" => contract["year"],
          "notes" => contract["notes"],
          "lock_version" => contract["lock_version"],
          "lines" =>
            for(
              l <- contract["lines"],
              do: %{
                "product_id" => l["product_id"],
                "quantity" => l["quantity"],
                "price" => l["price"]
              }
            )
        },
        changes
      )
    end

    defp prices(offer),
      do: Repo.aggregate(from(p in OfferPrice, where: p.offer_id == ^offer.id), :count)

    test "the second of two saves from one version is 409; its lines and the price rows they'd write are untouched",
         c do
      {201, %{"data" => opened}} =
        req(c.mgr, :post, "/api/contracts", %{
          "supplier_party_id" => c.bsg.id,
          "year" => c.this + 1,
          "lines" => [%{"product_id" => c.product.id, "quantity" => 5, "price" => "41.00"}]
        })

      assert opened["lock_version"] == 1
      path = "/api/contracts/#{opened["id"]}"

      line_ids =
        Repo.all(from(l in ContractLine, where: l.contract_id == ^opened["id"], select: l.id))

      eight =
        contract_body(opened, %{
          "lines" => [%{"product_id" => c.product.id, "quantity" => 8, "price" => "41.00"}]
        })

      assert {200, %{"data" => saved}} = req(c.owner, :put, path, eight)
      assert saved["lock_version"] == 2 and hd(saved["lines"])["quantity"] == 8
      rows = prices(c.offer)

      # The stale dialog also changed the price: no price row is written.
      stale =
        contract_body(opened, %{
          "notes" => "stale",
          "lines" => [%{"product_id" => c.product.id, "quantity" => 5, "price" => "39.00"}]
        })

      assert conflict(req(c.mgr, :put, path, stale)) == @contract_changed

      {200, %{"data" => now}} = req(c.mgr, :get, path)
      assert now["notes"] == nil and now["lock_version"] == 2
      assert [%{"quantity" => 8, "price" => "41"}] = now["lines"]
      assert prices(c.offer) == rows

      assert Repo.all(
               from(l in ContractLine, where: l.contract_id == ^opened["id"], select: l.id)
             ) == line_ids

      # Reopened: saves.
      assert {200, %{"data" => again}} =
               req(c.mgr, :put, path, contract_body(now, %{"notes" => "fresh"}))

      assert again["notes"] == "fresh" and again["lock_version"] == 3
    end

    test "a PUT without a version is 422 and writes nothing", c do
      {201, %{"data" => opened}} =
        req(c.mgr, :post, "/api/contracts", %{
          "supplier_party_id" => c.bsg.id,
          "year" => c.this + 1,
          "lines" => [%{"product_id" => c.product.id, "quantity" => 5, "price" => "41.00"}]
        })

      path = "/api/contracts/#{opened["id"]}"
      body = opened |> contract_body(%{"notes" => "x"}) |> Map.delete("lock_version")
      assert errors(req(c.mgr, :put, path, body)) == %{"lock_version" => ["can't be blank"]}
      {200, %{"data" => now}} = req(c.mgr, :get, path)
      assert now["notes"] == nil
    end
  end

  describe "the contract years (gap 3)" do
    test "the list names every year with a contract, whichever year is asked for", c do
      {200, %{"years" => none}} = req(c.brewer, :get, "/api/contracts")
      assert none == []

      for {supplier, year} <- [
            {c.bsg, c.this + 3},
            {c.bsg, 2001},
            {party!("Country Malt", ~w(supplier)), c.this + 3}
          ] do
        assert {201, _} =
                 req(c.mgr, :post, "/api/contracts", %{
                   "supplier_party_id" => supplier.id,
                   "year" => year,
                   "lines" => []
                 })
      end

      assert {200, %{"years" => years, "year" => year}} =
               req(c.brewer, :get, "/api/contracts?year=2001")

      assert years == [2001, c.this + 3] and year == 2001
    end
  end
end
