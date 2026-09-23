defmodule RockcutApi.Scheduling.Position do
  use Ecto.Schema
  import Ecto.Changeset

  schema "positions" do
    field :name, :string
    field :group, :string
    field :active, :boolean, default: true
    # HSL lightness (0..1) of the department hue for this position; nil = auto.
    field :color_shade, :float

    belongs_to :department, RockcutApi.Accounts.Department

    timestamps(type: :utc_datetime)
  end

  def changeset(position, attrs) do
    position
    |> cast(attrs, [:name, :group, :active, :department_id, :color_shade])
    |> validate_required([:name, :department_id])
    |> validate_number(:color_shade, greater_than_or_equal_to: 0.0, less_than_or_equal_to: 1.0)
    |> update_change(:name, &String.trim/1)
    |> unique_constraint(:name)
    |> foreign_key_constraint(:department_id)
  end
end
