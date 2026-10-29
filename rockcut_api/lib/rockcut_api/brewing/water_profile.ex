defmodule RockcutApi.Brewing.WaterProfile do
  use Ecto.Schema
  import Ecto.Changeset
  import RockcutApi.Brewing.Ranges

  schema "water_profiles" do
    field :calcium, :decimal
    field :magnesium, :decimal
    field :sodium, :decimal
    field :sulfate, :decimal
    field :chloride, :decimal
    field :bicarbonate, :decimal
    field :ph_target, :decimal
    field :notes, :string

    belongs_to :recipe, RockcutApi.Brewing.Recipe

    timestamps(type: :utc_datetime)
  end

  def changeset(water_profile, attrs) do
    water_profile
    |> cast(attrs, [:recipe_id, :calcium, :magnesium, :sodium, :sulfate, :chloride, :bicarbonate, :ph_target, :notes])
    |> validate_required([:recipe_id])
    |> validate_range(
      [:calcium, :magnesium, :sodium, :sulfate, :chloride, :bicarbonate],
      0,
      2_000
    )
    |> validate_range(:ph_target, 0, 14)
    |> unique_constraint(:recipe_id)
    |> foreign_key_constraint(:recipe_id)
  end
end
