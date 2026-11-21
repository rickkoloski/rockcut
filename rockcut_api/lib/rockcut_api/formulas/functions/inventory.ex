defmodule RockcutApi.Formulas.Functions.Inventory do
  @moduledoc """
  Inventory-related formula functions.
  """

  import Ecto.Query, only: [from: 2]

  alias RockcutApi.Repo
  alias RockcutApi.Brewing.Ingredient
  alias RockcutApi.Ingredients.{Inventory, Product, Products}

  @doc """
  On hand (D60 §3.7: the sum of the lots' movements) with its unit (D62
  §3.9): of a product (`product_id`), in the product's unit; or of an
  ingredient over all its lots (`ingredient_id`), when its products share a
  unit (refused when they don't). `%{value, unit}`; 0 when nothing is on
  hand.
  """
  def on_hand(_context, params) do
    product_id = params["product_id"] || params[:product_id]
    ingredient_id = params["ingredient_id"] || params[:ingredient_id]

    cond do
      product_id ->
        case Repo.get(Product, product_id) do
          nil ->
            {:error, :validation_error, "No product #{product_id}"}

          product ->
            on_hand = Map.fetch!(Inventory.on_hand_by_product([product.id]), product.id)
            {:ok, %{value: to_number(on_hand), unit: Products.unit(product)}}
        end

      ingredient_id ->
        case Inventory.on_hand_for_ingredient(ingredient_id) do
          {:ok, sum, unit} ->
            {:ok, %{value: to_number(sum), unit: unit}}

          {:error, :mixed_units} ->
            name = Repo.one(from(i in Ingredient, where: i.id == ^ingredient_id, select: i.name))

            {:error, :validation_error,
             "#{name}'s products are in different units; ask for one product."}
        end

      true ->
        {:error, :validation_error, "product_id or ingredient_id is required"}
    end
  end

  defp to_number(%Decimal{} = d), do: Decimal.to_float(d)
end
