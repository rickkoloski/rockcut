defmodule RockcutApi.Ingredients.Units do
  @moduledoc """
  D60 §3.5: units on the API side. Values are stored in one unit per feature;
  the conversions from other units are the UI's (`src/lib/brewingUnits.ts`),
  which sends the stored value plus `entered_value`/`entered_unit`. Here: the
  units a feature may be entered in, the PPG constant `est_og` uses, and
  (D62 §3.5) quantities in packs and a product's unit as the screens show
  them.
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
  The quantity display (`"packs"` or `"lb"`) `user` has chosen for the
  ingredient screens (D60 §3.9, D62 §3.5; packs + unit by default), so a
  refusal reads in the units the dialog shows. The stored `"lb"` means
  "total in the product's unit" (the toggle says Total).
  """
  def quantity_display(%{board_settings: %{"ingredients" => %{"quantity_display" => "lb"}}}),
    do: "lb"

  def quantity_display(_user), do: "packs"

  @doc """
  `qty` (in `unit`) as the screens show it (the UI's `formatQuantity`), D62
  §3.5: "12 sacks 22.5 lb", "12 sacks", "22.5 lb" (under a pack) in
  `"packs"` mode with a pack size; "682.5 lb" (the total in the unit)
  otherwise. `each` is whole numbers. Always positive: the words around it
  say which way it went.
  """
  def format_quantity(%Decimal{} = qty, pack_name, pack_size, unit, mode) do
    qty = Decimal.abs(qty)
    places = places(unit)

    if mode == "lb" or is_nil(pack_size) or not Decimal.gt?(pack_size, 0) do
      amount(qty, unit, places)
    else
      scale = Integer.pow(10, places)
      units = qty |> Decimal.mult(scale) |> Decimal.round(0) |> Decimal.to_integer()
      pack_units = pack_size |> Decimal.mult(scale) |> Decimal.round(0) |> Decimal.to_integer()
      packs = div(units, pack_units)
      loose = Decimal.div(units - packs * pack_units, scale)
      pack_part = "#{thousands(Integer.to_string(packs))} #{pack_word(pack_name, packs)}"

      cond do
        packs == 0 -> amount(loose, unit, places)
        Decimal.eq?(loose, 0) -> pack_part
        true -> "#{pack_part} #{amount(loose, unit, places)}"
      end
    end
  end

  @doc """
  D65 lead decisions 1 (gap 8): the word for a sum of rows in `unit`: their
  shared label when they all have it ("tablets"), else the unit ("each" for
  Tablet and other `each` products together).
  """
  def shared_label(unit, labels) do
    case Enum.uniq(labels) do
      [label] when is_binary(label) -> label
      _ -> unit
    end
  end

  @doc """
  A pack name for `n` packs: "sack" for 1, else its plural (sack/sacks,
  box/boxes, bag/bags, pail/pails, jug/jugs, bottle/bottles, tub/tubs,
  case/cases, each).
  """
  def pack_word(pack_name, 1), do: pack_name || "pack"
  def pack_word(pack_name, _n), do: plural(pack_name)

  @doc "A pack name's plural (\"box\" → \"boxes\")."
  def plural(nil), do: "packs"
  def plural("each"), do: "each"
  def plural("box"), do: "boxes"
  def plural(name), do: name <> "s"

  # `each` is a count: whole numbers ("tablets" is its label on a Tablet
  # product, D65). Every other unit to 2 decimals.
  defp places(unit) when unit in ["each", "tablets"], do: 0
  defp places(_unit), do: 2

  # Lead decisions 1 (gap 6): exactly 1 is singular, "1 tablet".
  defp amount(qty, unit, places) do
    unit = if unit == "tablets" and Decimal.eq?(qty, 1), do: "tablet", else: unit || "lb"
    "#{format_number(qty, places)} #{unit}"
  end

  # 1234.5 → "1,234.5"; at most `places` decimals, no trailing zeros.
  defp format_number(%Decimal{} = d, places) do
    [whole | frac] =
      d
      |> Decimal.round(places)
      |> Decimal.normalize()
      |> Decimal.to_string(:normal)
      |> String.split(".")

    Enum.join([thousands(whole) | frac], ".")
  end

  defp thousands(digits),
    do:
      digits |> String.reverse() |> String.replace(~r/(\d{3})(?=\d)/, "\\1,") |> String.reverse()
end
