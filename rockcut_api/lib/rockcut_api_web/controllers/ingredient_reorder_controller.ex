defmodule RockcutApiWeb.IngredientReorderController do
  @moduledoc "D61 §3.5: the To order list (`/api/ingredient_reorder`). Any Brewery member."
  use RockcutApiWeb, :controller

  alias RockcutApi.Ingredients.Reorder
  import RockcutApiWeb.JSONHelpers, only: [reorder_row: 1]

  def index(conn, _params) do
    json(conn, %{data: Enum.map(Reorder.list(), &reorder_row/1)})
  end
end
