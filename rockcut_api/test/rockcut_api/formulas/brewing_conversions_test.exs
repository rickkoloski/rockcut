defmodule RockcutApi.Formulas.Functions.BrewingConversionsTest do
  use ExUnit.Case, async: true

  alias RockcutApi.Formulas.Functions.BrewingConversions

  # ── Extract Conversions ──────────────────────────────────────────────

  describe "convert_extract/3" do
    test "from CGAI — 2-row malt (CGAI ~80%) produces expected values" do
      result = BrewingConversions.convert_extract(:cgai, 80.5, 0.04)

      assert result.cgai == 80.5
      # FGDB = 80.5 * 1.04 = 83.72
      assert result.fgdb == 83.72
      # PPG = 80.5 * 46 = 3703 / 100 = 37.03
      assert result.ppg == 37.03
      # L°/kg = 37.03 * 8.345 ≈ 308.9
      assert_in_delta result.l_deg_kg, 308.9, 0.2
    end

    test "from FGDB — round-trip back to CGAI" do
      original_cgai = 80.5
      moisture = 0.04

      fgdb = BrewingConversions.cgai_to_fgdb(original_cgai, moisture)
      result = BrewingConversions.convert_extract(:fgdb, fgdb, moisture)

      assert_in_delta result.cgai, original_cgai, 0.01
    end

    test "from PPG — round-trip back to CGAI" do
      original_cgai = 80.5

      ppg = BrewingConversions.cgai_to_ppg(original_cgai)
      result = BrewingConversions.convert_extract(:ppg, ppg, 0.04)

      assert_in_delta result.cgai, original_cgai, 0.01
    end

    test "from L°/kg — round-trip back to CGAI" do
      original_cgai = 80.5

      ppg = BrewingConversions.cgai_to_ppg(original_cgai)
      l_deg_kg = BrewingConversions.ppg_to_l_deg_kg(ppg)
      result = BrewingConversions.convert_extract(:l_deg_kg, l_deg_kg, 0.04)

      assert_in_delta result.cgai, original_cgai, 0.01
    end

    test "zero moisture — FGDB equals CGAI" do
      result = BrewingConversions.convert_extract(:cgai, 80.0, 0.0)

      assert result.cgai == 80.0
      assert result.fgdb == 80.0
    end

    test "high moisture (8%) — FGDB is notably higher than CGAI" do
      result = BrewingConversions.convert_extract(:cgai, 80.0, 0.08)

      assert result.fgdb == 86.4
      assert result.fgdb > result.cgai
    end

    test "default moisture is 0.04" do
      result = BrewingConversions.convert_extract(:cgai, 80.0)

      assert result.fgdb == Float.round(80.0 * 1.04, 2)
    end
  end

  describe "individual extract functions" do
    test "cgai_to_fgdb/2" do
      assert_in_delta BrewingConversions.cgai_to_fgdb(80.0, 0.04), 83.2, 0.01
    end

    test "fgdb_to_cgai/2" do
      assert_in_delta BrewingConversions.fgdb_to_cgai(83.2, 0.04), 80.0, 0.01
    end

    test "cgai_to_ppg/1 — 80.43% CGAI gives ~37 PPG" do
      assert_in_delta BrewingConversions.cgai_to_ppg(80.43), 37.0, 0.1
    end

    test "ppg_to_cgai/1 — 37 PPG gives ~80.43% CGAI" do
      assert_in_delta BrewingConversions.ppg_to_cgai(37.0), 80.43, 0.1
    end

    test "ppg_to_l_deg_kg/1" do
      assert_in_delta BrewingConversions.ppg_to_l_deg_kg(37.0), 308.8, 0.2
    end

    test "l_deg_kg_to_ppg/1" do
      assert_in_delta BrewingConversions.l_deg_kg_to_ppg(308.8), 37.0, 0.1
    end

    test "round-trip cgai -> fgdb -> cgai" do
      original = 75.5
      moisture = 0.06

      result =
        original
        |> BrewingConversions.cgai_to_fgdb(moisture)
        |> BrewingConversions.fgdb_to_cgai(moisture)

      assert_in_delta result, original, 0.001
    end

    test "round-trip cgai -> ppg -> cgai" do
      original = 80.0

      result =
        original
        |> BrewingConversions.cgai_to_ppg()
        |> BrewingConversions.ppg_to_cgai()

      assert_in_delta result, original, 0.001
    end

    test "round-trip ppg -> l_deg_kg -> ppg" do
      original = 37.0

      result =
        original
        |> BrewingConversions.ppg_to_l_deg_kg()
        |> BrewingConversions.l_deg_kg_to_ppg()

      assert_in_delta result, original, 0.001
    end
  end

  # ── Gravity Conversions ─────────────────────────────────────────────

  describe "sg_to_plato/1" do
    test "water (SG 1.000) is ~0 Plato" do
      assert_in_delta BrewingConversions.sg_to_plato(1.000), 0.0, 0.05
    end

    test "typical ale wort (SG 1.050) is ~12.4 Plato" do
      assert_in_delta BrewingConversions.sg_to_plato(1.050), 12.4, 0.2
    end

    test "high gravity (SG 1.100) is ~23.8 Plato" do
      assert_in_delta BrewingConversions.sg_to_plato(1.100), 23.8, 0.3
    end

    test "very low gravity (SG 1.010)" do
      result = BrewingConversions.sg_to_plato(1.010)
      assert result > 0
      assert_in_delta result, 2.56, 0.1
    end
  end

  describe "plato_to_sg/1" do
    test "0 Plato is SG 1.000" do
      assert_in_delta BrewingConversions.plato_to_sg(0.0), 1.000, 0.001
    end

    test "12 Plato is ~1.048" do
      assert_in_delta BrewingConversions.plato_to_sg(12.0), 1.048, 0.002
    end

    test "round-trip SG -> Plato -> SG" do
      original_sg = 1.055

      result =
        original_sg
        |> BrewingConversions.sg_to_plato()
        |> BrewingConversions.plato_to_sg()

      assert_in_delta result, original_sg, 0.001
    end

    test "round-trip Plato -> SG -> Plato" do
      original_plato = 15.0

      result =
        original_plato
        |> BrewingConversions.plato_to_sg()
        |> BrewingConversions.sg_to_plato()

      assert_in_delta result, original_plato, 0.1
    end
  end

  # ── Alcohol Conversions ─────────────────────────────────────────────

  describe "abv_simple/2" do
    test "typical ale: OG 1.050, FG 1.010 = ~5.25% ABV" do
      abv = BrewingConversions.abv_simple(1.050, 1.010)
      assert_in_delta abv, 5.25, 0.01
    end

    test "zero attenuation (OG == FG) = 0 ABV" do
      assert BrewingConversions.abv_simple(1.050, 1.050) == 0.0
    end

    test "high gravity: OG 1.090, FG 1.018 = ~9.45% ABV" do
      abv = BrewingConversions.abv_simple(1.090, 1.018)
      assert_in_delta abv, 9.45, 0.01
    end
  end

  describe "abv_accurate/2" do
    test "typical ale: OG 1.050, FG 1.010 produces a plausible ABV" do
      abv = BrewingConversions.abv_accurate(1.050, 1.010)
      # Should be close to simple method for moderate gravities
      assert_in_delta abv, 5.3, 0.5
    end

    test "higher gravity diverges from simple method" do
      og = 1.090
      fg = 1.018

      simple = BrewingConversions.abv_simple(og, fg)
      accurate = BrewingConversions.abv_accurate(og, fg)

      # Both should be positive
      assert simple > 0
      assert accurate > 0

      # They should differ for high gravity worts
      assert abs(simple - accurate) > 0
    end
  end

  describe "abw_from_abv/1" do
    test "5% ABV converts to ~3.97% ABW" do
      abw = BrewingConversions.abw_from_abv(5.0)
      assert_in_delta abw, 3.97, 0.01
    end

    test "0 ABV = 0 ABW" do
      assert BrewingConversions.abw_from_abv(0.0) == 0.0
    end
  end

  # ── Volume Conversions ──────────────────────────────────────────────

  describe "convert_volume/3" do
    test "1 bbl = 31 gallons" do
      assert_in_delta BrewingConversions.convert_volume(1, :bbl, :gal), 31.0, 0.001
    end

    test "31 gallons = 1 bbl" do
      assert_in_delta BrewingConversions.convert_volume(31, :gal, :bbl), 1.0, 0.001
    end

    test "1 bbl = 117.348 liters" do
      assert_in_delta BrewingConversions.convert_volume(1, :bbl, :L), 117.348, 0.001
    end

    test "1 bbl = 1.17348 hL" do
      assert_in_delta BrewingConversions.convert_volume(1, :bbl, :hL), 1.17348, 0.00001
    end

    test "same unit returns same value" do
      assert_in_delta BrewingConversions.convert_volume(5.0, :gal, :gal), 5.0, 0.001
    end

    test "round-trip bbl -> gal -> bbl" do
      original = 7.0

      result =
        original
        |> BrewingConversions.convert_volume(:bbl, :gal)
        |> BrewingConversions.convert_volume(:gal, :bbl)

      assert_in_delta result, original, 0.001
    end

    test "round-trip gal -> L -> gal" do
      original = 10.0

      result =
        original
        |> BrewingConversions.convert_volume(:gal, :L)
        |> BrewingConversions.convert_volume(:L, :gal)

      assert_in_delta result, original, 0.001
    end

    test "round-trip L -> hL -> L" do
      original = 200.0

      result =
        original
        |> BrewingConversions.convert_volume(:L, :hL)
        |> BrewingConversions.convert_volume(:hL, :L)

      assert_in_delta result, original, 0.001
    end

    test "gallon to liters" do
      # 1 gal = 117.348 / 31 ≈ 3.7854 L
      assert_in_delta BrewingConversions.convert_volume(1, :gal, :L), 3.7854, 0.001
    end

    test "hectoliters to gallons" do
      # 1 hL = 100 L = 100 / 3.7854 ≈ 26.42 gal
      result = BrewingConversions.convert_volume(1, :hL, :gal)
      assert_in_delta result, 26.42, 0.1
    end
  end
end
