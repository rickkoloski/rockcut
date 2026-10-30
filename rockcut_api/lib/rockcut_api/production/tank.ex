defmodule RockcutApi.Production.Tank do
  @moduledoc """
  D46 §3.2: a tank on the production schedule. `position` is the display
  order of the active tanks; a retired tank (`retired_at`) leaves the
  schedule and the pickers, and batches that used it keep its name.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @kinds ~w(unitank fermenter serving)
  @locations ~w(brewhouse walk_in)
  @max_name 30
  # D52: fits the Gantt's narrow names-only column.
  @max_abbreviation 4

  schema "tanks" do
    field :name, :string
    field :abbreviation, :string
    field :kind, :string, default: "unitank"
    field :capacity_bbl, :decimal
    field :location, :string, default: "brewhouse"
    field :position, :integer, default: 0
    field :notes, :string
    field :retired_at, :utc_datetime

    has_many :outages, RockcutApi.Production.Outage, preload_order: [asc: :starts_on]

    timestamps(type: :utc_datetime)
  end

  def kinds, do: @kinds
  def locations, do: @locations

  @doc "Every field a brewer edits (Add / Edit dialog)."
  def changeset(tank, attrs) do
    tank
    |> cast(attrs, [:name, :abbreviation, :kind, :capacity_bbl, :location, :notes])
    |> update_change(:name, &RockcutApi.Production.normalize_name/1)
    |> update_change(:abbreviation, &blank_to_nil/1)
    |> validate_required([:name], message: "Give the tank a name.")
    |> validate_required([:capacity_bbl], message: "Enter the capacity in bbl.")
    |> validate_required([:kind, :location])
    |> validate_length(:name, max: @max_name)
    |> validate_length(:abbreviation,
      max: @max_abbreviation,
      message: "Use up to #{@max_abbreviation} characters."
    )
    |> validate_length(:notes, max: 2_000)
    |> validate_inclusion(:kind, @kinds)
    |> validate_inclusion(:location, @locations)
    |> validate_number(:capacity_bbl, greater_than: 0, message: "Enter the capacity in bbl.")
    |> validate_number(:capacity_bbl,
      less_than: 10_000,
      message: "Capacity must be under 10,000 bbl."
    )
    |> unique_constraint(:name,
      name: :tanks_lower_name_index,
      message: "A tank with that name already exists."
    )
  end

  defp blank_to_nil(value) do
    case RockcutApi.Production.normalize_name(value) do
      "" -> nil
      v -> v
    end
  end
end
