defmodule RockcutApi.Brewing.Ranges do
  @moduledoc """
  Range checks for brewing numbers (D51, QA G1/G5). A JSON number reaches a
  `:decimal` field through a float, so a typo or a 40-digit value used to save
  rounded; any value outside its field's range is now refused with a message
  that names the range. Like `validate_number/3`, a check runs only when the
  field changes and lets `nil` through.

  Gravity is a specific gravity (SG, 1.0xx), temperatures are °F, water is
  ppm (the D1 data model).
  """
  import Ecto.Changeset

  @gravity_min Decimal.new("0.950")
  @gravity_max Decimal.new("1.200")

  @doc "`min`–`max`, both inclusive, for each of `fields`."
  def validate_range(changeset, fields, min, max) do
    Enum.reduce(List.wrap(fields), changeset, fn field, cs ->
      validate_number(cs, field,
        greater_than_or_equal_to: min,
        less_than_or_equal_to: max,
        message: "must be between #{format(min)} and #{format(max)}"
      )
    end)
  end

  @doc "More than 0 and at most `max`."
  def validate_positive_up_to(changeset, field, max) do
    validate_number(changeset, field,
      greater_than: 0,
      less_than_or_equal_to: max,
      message: "must be more than 0 and at most #{format(max)}"
    )
  end

  @doc "A specific gravity, 0.950–1.200, for each of `fields`."
  def validate_gravity(changeset, fields) do
    Enum.reduce(List.wrap(fields), changeset, fn field, cs ->
      validate_number(cs, field,
        greater_than_or_equal_to: @gravity_min,
        less_than_or_equal_to: @gravity_max,
        message: "must be a specific gravity between 0.950 and 1.200"
      )
    end)
  end

  # 10000 → "10,000"
  defp format(n) when is_integer(n) do
    n
    |> Integer.to_string()
    |> String.reverse()
    |> String.replace(~r/(\d{3})(?=\d)/, "\\1,")
    |> String.reverse()
  end
end
