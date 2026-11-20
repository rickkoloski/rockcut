defmodule RockcutApi.Ingredients.Features do
  @moduledoc """
  D60 §3.4: feature types, which categories they apply to, and the values a
  product (its standard) or a lot carries.

  Values are written as a map keyed by feature key. Each entry is a number
  (or a decimal string), a map `%{"value", "entered_value", "entered_unit"}`,
  or nil (remove that value). The rules: the feature must apply to the
  product's or lot's category or its parent, the value lies in the type's
  `min`..`max`, and `entered_unit` is one of the feature's units
  (`Units.entered_units/1`), given only together with `entered_value`. A
  value with more places than the type's `decimals` is refused, as the UI
  refuses it ("Extract % FGDB: Use at most 1 decimal"; D61 lead decisions 1,
  gap 13, in place of D60's rounding). Otherwise the API stores what it's
  sent; the conversions are the UI's. A refusal names the feature
  ("Moisture must be between 0 and 100").
  """
  import Ecto.Query

  alias RockcutApi.Repo
  alias RockcutApi.Brewing.{Ingredient, IngredientCategory, Ranges}

  alias RockcutApi.Ingredients.{
    CategoryFeatureType,
    FeatureType,
    LotFeatureValue,
    ProductFeatureValue,
    Units
  }

  @doc "Every feature type, by id, with the categories it applies to."
  def list_types do
    FeatureType
    |> order_by(:id)
    |> Repo.all()
    |> Repo.preload(
      applicability:
        from(a in CategoryFeatureType,
          join: c in assoc(a, :category),
          order_by: [a.sort_order, a.id],
          preload: [category: c]
        )
    )
  end

  @doc """
  The feature values as a map by feature key, each
  `%{value, entered_value, entered_unit}` (feature types preloaded).
  """
  def values_map(values) when is_list(values) do
    Map.new(values, fn v ->
      {v.feature_type.key,
       %{value: v.value, entered_value: v.entered_value, entered_unit: v.entered_unit}}
    end)
  end

  @doc """
  Validate `features` (as above) for an ingredient (its category decides
  which features apply). `{:ok, [{feature_type, attrs | nil}]}` or
  `{:error, {:invalid, %{features: %{key => [message]}}}}`. Anything but a map
  is refused.
  """
  def validate(nil, _ingredient_id), do: {:ok, []}

  def validate(features, ingredient_id) when is_map(features) do
    types = Map.new(Repo.all(FeatureType), &{&1.key, &1})
    applies = applicable_type_ids(ingredient_id)

    {ok, errors} =
      Enum.reduce(features, {[], %{}}, fn {key, entry}, {ok, errors} ->
        key = to_string(key)

        type = Map.get(types, key)

        case check(type, applies, key, entry) do
          {:ok, type, attrs} ->
            {[{type, attrs} | ok], errors}

          {:error, {:places, places}} ->
            {ok, Map.put(errors, key, ["#{type.label}: #{Ranges.places_message(places)}"])}

          {:error, message} ->
            {ok, Map.put(errors, key, ["#{(type && type.label) || key} #{message}"])}
        end
      end)

    if errors == %{},
      do: {:ok, Enum.reverse(ok)},
      else: {:error, {:invalid, %{features: errors}}}
  end

  def validate(_features, _ingredient_id),
    do: {:error, {:invalid, %{features: ["must be a map by feature key"]}}}

  @doc """
  Write validated values (from `validate/2`) for `{:product, id}` or
  `{:lot, id}`: insert or replace each, delete the nil ones. Run inside the
  caller's transaction.
  """
  def write!(owner, validated) do
    for {type, attrs} <- validated, do: write_one!(owner, type, attrs)
    :ok
  end

  @doc "Copy a product's standard values onto a lot, except the `skip` feature type ids."
  def copy_standard!(product_id, lot_id, skip_type_ids \\ []) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    rows =
      from(v in ProductFeatureValue,
        where: v.product_id == ^product_id and v.feature_type_id not in ^skip_type_ids
      )
      |> Repo.all()
      |> Enum.map(fn v ->
        %{
          lot_id: lot_id,
          feature_type_id: v.feature_type_id,
          value: v.value,
          entered_value: v.entered_value,
          entered_unit: v.entered_unit,
          inserted_at: now,
          updated_at: now
        }
      end)

    Repo.insert_all(LotFeatureValue, rows)
    :ok
  end

  # Feature type ids that apply to the ingredient's category or its parent.
  defp applicable_type_ids(ingredient_id) do
    from(i in Ingredient,
      join: c in IngredientCategory,
      on: c.id == i.category_id,
      join: a in CategoryFeatureType,
      on: a.category_id == c.id or a.category_id == c.parent_id,
      where: i.id == ^ingredient_id,
      select: a.feature_type_id
    )
    |> Repo.all()
    |> MapSet.new()
  end

  defp check(nil, _applies, _key, _entry), do: {:error, "is not a feature"}

  defp check(type, applies, key, entry) do
    cond do
      not MapSet.member?(applies, type.id) ->
        {:error, "doesn't apply to this category"}

      is_nil(entry) ->
        {:ok, type, nil}

      true ->
        with {:ok, attrs} <- entry_attrs(entry),
             :ok <- check_places(type, attrs.value),
             :ok <- check_value(type, attrs.value),
             :ok <- check_entered(key, attrs) do
          {:ok, type, attrs}
        end
    end
  end

  defp entry_attrs(entry) when is_map(entry) do
    entry = Map.new(entry, fn {k, v} -> {to_string(k), v} end)

    with {:ok, value} <- decimal(Map.get(entry, "value"), :required),
         {:ok, entered_value} <- decimal(Map.get(entry, "entered_value"), :optional),
         {:ok, entered_unit} <- unit(Map.get(entry, "entered_unit")) do
      {:ok, %{value: value, entered_value: entered_value, entered_unit: entered_unit}}
    end
  end

  defp entry_attrs(value) do
    with {:ok, value} <- decimal(value, :required),
         do: {:ok, %{value: value, entered_value: nil, entered_unit: nil}}
  end

  defp decimal(v, :required) when v in [nil, ""], do: {:error, "can't be blank"}
  defp decimal(v, :optional) when v in [nil, ""], do: {:ok, nil}

  defp decimal(v, _) when is_binary(v) or is_number(v) do
    case Ecto.Type.cast(:decimal, v) do
      {:ok, d} -> {:ok, d}
      :error -> {:error, "is not a number"}
    end
  end

  defp decimal(_v, _), do: {:error, "is not a number"}

  defp unit(u) when u in [nil, ""], do: {:ok, nil}
  defp unit(u) when is_binary(u), do: {:ok, u}
  defp unit(_), do: {:error, "has an unknown unit"}

  defp check_places(%FeatureType{decimals: places}, value) do
    if Decimal.eq?(Decimal.round(value, places), value),
      do: :ok,
      else: {:error, {:places, places}}
  end

  defp check_value(%FeatureType{min: min, max: max}, value) do
    if (min && Decimal.lt?(value, min)) || (max && Decimal.gt?(value, max)),
      do: {:error, "must be between #{fmt(min)} and #{fmt(max)}"},
      else: :ok
  end

  defp check_entered(_key, %{entered_value: nil, entered_unit: nil}), do: :ok

  defp check_entered(_key, %{entered_value: nil}),
    do: {:error, "has an entered unit but no entered value"}

  defp check_entered(_key, %{entered_unit: nil}),
    do: {:error, "has an entered value but no unit"}

  defp check_entered(key, %{entered_unit: unit}) do
    case Units.entered_units(key) do
      [] ->
        {:error, "is entered in its own unit only"}

      units ->
        if unit in units, do: :ok, else: {:error, "can be entered in #{Enum.join(units, ", ")}"}
    end
  end

  # 1000 → "1,000"; 100.0 → "100"
  defp fmt(nil), do: "any"

  defp fmt(%Decimal{} = d) do
    d
    |> Decimal.normalize()
    |> Decimal.to_string(:normal)
    |> String.reverse()
    |> String.replace(~r/(\d{3})(?=\d)/, "\\1,")
    |> String.reverse()
  end

  defp write_one!({kind, id}, type, nil) do
    {schema, field} = target(kind)

    Repo.delete_all(
      from(v in schema, where: field(v, ^field) == ^id and v.feature_type_id == ^type.id)
    )
  end

  defp write_one!({kind, id}, type, attrs) do
    {schema, field} = target(kind)
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    row =
      Map.merge(attrs, %{feature_type_id: type.id, inserted_at: now, updated_at: now})
      |> Map.put(field, id)

    Repo.insert_all(schema, [row],
      on_conflict: {:replace, [:value, :entered_value, :entered_unit, :updated_at]},
      conflict_target: [field, :feature_type_id]
    )
  end

  defp target(:product), do: {ProductFeatureValue, :product_id}
  defp target(:lot), do: {LotFeatureValue, :lot_id}
end
