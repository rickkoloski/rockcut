defmodule RockcutApi.Brewing.RecipeProcessStep do
  use Ecto.Schema
  import Ecto.Changeset

  schema "recipe_process_steps" do
    field :step_number, :integer
    field :name, :string
    field :day, :integer
    field :temperature, :decimal
    field :duration, :integer
    field :duration_unit, :string, default: "minutes"
    field :notes, :string

    belongs_to :recipe, RockcutApi.Brewing.Recipe

    timestamps(type: :utc_datetime)
  end

  @valid_duration_units ~w(minutes hours days)

  def changeset(step, attrs) do
    step
    |> cast(attrs, [:recipe_id, :step_number, :name, :day, :temperature, :duration, :duration_unit, :notes])
    |> validate_required([:recipe_id, :step_number, :name])
    |> validate_inclusion(:duration_unit, @valid_duration_units)
    |> validate_number(:day, greater_than_or_equal_to: 0)
    |> unique_constraint([:recipe_id, :step_number])
    |> foreign_key_constraint(:recipe_id)
  end
end
