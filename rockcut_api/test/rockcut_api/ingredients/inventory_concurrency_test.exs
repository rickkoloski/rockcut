defmodule RockcutApi.Ingredients.InventoryConcurrencyTest do
  @moduledoc """
  D60 plan risk "oldest-first under concurrency": two brewers drawing from
  the same product at once, each for more than half the on-hand. The write
  runs in `BEGIN IMMEDIATE` and recomputes on-hand inside it, so one wins
  and the other is refused; on-hand never goes below 0.
  """
  use RockcutApi.DataCase, async: false

  import RockcutApi.IngredientFixtures
  import RockcutApi.PersonaFixtures

  alias RockcutApi.Tasks
  alias RockcutApi.Ingredients.Inventory

  test "two parallel uses of more than half the stock: one succeeds, one is 422" do
    c = grain_catalog!()
    p = personas(~w(brewer1 brewer2))
    stocked_lot!(c.product, Date.add(Tasks.today(), -20), "165")
    stocked_lot!(c.product, Date.add(Tasks.today(), -5), "220")
    parent = self()

    results =
      [p["brewer1"], p["brewer2"]]
      |> Enum.map(fn who ->
        Task.async(fn ->
          Ecto.Adapters.SQL.Sandbox.allow(Repo, parent, self())

          Inventory.create_movement(
            %{
              "kind" => "used",
              "quantity_lb" => "200",
              "occurred_on" => Date.to_iso8601(Tasks.today()),
              "product_id" => c.product.id,
              "allocation" => "oldest_first"
            },
            who
          )
        end)
      end)
      |> Task.await_many()

    assert [{:ok, [_, _]}] = Enum.filter(results, &match?({:ok, _}, &1))

    assert [{:error, {:invalid, %{base: ["That's more than the 3 sacks 20 lb on hand"]}}}] =
             Enum.reject(results, &match?({:ok, _}, &1))

    on_hand = Inventory.on_hand_by_product([c.product.id])[c.product.id]
    assert Decimal.eq?(on_hand, 185)

    assert Inventory.on_hand_by_lot(Enum.map(Repo.all(RockcutApi.Brewing.IngredientLot), & &1.id))
           |> Map.values()
           |> Enum.all?(&(not Decimal.negative?(&1)))
  end
end
