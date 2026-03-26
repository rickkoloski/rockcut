defmodule RockcutApi.Formulas.Functions.BrewingConversions do
  @moduledoc """
  Pure conversion functions for brewing calculations.

  No database access — these are mathematical transformations between
  units and scales commonly used in brewing science.

  Extract conversions use CGAI (Coarse Grind As-Is) as the hub value.
  """

  # ── Extract Conversions ──────────────────────────────────────────────

  @l_deg_kg_per_ppg 8.345

  @doc """
  Convert between extract measurement systems using CGAI as the hub.

  CGAI and FGDB are expressed as percentages (e.g., 80.5 for 80.5%).
  PPG and L°/kg use their standard brewing scales.

  Accepts a source type (:cgai, :fgdb, :ppg, :l_deg_kg), a numeric value,
  and a moisture decimal (e.g., 0.04 for 4%).

  Returns a map with all four values:
    %{cgai: _, fgdb: _, ppg: _, l_deg_kg: _}

  ## Examples

      iex> convert_extract(:cgai, 80.5, 0.04)
      %{cgai: 80.5, fgdb: 83.72, ppg: 37.03, l_deg_kg: 309.0}
  """
  def convert_extract(source_type, value, moisture \\ 0.04)

  def convert_extract(:cgai, cgai_pct, moisture) do
    build_extract_map(cgai_pct, moisture)
  end

  def convert_extract(:fgdb, fgdb_pct, moisture) do
    cgai_pct = fgdb_to_cgai(fgdb_pct, moisture)
    build_extract_map(cgai_pct, moisture)
  end

  def convert_extract(:ppg, ppg, moisture) do
    cgai_pct = ppg_to_cgai(ppg)
    build_extract_map(cgai_pct, moisture)
  end

  def convert_extract(:l_deg_kg, l_deg_kg, moisture) do
    ppg = l_deg_kg_to_ppg(l_deg_kg)
    cgai_pct = ppg_to_cgai(ppg)
    build_extract_map(cgai_pct, moisture)
  end

  defp build_extract_map(cgai_pct, moisture) do
    fgdb_pct = cgai_to_fgdb(cgai_pct, moisture)
    ppg = cgai_to_ppg(cgai_pct)
    l_deg_kg = ppg_to_l_deg_kg(ppg)

    %{
      cgai: round_to(cgai_pct, 2),
      fgdb: round_to(fgdb_pct, 2),
      ppg: round_to(ppg, 2),
      l_deg_kg: round_to(l_deg_kg, 1)
    }
  end

  @doc "FGDB% = CGAI% * (1 + Moisture)"
  def cgai_to_fgdb(cgai_pct, moisture), do: cgai_pct * (1 + moisture)

  @doc "CGAI% = FGDB% / (1 + Moisture)"
  def fgdb_to_cgai(fgdb_pct, moisture), do: fgdb_pct / (1 + moisture)

  @doc "PPG = (CGAI% / 100) * 46"
  def cgai_to_ppg(cgai_pct), do: cgai_pct / 100.0 * 46

  @doc "CGAI% = (PPG / 46) * 100"
  def ppg_to_cgai(ppg), do: ppg / 46 * 100.0

  @doc "L deg/kg = PPG * 8.345"
  def ppg_to_l_deg_kg(ppg), do: ppg * @l_deg_kg_per_ppg

  @doc "PPG = L deg/kg / 8.345"
  def l_deg_kg_to_ppg(l_deg_kg), do: l_deg_kg / @l_deg_kg_per_ppg

  # ── Gravity Conversions ─────────────────────────────────────────────

  @doc """
  Convert specific gravity to degrees Plato.

  Uses the polynomial approximation:
    Plato = -616.868 + 1111.14*SG - 630.272*SG^2 + 135.997*SG^3
  """
  def sg_to_plato(sg) do
    -616.868 + 1111.14 * sg - 630.272 * :math.pow(sg, 2) + 135.997 * :math.pow(sg, 3)
  end

  @doc """
  Convert degrees Plato to specific gravity.

  Uses the approximation:
    SG = 1 + (Plato / (258.6 - (0.8795 * Plato)))
  """
  def plato_to_sg(plato) do
    1.0 + plato / (258.6 - 0.8795 * plato)
  end

  # ── Alcohol Conversions ─────────────────────────────────────────────

  @doc """
  Simple ABV calculation.

    ABV = (OG - FG) * 131.25
  """
  def abv_simple(og, fg) do
    (og - fg) * 131.25
  end

  @doc """
  More accurate ABV calculation (corrected for higher gravities).

    ABV = (76.08 * (OG - FG) / (1.775 - OG)) * (FG / 0.794)
  """
  def abv_accurate(og, fg) do
    76.08 * (og - fg) / (1.775 - og) * (fg / 0.794)
  end

  @doc """
  Convert ABV to ABW (alcohol by weight).

    ABW = ABV * 0.79336
  """
  def abw_from_abv(abv) do
    abv * 0.79336
  end

  # ── Volume Conversions ──────────────────────────────────────────────

  # Conversion factors relative to barrels
  @gallons_per_bbl 31.0
  @liters_per_bbl 117.348
  @hl_per_bbl 1.17348

  @doc """
  Convert a volume between brewing units.

  Supported units: :bbl, :gal, :L, :hL

  ## Examples

      iex> convert_volume(1, :bbl, :gal)
      31.0

      iex> convert_volume(31, :gal, :bbl)
      1.0
  """
  def convert_volume(value, from_unit, to_unit)

  def convert_volume(value, unit, unit), do: value * 1.0

  def convert_volume(value, from_unit, to_unit) do
    # Convert to barrels first, then to target
    bbl = to_bbl(value, from_unit)
    from_bbl(bbl, to_unit)
  end

  defp to_bbl(value, :bbl), do: value * 1.0
  defp to_bbl(value, :gal), do: value / @gallons_per_bbl
  defp to_bbl(value, :L), do: value / @liters_per_bbl
  defp to_bbl(value, :hL), do: value / @hl_per_bbl

  defp from_bbl(bbl, :bbl), do: bbl * 1.0
  defp from_bbl(bbl, :gal), do: bbl * @gallons_per_bbl
  defp from_bbl(bbl, :L), do: bbl * @liters_per_bbl
  defp from_bbl(bbl, :hL), do: bbl * @hl_per_bbl

  # ── Helpers ─────────────────────────────────────────────────────────

  defp round_to(value, decimals) do
    Float.round(value + 0.0, decimals)
  end
end
