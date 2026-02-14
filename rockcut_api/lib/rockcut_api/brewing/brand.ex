defmodule RockcutApi.Brewing.Brand do
  use Ecto.Schema
  import Ecto.Changeset

  schema "brands" do
    field :name, :string
    field :style, :string
    field :description, :string
    field :target_abv, :decimal
    field :target_ibu, :decimal
    field :target_srm, :decimal
    field :status, :string, default: "active"

    has_many :recipes, RockcutApi.Brewing.Recipe
    has_many :batches, RockcutApi.Brewing.Batch

    timestamps(type: :utc_datetime)
  end

  @valid_statuses ~w(active seasonal retired)

  def changeset(brand, attrs) do
    brand
    |> cast(attrs, [:name, :style, :description, :target_abv, :target_ibu, :target_srm, :status])
    |> validate_required([:name])
    |> validate_inclusion(:status, @valid_statuses)
    |> unique_constraint(:name)
  end
end
