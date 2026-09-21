defmodule RockcutApi.Accounts.Department do
  use Ecto.Schema
  import Ecto.Changeset

  schema "departments" do
    field :name, :string
    field :key, :string
    field :color, :string

    has_many :memberships, RockcutApi.Accounts.Membership

    timestamps(type: :utc_datetime)
  end

  def changeset(department, attrs) do
    department
    |> cast(attrs, [:name, :key, :color])
    |> validate_required([:name, :key])
    |> validate_color()
    |> unique_constraint(:key)
  end

  defp validate_color(changeset) do
    case get_change(changeset, :color) do
      nil ->
        changeset

      _ ->
        validate_format(changeset, :color, ~r/^#[0-9A-Fa-f]{6}$/,
          message: "must be a hex color like #2E6DB4"
        )
    end
  end
end
