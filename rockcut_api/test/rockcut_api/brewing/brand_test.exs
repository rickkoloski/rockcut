defmodule RockcutApi.Brewing.BrandTest do
  # D51 (task 3994): decimal 3.x refuses exponents outside decimal128 when an
  # Ecto :decimal field casts user input (EEF-CVE-2026-32686). decimal 2.x
  # accepted them and could be made to build huge numbers.
  use ExUnit.Case, async: true

  alias RockcutApi.Brewing.Brand

  test "a normal decimal casts" do
    cs = Brand.changeset(%Brand{}, %{"name" => "Pale", "target_abv" => "5.25"})
    assert cs.valid?
    assert Decimal.equal?(Ecto.Changeset.get_change(cs, :target_abv), Decimal.new("5.25"))
  end

  test "an out-of-range exponent is a field error, not a crash" do
    for value <- ["1e9999", "1e999999999", "-1e-9999"] do
      cs = Brand.changeset(%Brand{}, %{"name" => "Pale", "target_abv" => value})
      refute cs.valid?
      assert {"is invalid", _} = cs.errors[:target_abv]
    end
  end
end
