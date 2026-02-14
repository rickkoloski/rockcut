defmodule RockcutApi.Formulas.Functions.Inventory do
  @moduledoc """
  Inventory-related formula functions.
  """

  import Ecto.Query

  alias RockcutApi.Brewing.IngredientLot

  @doc """
  Sum quantity of active lots for a given ingredient.
  Returns the count of active (available) lots since lots don't have a quantity field.
  """
  def on_hand(context, params) do
    ingredient_id = params["ingredient_id"] || params[:ingredient_id]
    repo = context.repo

    count =
      IngredientLot
      |> where(ingredient_id: ^ingredient_id)
      |> where(status: "available")
      |> repo.aggregate(:count)

    {:ok, %{value: count}}
  end
end
