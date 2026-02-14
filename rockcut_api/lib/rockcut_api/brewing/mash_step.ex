defmodule RockcutApi.Brewing.MashStep do
  use Ecto.Schema
  import Ecto.Changeset

  schema "mash_steps" do
    field :step_number, :integer
    field :name, :string
    field :temperature, :decimal
    field :duration, :integer
    field :type, :string, default: "infusion"
    field :notes, :string

    belongs_to :recipe, RockcutApi.Brewing.Recipe

    timestamps(type: :utc_datetime)
  end

  @valid_types ~w(infusion decoction direct_heat)

  def changeset(mash_step, attrs) do
    mash_step
    |> cast(attrs, [:recipe_id, :step_number, :name, :temperature, :duration, :type, :notes])
    |> validate_required([:recipe_id, :step_number, :name, :temperature, :duration])
    |> validate_inclusion(:type, @valid_types)
    |> validate_number(:temperature, greater_than: 0)
    |> validate_number(:duration, greater_than: 0)
    |> unique_constraint([:recipe_id, :step_number])
    |> foreign_key_constraint(:recipe_id)
  end
end
