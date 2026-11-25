defmodule RockcutApi.BrewerySettings.Settings do
  @moduledoc """
  D63 §6.1: the brewery's settings, one row (`id` 1). The defaults are the
  values it starts at (the migration's). Zinc is per bbl of kettle volume
  (the screen shows it per 8 bbl). Only `RockcutApi.BrewerySettings` writes it.

  `@numbers`: each number's name in refusals, limits (inclusive), unit and
  decimal places. `@equations`: the IBU equations.
  """
  use Ecto.Schema
  import Ecto.Changeset
  alias RockcutApi.Brewing.Ranges

  @equations [
    {"rc_2026", "RC 2026"},
    {"tinseth", "Tinseth"},
    {"modified_tinseth", "Modified Tinseth"}
  ]

  @numbers [
    boil_temp_f: {"Boil temperature", "180", "212", "°F", 1},
    ibu_tolerance: {"IBU tolerance", "0", "20", "IBU", 2},
    pellet_factor: {"Pellet factor", "1", "1.5", nil, 2},
    hop_stand_temp_f: {"Hop stand temperature", "100", "212", "°F", 1},
    hop_stand_cooling_min: {"Hop stand cooling", "0", "120", "minutes", 0},
    hop_stand_whirl_min: {"Hop stand whirl", "0", "120", "minutes", 0},
    hop_stand_rest_min: {"Hop stand rest", "0", "120", "minutes", 0},
    whirlpool_whirl_min: {"Whirlpool whirl", "0", "120", "minutes", 0},
    whirlpool_rest_min: {"Whirlpool rest", "0", "120", "minutes", 0},
    evaporation_bbl_per_hr: {"Evaporation", "0", "2", "bbl/hr", 2},
    kettle_loss_bbl: {"Kettle loss", "0", "5", "bbl", 2},
    fermenter_loss_bbl: {"Fermenter loss", "0", "5", "bbl", 2},
    whirlfloc_tablets_per_bbl: {"Whirlfloc", "0", "20", "tablets/bbl", 2},
    clarity_ferm_ml_per_plato_bbl: {"Clarity Ferm", "0", "20", "mL/°P/bbl", 4},
    zinc_g_per_bbl: {"Zinc", "0", "5", "g per bbl", 5},
    pitch_rate: {"Pitch rate", "0.1", "5", "M cells/mL/°P", 2},
    water_ca_ppm: {"Calcium", "0", "2000", "ppm", 2},
    water_mg_ppm: {"Magnesium", "0", "2000", "ppm", 2},
    water_na_ppm: {"Sodium", "0", "2000", "ppm", 2},
    water_co3_ppm: {"Carbonate", "0", "2000", "ppm", 2},
    water_hco3_ppm: {"Bicarbonate", "0", "2000", "ppm", 2},
    water_so4_ppm: {"Sulfate", "0", "2000", "ppm", 2},
    water_cl_ppm: {"Chloride", "0", "2000", "ppm", 2}
  ]

  @starts [
    boil_temp_f: "202",
    ibu_tolerance: "2.0",
    pellet_factor: "1.1",
    hop_stand_temp_f: "170",
    hop_stand_cooling_min: "15",
    hop_stand_whirl_min: "20",
    hop_stand_rest_min: "20",
    whirlpool_whirl_min: "20",
    whirlpool_rest_min: "20",
    evaporation_bbl_per_hr: "0.23",
    kettle_loss_bbl: "0.21",
    fermenter_loss_bbl: "0.5",
    whirlfloc_tablets_per_bbl: "2",
    clarity_ferm_ml_per_plato_bbl: "1.3333",
    zinc_g_per_bbl: "0.09375",
    pitch_rate: "1.5",
    water_ca_ppm: "20",
    water_mg_ppm: "3",
    water_na_ppm: "4",
    water_co3_ppm: "0",
    water_hco3_ppm: "18",
    water_so4_ppm: "2",
    water_cl_ppm: "3"
  ]

  @primary_key {:id, :integer, autogenerate: false}
  schema "brewery_settings" do
    for {field, {_, _, _, _, _}} <- @numbers,
        do: field(field, :decimal, default: Decimal.new(@starts[field]))

    field :ibu_equation_hold, :string, default: "rc_2026"
    field :ibu_equation_print, :string, default: "rc_2026"
    # Not edited in D63: the water's name is the heading.
    field :source_water_name, :string, default: "Estes Summer"
    field :lock_version, :integer, default: 1
    belongs_to :updated_by, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end

  @number_fields Keyword.keys(@numbers)
  @equation_fields [:ibu_equation_hold, :ibu_equation_print]

  def number_fields, do: @number_fields
  def equation_fields, do: @equation_fields

  @doc "The fields in `attrs` (string keys) changed; the others, and unknown ones, left alone."
  def changeset(settings, attrs) do
    changeset = Enum.reduce(@number_fields, change(settings), &put_number(&2, &1, attrs))
    Enum.reduce(@equation_fields, changeset, &put_equation(&2, &1, attrs))
  end

  defp put_number(changeset, field, attrs) do
    {name, min, max, unit, places} = @numbers[field]
    limits = Enum.join(["must be between #{comma(min)} and #{comma(max)}", unit] -- [nil], " ")

    case Map.fetch(attrs, Atom.to_string(field)) do
      :error ->
        changeset

      {:ok, given} ->
        value = number(given)

        cond do
          value == nil or Decimal.lt?(value, min) or Decimal.gt?(value, max) ->
            add_error(changeset, field, "#{name} #{limits}")

          not Decimal.eq?(Decimal.round(value, places), value) ->
            add_error(changeset, field, "#{name} #{limits}. #{Ranges.places_message(places)}")

          true ->
            put_change(changeset, field, value)
        end
    end
  end

  # Plain digits only: no comma, no exponent.
  defp number(given) when is_binary(given) do
    text = String.trim(given)
    if text =~ ~r/\A-?(\d{1,12}(\.\d{0,12})?|\.\d{1,12})\z/, do: cast_number(text)
  end

  defp number(given) when is_integer(given) or is_float(given), do: cast_number(given)
  defp number(_), do: nil

  defp cast_number(given) do
    case Ecto.Type.cast(:decimal, given) do
      {:ok, value} -> value
      _ -> nil
    end
  end

  defp put_equation(changeset, field, attrs) do
    case Map.fetch(attrs, Atom.to_string(field)) do
      :error ->
        changeset

      {:ok, given} ->
        if List.keymember?(@equations, given, 0),
          do: put_change(changeset, field, given),
          else: add_error(changeset, field, "must be #{equation_names()}")
    end
  end

  defp equation_names, do: Enum.map_join(@equations, " or ", &elem(&1, 1))

  defp comma("2000"), do: "2,000"
  defp comma(n), do: n
end
