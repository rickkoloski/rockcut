defmodule RockcutApi.Production.Phase do
  @moduledoc """
  D46 §3.3: a production phase (Fermentation, Crash, …). `color` is one of
  the palette's 12 tokens; the UI defines each for light and dark.
  """
  use Ecto.Schema
  import Ecto.Changeset

  # The mockup's nine, then three more (lead plan, "Phase colors").
  @colors ~w(brew lag ferm dr crash lager cond carb pack rose apricot slate)
  @max_name 30

  schema "production_phases" do
    field :name, :string
    field :color, :string
    field :position, :integer, default: 0
    field :retired_at, :utc_datetime

    timestamps(type: :utc_datetime)
  end

  def colors, do: @colors

  def changeset(phase, attrs) do
    phase
    |> cast(attrs, [:name, :color])
    |> update_change(:name, &RockcutApi.Production.normalize_name/1)
    |> validate_required([:name], message: "Give the phase a name.")
    |> validate_required([:color], message: "Pick a color.")
    |> validate_length(:name, max: @max_name)
    |> validate_inclusion(:color, @colors, message: "Pick a color from the palette.")
    |> unique_constraint(:name,
      name: :production_phases_lower_name_index,
      message: "A phase with that name already exists."
    )
  end
end
