defmodule RockcutApi.Yeast.HarvestProduct do
  @moduledoc "D64 §4.5: one of a record's strains (a yeast product)."
  use Ecto.Schema

  schema "yeast_harvest_products" do
    belongs_to :harvest, RockcutApi.Yeast.Harvest
    belongs_to :product, RockcutApi.Ingredients.Product
  end
end
