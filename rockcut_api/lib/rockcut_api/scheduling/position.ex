defmodule RockcutApi.Scheduling.Position do
  use Ecto.Schema
  import Ecto.Changeset

  schema "positions" do
    field :name, :string
    field :group, :string
    field :active, :boolean, default: true

    belongs_to :department, RockcutApi.Accounts.Department

    timestamps(type: :utc_datetime)
  end

  def changeset(position, attrs) do
    position
    |> cast(attrs, [:name, :group, :active, :department_id])
    |> validate_required([:name, :department_id])
    |> update_change(:name, &String.trim/1)
    |> unique_constraint(:name)
    |> foreign_key_constraint(:department_id)
  end
end
