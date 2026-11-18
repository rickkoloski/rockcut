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

  @doc """
  `d` rounded to `places` decimals without trailing zeros ("2.789" → 2.79,
  "2.80" → 2.8, "100" stays 100), as the screens show it.
  """
  def round(%Decimal{} = d, places) do
    text = d |> Decimal.round(places) |> Decimal.to_string(:normal)

    if String.contains?(text, "."),
      do: text |> String.trim_trailing("0") |> String.trim_trailing(".") |> Decimal.new(),
      else: Decimal.new(text)
  end

  @doc """
  The quantity display (`"sacks"` or `"lb"`) `user` has chosen for the
  ingredient screens (§3.9; sacks + lb by default), so a refusal reads in
  the units the dialog shows.
  """
  def quantity_display(%{board_settings: %{"ingredients" => %{"quantity_display" => "lb"}}}),
    do: "lb"

  def quantity_display(_user), do: "sacks"

  @doc """
  `lb` as the screens show it (the UI's `formatQuantity`): "12 sacks 22.5
  lb", "12 sacks", "22.5 lb" (under a sack) in `"sacks"` mode with a sack
  size; "682.5 lb" otherwise. Always positive: the words around it say which
  way it went.
  """
  def format_quantity(%Decimal{} = lb, sack_size, mode) do
    lb = Decimal.abs(lb)

    if mode == "lb" or is_nil(sack_size) or not Decimal.gt?(sack_size, 0) do
      "#{format_lb(lb)} lb"
    else
      cents = lb |> Decimal.mult(100) |> Decimal.round(0) |> Decimal.to_integer()
      sack_cents = sack_size |> Decimal.mult(100) |> Decimal.round(0) |> Decimal.to_integer()
      sacks = div(cents, sack_cents)
      loose = Decimal.div(cents - sacks * sack_cents, 100)

      sack_part =
        "#{thousands(Integer.to_string(sacks))} #{if sacks == 1, do: "sack", else: "sacks"}"

      cond do
        sacks == 0 -> "#{format_lb(loose)} lb"
        Decimal.eq?(loose, 0) -> sack_part
        true -> "#{sack_part} #{format_lb(loose)} lb"
      end
    end
  end

  # 1234.5 → "1,234.5"; at most 2 decimals, no trailing zeros.
  defp format_lb(%Decimal{} = d) do
    [whole | frac] =
      d
      |> Decimal.round(2)
      |> Decimal.normalize()
      |> Decimal.to_string(:normal)
      |> String.split(".")

    Enum.join([thousands(whole) | frac], ".")
  end

  defp thousands(digits),
    do:
      digits |> String.reverse() |> String.replace(~r/(\d{3})(?=\d)/, "\\1,") |> String.reverse()
end
