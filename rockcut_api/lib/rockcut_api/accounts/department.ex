defmodule RockcutApi.Accounts.Department do
  use Ecto.Schema
  import Ecto.Changeset

  schema "departments" do
    field :name, :string
    field :key, :string

    has_many :memberships, RockcutApi.Accounts.Membership

    timestamps(type: :utc_datetime)
  end

  def changeset(department, attrs) do
    department
    |> cast(attrs, [:name, :key])
    |> validate_required([:name, :key])
    |> unique_constraint(:key)
  end
end
