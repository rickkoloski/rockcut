defmodule RockcutApi.Ingredients do
  @moduledoc """
  D60: the grain catalog and inventory, on Len Silverston's Universal Data
  Model patterns applied selectively (spec decision 3): parties and their
  roles (`Party`, `PartyRole`), maltster products (`Product`), features with
  their units and the categories they apply to (`FeatureType`,
  `CategoryFeatureType`), standard and per-lot values
  (`ProductFeatureValue`, `LotFeatureValue`), supplier offers and their
  prices (`SupplierOffer`, `OfferPrice`) and inventory movements
  (`Movement`). Grains (`Brewing.Ingredient`), their categories and lots
  (`Brewing.IngredientLot`) stay in `RockcutApi.Brewing`.
  """
  alias RockcutApi.Ingredients.{LotFeatureValue, ProductFeatureValue}

  @doc """
  Feature values (preloaded with their feature type) as a map keyed by the
  feature key: `%{"extract_fgdb" => Decimal, ...}`.
  """
  def features_map(values) when is_list(values) do
    Map.new(values, fn %struct{} = v when struct in [LotFeatureValue, ProductFeatureValue] ->
      {v.feature_type.key, v.value}
    end)
  end
end
