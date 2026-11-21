defmodule RockcutApi.Ingredients.PurchasingSchemasTest do
  @moduledoc """
  D61 Stage 1: the contract and order schemas' changesets (required fields,
  ranges, statuses, unique constraints) and the new fields on parties,
  products and movements. The business rules are Stage 2's.
  """
  use RockcutApi.DataCase, async: true

  import RockcutApi.IngredientFixtures

  alias RockcutApi.Ingredients.{
    Contract,
    ContractLine,
    Movement,
    Party,
    Product,
    PurchaseOrder,
    PurchaseOrderLine
  }

  setup do
    grain_catalog!()
  end

  defp errors(changeset), do: errors_on(changeset)

  defp contract!(c, year \\ 2027) do
    %Contract{}
    |> Contract.changeset(%{supplier_party_id: c.bsg.id, year: year})
    |> Repo.insert!()
  end

  defp order!(c) do
    %PurchaseOrder{}
    |> PurchaseOrder.changeset(%{supplier_party_id: c.bsg.id, ordered_on: ~D[2026-11-18]})
    |> Repo.insert!()
  end

  describe "Contract" do
    test "needs a supplier and a year 2000–2100; one per supplier per year", c do
      assert %{supplier_party_id: [_], year: [_]} = errors(Contract.changeset(%Contract{}, %{}))

      for year <- [1999, 2101] do
        assert %{year: ["must be between 2000 and 2100"]} =
                 errors(
                   Contract.changeset(%Contract{}, %{supplier_party_id: c.bsg.id, year: year})
                 )
      end

      contract!(c)

      assert {:error, cs} =
               %Contract{}
               |> Contract.changeset(%{supplier_party_id: c.bsg.id, year: 2027})
               |> Repo.insert()

      assert %{supplier_party_id: ["This supplier already has a contract for that year"]} =
               errors(cs)

      assert %Contract{} = contract!(c, 2028)
    end
  end

  describe "ContractLine" do
    test "whole sacks ≥ 1, price ≥ 0, one line per product; deleted with its contract", c do
      contract = contract!(c)
      base = %{contract_id: contract.id, product_id: c.product.id}

      assert %{quantity: [_], price: [_]} =
               errors(ContractLine.changeset(%ContractLine{}, base))

      assert %{quantity: [_]} =
               errors(
                 ContractLine.changeset(
                   %ContractLine{},
                   Map.merge(base, %{quantity: 0, price: "42"})
                 )
               )

      # D62: the quantity is a decimal now (hop lines are in lb); a grain line stays whole sacks.
      assert %{quantity: ["Use a whole number"]} =
               errors(
                 ContractLine.changeset(
                   %ContractLine{},
                   Map.merge(base, %{quantity: "1.5", price: "42"})
                 )
               )

      assert %{quantity: ["Use at most 2 decimals"]} =
               errors(
                 ContractLine.changeset(
                   %ContractLine{},
                   Map.merge(base, %{quantity: "440.125", price: "14.5"}),
                   :lb
                 )
               )

      assert %{} ==
               errors(
                 ContractLine.changeset(
                   %ContractLine{},
                   Map.merge(base, %{quantity: "440.5", price: "14.5"}),
                   :lb
                 )
               )

      assert %{price: [_]} =
               errors(
                 ContractLine.changeset(
                   %ContractLine{},
                   Map.merge(base, %{quantity: 1, price: "-1"})
                 )
               )

      line =
        %ContractLine{}
        |> ContractLine.changeset(Map.merge(base, %{quantity: 200, price: "0"}))
        |> Repo.insert!()

      assert {:error, cs} =
               %ContractLine{}
               |> ContractLine.changeset(Map.merge(base, %{quantity: 1, price: "42"}))
               |> Repo.insert()

      assert %{contract_id: ["This contract already has a line for that product"]} = errors(cs)

      Repo.delete!(contract)
      refute Repo.reload(line)
    end
  end

  describe "PurchaseOrder" do
    test "needs a supplier and an order date; status open by default and in the set", c do
      assert %{supplier_party_id: [_], ordered_on: [_]} =
               errors(PurchaseOrder.changeset(%PurchaseOrder{}, %{}))

      order = order!(c)
      assert order.status == "open" and order.off_contract == false

      assert %{status: [_]} = errors(PurchaseOrder.changeset(order, %{status: "draft"}))

      for status <- PurchaseOrder.statuses(),
          do: assert(PurchaseOrder.changeset(order, %{status: status}).valid?)

      assert PurchaseOrder.changeset(order, %{reference: "  "}).changes == %{}
    end
  end

  describe "PurchaseOrderLine" do
    test "whole sacks ordered ≥ 1, received ≥ 0, price ≥ 0; deleted with its order", c do
      order = order!(c)
      base = %{order_id: order.id, offer_id: c.offer.id, price_per_pack: "48.50"}

      assert %{packs_ordered: [_]} =
               errors(
                 PurchaseOrderLine.changeset(
                   %PurchaseOrderLine{},
                   Map.put(base, :packs_ordered, 0)
                 )
               )

      assert %{packs_received: [_]} =
               errors(
                 PurchaseOrderLine.changeset(
                   %PurchaseOrderLine{},
                   Map.merge(base, %{packs_ordered: 1, packs_received: -1})
                 )
               )

      line =
        %PurchaseOrderLine{}
        |> PurchaseOrderLine.changeset(Map.merge(base, %{packs_ordered: 10, packs_received: 0}))
        |> Repo.insert!()

      Repo.delete!(order)
      refute Repo.reload(line)
    end
  end

  describe "new fields" do
    test "order target, minimum on hand, movement order line and cost", c do
      assert Party.changeset(c.bsg, %{order_target_packs: 40}).valid?
      assert %{order_target_packs: [_]} = errors(Party.changeset(c.bsg, %{order_target_packs: 0}))

      assert Product.changeset(c.product, %{min_on_hand_packs: 3}).valid?

      assert %{min_on_hand_packs: [_]} =
               errors(Product.changeset(c.product, %{min_on_hand_packs: -1}))

      lot = stocked_lot!(c.product, ~D[2026-11-01], "55", "L1")
      order = order!(c)

      line =
        %PurchaseOrderLine{}
        |> PurchaseOrderLine.changeset(%{
          order_id: order.id,
          offer_id: c.offer.id,
          packs_ordered: 1,
          price_per_pack: "48.50"
        })
        |> Repo.insert!()

      movement =
        %Movement{}
        |> Movement.changeset(%{
          lot_id: lot.id,
          kind: "received",
          quantity: "55",
          occurred_on: ~D[2026-11-18],
          purchase_order_line_id: line.id,
          unit_cost: "0.8818"
        })
        |> Repo.insert!()

      assert movement.purchase_order_line_id == line.id
      assert Decimal.eq?(movement.unit_cost, "0.8818")

      assert %{purchase_order_line_id: ["does not exist"]} =
               errors(Movement.changeset(%Movement{}, %{purchase_order_line_id: -1}))
    end
  end
end
