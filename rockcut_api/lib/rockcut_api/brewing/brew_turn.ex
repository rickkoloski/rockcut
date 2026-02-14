defmodule RockcutApi.Brewing.BrewTurn do
  use Ecto.Schema
  import Ecto.Changeset

  schema "brew_turns" do
    field :turn_number, :integer
    field :brew_date, :date

    # Per-turn actuals
    field :actual_og, :decimal
    field :actual_volume, :decimal
    field :actual_efficiency, :decimal

    field :notes, :string

    belongs_to :batch, RockcutApi.Brewing.Batch
    belongs_to :recipe, RockcutApi.Brewing.Recipe

    timestamps(type: :utc_datetime)
  end

  def changeset(brew_turn, attrs) do
    brew_turn
    |> cast(attrs, [:batch_id, :recipe_id, :turn_number, :brew_date, :actual_og, :actual_volume, :actual_efficiency, :notes])
    |> validate_required([:batch_id, :recipe_id, :turn_number])
    |> validate_number(:turn_number, greater_than: 0)
    |> unique_constraint([:batch_id, :turn_number])
    |> foreign_key_constraint(:batch_id)
    |> foreign_key_constraint(:recipe_id)
  end
end
