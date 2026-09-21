defmodule RockcutApi.Scheduling.Position do
  use Ecto.Schema
  import Ecto.Changeset

  schema "positions" do
    field :name, :string
    field :group, :string
    field :active, :boolean, default: true

    timestamps(type: :utc_datetime)
  end

  def changeset(position, attrs) do
    position
    |> cast(attrs, [:name, :group, :active])
    |> validate_required([:name])
    |> update_change(:name, &String.trim/1)
    |> unique_constraint(:name)
  end
end
