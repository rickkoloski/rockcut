defmodule RockcutApi.IngredientFixtures do
  @moduledoc """
  D60: feature values for lots. The feature types themselves come from the
  `copy_lot_specs_to_features` migration, so every test database has them.
  """
  alias RockcutApi.Repo
  alias RockcutApi.Ingredients.{FeatureType, LotFeatureValue}

  def feature_type!(key), do: Repo.get_by!(FeatureType, key: key)

  @doc "Sets `lot`'s value for each `{feature key, value}`; returns the lot."
  def lot_features!(lot, values) do
    for {key, value} <- values do
      Repo.insert!(%LotFeatureValue{
        lot_id: lot.id,
        feature_type_id: feature_type!(to_string(key)).id,
        value: Decimal.new(value)
      })
    end

    lot
  end
end
