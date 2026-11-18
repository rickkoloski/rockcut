defmodule RockcutApi.Formulas.Functions.Inventory do
  @moduledoc """
  Inventory-related formula functions.
  """

  alias RockcutApi.Ingredients.Inventory

  @doc """
  On hand in lb (D60 §3.7: the sum of the lots' movements) of a maltster
  product (`product_id`) or of an ingredient over all its lots
  (`ingredient_id`). A number; 0 when nothing is on hand.
  """
  def on_hand(_context, params) do
    product_id = params["product_id"] || params[:product_id]
    ingredient_id = params["ingredient_id"] || params[:ingredient_id]

    cond do
      product_id ->
        {:ok,
         %{value: to_number(Map.fetch!(Inventory.on_hand_by_product([product_id]), product_id))}}

      ingredient_id ->
        {:ok, %{value: to_number(Inventory.on_hand_for_ingredient(ingredient_id))}}

      true ->
        {:error, :validation_error, "product_id or ingredient_id is required"}
    end
  end

  defp to_number(%Decimal{} = d), do: Decimal.to_float(d)
end
