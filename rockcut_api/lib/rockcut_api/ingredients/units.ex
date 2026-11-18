defmodule RockcutApi.Ingredients.Units do
  @moduledoc """
  D60 §3.5: units on the API side. Values are stored in one unit per feature;
  the conversions from other units are the UI's (`src/lib/brewingUnits.ts`),
  which sends the stored value plus `entered_value`/`entered_unit`. Here: the
  units a feature may be entered in, and the PPG constant `est_og` uses.
  """

  # Gravity points of one pound of pure sucrose in one gallon (the same
  # constant as the UI's PPG ↔ FGDB conversion).
  @ppg_of_sucrose 46.214

  # The units a value may have been entered in, per feature key (spec §3.5).
  # A feature that isn't here takes no `entered_unit`.
  @entered_units %{
    "extract_fgdb" => ~w(fgdb as_is ppg),
    "color_lovibond" => ~w(lovibond srm ebc),
    "diastatic_power_lintner" => ~w(lintner wk)
  }

  @doc "PPG (points per pound per gallon) from an extract in % FGDB: FGDB × 46.214 ÷ 100."
  def ppg(nil), do: nil
  def ppg(%Decimal{} = fgdb), do: ppg(Decimal.to_float(fgdb))
  def ppg(fgdb) when is_number(fgdb), do: fgdb * @ppg_of_sucrose / 100

  @doc "The units `feature_key`'s value may be entered in (`[]`: none)."
  def entered_units(feature_key), do: Map.get(@entered_units, feature_key, [])
end
