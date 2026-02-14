defmodule RockcutApi.Brewing.Recipe do
  use Ecto.Schema
  import Ecto.Changeset

  schema "recipes" do
    field :version_major, :integer, default: 1
    field :version_minor, :integer, default: 0
    field :batch_size, :decimal
    field :batch_size_unit, :string, default: "bbls"
    field :boil_time, :integer, default: 60
    field :efficiency_target, :decimal
    field :status, :string, default: "draft"
    field :notes, :string

    belongs_to :brand, RockcutApi.Brewing.Brand
    has_many :recipe_ingredients, RockcutApi.Brewing.RecipeIngredient
    has_many :mash_steps, RockcutApi.Brewing.MashStep
    has_many :process_steps, RockcutApi.Brewing.RecipeProcessStep
    has_one :water_profile, RockcutApi.Brewing.WaterProfile
    has_many :brew_turns, RockcutApi.Brewing.BrewTurn

    timestamps(type: :utc_datetime)
  end

  @valid_statuses ~w(draft active archived)
  @valid_units ~w(bbls gallons liters)

  def changeset(recipe, attrs) do
    recipe
    |> cast(attrs, [
      :brand_id, :version_major, :version_minor, :batch_size, :batch_size_unit,
      :boil_time, :efficiency_target, :status, :notes
    ])
    |> validate_required([:brand_id, :batch_size])
    |> validate_inclusion(:status, @valid_statuses)
    |> validate_inclusion(:batch_size_unit, @valid_units)
    |> validate_number(:batch_size, greater_than: 0)
    |> validate_number(:boil_time, greater_than_or_equal_to: 0)
    |> unique_constraint([:brand_id, :version_major, :version_minor])
    |> foreign_key_constraint(:brand_id)
  end

  def version_string(%__MODULE__{version_major: maj, version_minor: min}) do
    "v#{maj}.#{min}"
  end
end
