defmodule RockcutApi.Ingredients do
  @moduledoc """
  D60: the grain catalog and inventory, on Len Silverston's Universal Data
  Model patterns applied selectively (spec decision 3): parties and their
  roles (`Party`, `PartyRole`), products (`Product`), features with
  their units and the categories they apply to (`FeatureType`,
  `CategoryFeatureType`), standard and per-lot values
  (`ProductFeatureValue`, `LotFeatureValue`), supplier offers and their
  prices (`SupplierOffer`, `OfferPrice`) and inventory movements
  (`Movement`). Grains (`Brewing.Ingredient`), their categories and lots
  (`Brewing.IngredientLot`) stay in `RockcutApi.Brewing`.

  The API is in the submodules: `Parties`, `Products`, `Features`, `Offers`
  and `Inventory` (lots, movements, counts). A rule they refuse is
  `{:error, {:invalid, %{field => [message]}}}`, a 422 like a changeset's.
  """
end
