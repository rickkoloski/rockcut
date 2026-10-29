defmodule RockcutApi.Brewing.RangesTest do
  # D51 (QA G1/G5): every brewing number has a range; a value outside it is a
  # field error that names the range. One describe per schema: both bounds
  # pass, just below and just above are refused.
  use ExUnit.Case, async: true

  alias RockcutApi.Brewing.{
    Batch,
    BatchLogEntry,
    Brand,
    BrewTurn,
    IngredientLot,
    MashStep,
    Recipe,
    RecipeIngredient,
    RecipeProcessStep,
    WaterProfile
  }

  @sg "must be a specific gravity between 0.950 and 1.200"

  # {schema, field, lowest allowed, highest allowed, below, above, message}
  @cases [
    {Brand, :target_abv, "0", "100", "-0.1", "100.1", "must be between 0 and 100"},
    {Brand, :target_ibu, "0", "300", "-1", "301", "must be between 0 and 300"},
    {Brand, :target_srm, "0", "200", "-1", "201", "must be between 0 and 200"},
    {Batch, :actual_og, "0.950", "1.200", "0.949", "1.201", @sg},
    {Batch, :actual_fg, "0.950", "1.200", "0.949", "1.201", @sg},
    {Batch, :actual_abv, "0", "100", "-5", "1000", "must be between 0 and 100"},
    {Batch, :actual_volume, "0", "10000", "-1", "10000.1", "must be between 0 and 10,000"},
    {Batch, :ferm_temp, "25", "110", "24.9", "110.1", "must be between 25 and 110"},
    {BrewTurn, :actual_og, "0.950", "1.200", "0.9", "1050", @sg},
    {BrewTurn, :actual_volume, "0", "10000", "-1", "10001", "must be between 0 and 10,000"},
    {BrewTurn, :actual_efficiency, "0", "100", "-1", "101", "must be between 0 and 100"},
    {BatchLogEntry, :gravity, "0.950", "1.200", "0.5", "12.5", @sg},
    {BatchLogEntry, :temperature, "20", "220", "19", "221", "must be between 20 and 220"},
    {BatchLogEntry, :ph, "0", "14", "-0.1", "14.1", "must be between 0 and 14"},
    {IngredientLot, :alpha_acid, "0", "100", "-1", "101", "must be between 0 and 100"},
    {IngredientLot, :attenuation, "0", "100", "-1", "101", "must be between 0 and 100"},
    {IngredientLot, :extract_potential_fgdb, "0", "100", "-1", "101",
     "must be between 0 and 100"},
    {IngredientLot, :protein_perc, "0", "100", "-1", "101", "must be between 0 and 100"},
    {IngredientLot, :moisture_perc, "0", "100", "-1", "101", "must be between 0 and 100"},
    {IngredientLot, :color_lovibond, "0", "1000", "-1", "1001", "must be between 0 and 1,000"},
    {IngredientLot, :diastatic_power_linter, "0", "1000", "-1", "1001",
     "must be between 0 and 1,000"},
    {MashStep, :temperature, "32", "212", "31", "213", "must be between 32 and 212"},
    {RecipeProcessStep, :temperature, "20", "212", "19", "213", "must be between 20 and 212"},
    {Recipe, :batch_size, "0.01", "10000", "0", "10000.5",
     "must be more than 0 and at most 10,000"},
    {Recipe, :efficiency_target, "0", "100", "-1", "101", "must be between 0 and 100"},
    {RecipeIngredient, :amount, "0.001", "1000000", "0", "1000001",
     "must be more than 0 and at most 1,000,000"},
    {WaterProfile, :calcium, "0", "2000", "-1", "2001", "must be between 0 and 2,000"},
    {WaterProfile, :magnesium, "0", "2000", "-1", "2001", "must be between 0 and 2,000"},
    {WaterProfile, :sodium, "0", "2000", "-1", "2001", "must be between 0 and 2,000"},
    {WaterProfile, :sulfate, "0", "2000", "-1", "2001", "must be between 0 and 2,000"},
    {WaterProfile, :chloride, "0", "2000", "-1", "2001", "must be between 0 and 2,000"},
    {WaterProfile, :bicarbonate, "0", "2000", "-1", "2001", "must be between 0 and 2,000"},
    {WaterProfile, :ph_target, "0", "14", "-1", "15", "must be between 0 and 14"}
  ]

  defp error(schema, field, value) do
    cs = schema.changeset(struct(schema), %{Atom.to_string(field) => value})

    case cs.errors[field] do
      {msg, _} -> msg
      nil -> nil
    end
  end

  for schema <- @cases |> Enum.map(&elem(&1, 0)) |> Enum.uniq() do
    describe inspect(schema) do
      for {^schema, field, low, high, below, above, message} <- @cases do
        test "#{field}: #{low} and #{high} pass, #{below} and #{above} are refused" do
          schema = unquote(schema)
          field = unquote(field)
          assert error(schema, field, unquote(low)) == nil
          assert error(schema, field, unquote(high)) == nil
          assert error(schema, field, unquote(below)) == unquote(message)
          assert error(schema, field, unquote(above)) == unquote(message)
        end
      end
    end
  end

  test "an empty field is still allowed" do
    assert error(Brand, :target_abv, nil) == nil
    assert error(Batch, :actual_og, nil) == nil
  end

  test "a JSON number cast through a float: 40 digits and 1e308 are refused, -1e-9999 is 0" do
    # Jason decodes these as floats, which is how the UI's numbers arrive.
    assert error(Brand, :target_abv, 1_234_567_890_123_456_789_012_345_678_901_234_567_890.5) ==
             "must be between 0 and 100"

    assert error(Brand, :target_abv, 1.0e308) == "must be between 0 and 100"
    assert error(Brand, :target_abv, -0.0) == nil
  end
end
