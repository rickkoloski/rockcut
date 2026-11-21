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

  D62 §3.4: the category's applicability row says where a feature lives.
  On a product (`validate(features, ingredient_id, :product)`) a `value`
  feature is a standard as above, a `range` one is `%{"low", "high"}` (either
  blank, low ≤ high: "Alpha acid: low is above high"), a `none` one is
  refused. On a lot (`:lot`), a `none` feature is refused; `copy` ones start
  from the product's standard (`copy_standard!/3`), `enter` ones don't, and
  `lot_required` ones must be there (`check_required/3`). A lot value
  outside the product's range is allowed and marked (`put_outside_range/1`).

  D65 §4.4: a feature whose row has `only_form` applies only to products in
  that form (Brix on Liquid sugars); `validate/4` takes the product's form,
  and a value sent for another form is refused ("Brix is only for Liquid
  sugars"); on a sugar product it's "Brix is entered on Liquid sugar lots,
  not on the product" (lead decisions 1, gap 2).
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
      entry = %{value: v.value, entered_value: v.entered_value, entered_unit: v.entered_unit}

      # A product's value may be a range (D62 §3.4); a lot's never is.
      entry =
        case v do
          %ProductFeatureValue{value_high: high} -> Map.put(entry, :value_high, high)
          _ -> entry
        end

      {v.feature_type.key, entry}
    end)
  end

  @doc """
  Validate `features` (as above) for an ingredient's product or lot
  (`target` `:product` or `:lot`; its category decides which features apply
  and how). `{:ok, [{feature_type, attrs | nil}]}` or
  `{:error, {:invalid, %{features: %{key => [message]}}}}`. Anything but a map
  is refused.
  """
  def validate(features, ingredient_id, target, form \\ nil)

  def validate(nil, _ingredient_id, _target, _form), do: {:ok, []}

  def validate(features, ingredient_id, target, form) when is_map(features) do
    types = Map.new(Repo.all(FeatureType), &{&1.key, &1})
    applies = applicability(ingredient_id)

    {ok, errors} =
      Enum.reduce(features, {[], %{}}, fn {key, entry}, {ok, errors} ->
        key = to_string(key)

        type = Map.get(types, key)

        case check(type, applies, target, entry, form) do
          {:ok, type, attrs} ->
            {[{type, attrs} | ok], errors}

          {:error, {:places, places}} ->
            {ok, Map.put(errors, key, ["#{type.label}: #{Ranges.places_message(places)}"])}

          {:error, {:labelled, message}} ->
            {ok, Map.put(errors, key, ["#{type.label}: #{message}"])}

          {:error, message} ->
            {ok, Map.put(errors, key, ["#{(type && type.label) || key} #{message}"])}
        end
      end)

    if errors == %{},
      do: {:ok, Enum.reverse(ok)},
      else: {:error, {:invalid, %{features: errors}}}
  end

  def validate(_features, _ingredient_id, _target, _form),
    do: {:error, {:invalid, %{features: ["must be a map by feature key"]}}}

  @doc """
  D62 §3.4 (A2): the `lot_required` features a lot of the ingredient must
  have, after `validated` (from `validate/3`) is written over the lot's
  `existing` feature keys (none for a new lot). `:ok` or the 422 naming
  each missing one ("Alpha acid can't be blank").
  """
  def check_required(ingredient_id, validated, existing \\ []) do
    given = for {type, attrs} <- validated, attrs != nil, do: type.key
    dropped = for {type, nil} <- validated, do: type.key
    has = MapSet.new((existing -- dropped) ++ given)

    missing =
      from(a in CategoryFeatureType,
        join: t in assoc(a, :feature_type),
        where: a.id in ^Enum.map(Map.values(applicability(ingredient_id)), & &1.id),
        where: a.lot_required,
        order_by: [a.sort_order, a.id],
        select: t
      )
      |> Repo.all()
      |> Enum.reject(&MapSet.member?(has, &1.key))

    if missing == [],
      do: :ok,
      else:
        {:error,
         {:invalid, %{features: Map.new(missing, &{&1.key, ["#{&1.label} can't be blank"]})}}}
  end

  @doc """
  Fill each lot's virtual `outside_range`: the keys of its values outside
  its product's typical range (a `range` feature; either end may be open).
  Two queries for the whole list; the lots' `feature_values` (with types)
  must be loaded.
  """
  def put_outside_range(lots) when is_list(lots) do
    product_ids = lots |> Enum.map(& &1.product_id) |> Enum.reject(&is_nil/1) |> Enum.uniq()

    ranges =
      from(v in ProductFeatureValue,
        join: p in assoc(v, :product),
        join: i in assoc(p, :ingredient),
        join: c in assoc(i, :category),
        join: a in CategoryFeatureType,
        on:
          a.feature_type_id == v.feature_type_id and
            (a.category_id == c.id or a.category_id == c.parent_id),
        where: v.product_id in ^product_ids and a.product_mode == "range",
        select: {{v.product_id, v.feature_type_id}, {v.value, v.value_high}}
      )
      |> Repo.all()
      |> Map.new()

    Enum.map(lots, fn lot ->
      outside =
        for v <- loaded(lot.feature_values),
            outside?(v.value, Map.get(ranges, {lot.product_id, v.feature_type_id})),
            do: v.feature_type.key

      %{lot | outside_range: Enum.sort(outside)}
    end)
  end

  defp outside?(_value, nil), do: false

  defp outside?(value, {low, high}),
    do: (low != nil and Decimal.lt?(value, low)) or (high != nil and Decimal.gt?(value, high))

  defp loaded(%Ecto.Association.NotLoaded{}), do: []
  defp loaded(values), do: values

  @doc """
  Write validated values (from `validate/2`) for `{:product, id}` or
  `{:lot, id}`: insert or replace each, delete the nil ones. Run inside the
  caller's transaction.
  """
  def write!(owner, validated) do
    for {type, attrs} <- validated, do: write_one!(owner, type, attrs)
    :ok
  end

  @doc """
  Copy a product's standard values onto a lot, except the `skip` feature
  type ids: only the features its category copies (`lot_mode` `copy`; a
  hop range is never copied, D62 A2).
  """
  def copy_standard!(product_id, lot_id, skip_type_ids \\ []) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    rows =
      from(v in ProductFeatureValue,
        join: p in assoc(v, :product),
        join: i in assoc(p, :ingredient),
        join: c in assoc(i, :category),
        join: a in CategoryFeatureType,
        on:
          a.feature_type_id == v.feature_type_id and
            (a.category_id == c.id or a.category_id == c.parent_id),
        where:
          v.product_id == ^product_id and v.feature_type_id not in ^skip_type_ids and
            a.lot_mode == "copy" and not is_nil(v.value)
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

  # The applicability rows of the ingredient's category or its parent, by
  # feature type id (the category's own first).
  defp applicability(nil), do: %{}

  defp applicability(ingredient_id) do
    from(i in Ingredient,
      join: c in IngredientCategory,
      on: c.id == i.category_id,
      join: a in CategoryFeatureType,
      on: a.category_id == c.id or a.category_id == c.parent_id,
      where: i.id == ^ingredient_id,
      order_by: [desc: a.category_id == c.id],
      select: a
    )
    |> Repo.all()
    |> Enum.reduce(%{}, fn a, acc -> Map.put_new(acc, a.feature_type_id, a) end)
  end

  @doc """
  D65: one plain value of `type` as typed: `{:ok, decimal}`, `{:ok, nil}`
  for a blank, or `{:error, message}` naming it ("Calcium: Use at most 1
  decimal", "Calcium must be between 0 and 1,000"). Ingredient ions use it.
  """
  def check_scalar(_type, raw) when raw in [nil, ""], do: {:ok, nil}

  def check_scalar(type, raw) do
    with {:ok, value} <- decimal(raw, :required),
         :ok <- check_places(type, value),
         :ok <- check_value(type, value) do
      {:ok, value}
    else
      {:error, {:places, places}} -> {:error, "#{type.label}: #{Ranges.places_message(places)}"}
      {:error, message} -> {:error, "#{type.label} #{message}"}
    end
  end

  defp check(nil, _applies, _target, _entry, _form), do: {:error, "is not a feature"}

  defp check(type, applies, target, entry, form) do
    case Map.get(applies, type.id) do
      nil ->
        {:error, "doesn't apply to this category"}

      # D65 lead decisions 1 (gap 2): Brix on a sugar product, whatever its form, belongs on
      # its lots. `only_form` is only on the Sugars row (Brix on Liquid sugars).
      %{only_form: only, product_mode: "none"}
      when is_binary(only) and target == :product and not is_nil(entry) ->
        {:error, "is entered on #{only} sugar lots, not on the product"}

      # D65: Brix on Liquid sugars only (a value sent for another form; clearing one is fine).
      %{only_form: only} when is_binary(only) and only != form and not is_nil(entry) ->
        {:error, "is only for #{only} sugars"}

      %{product_mode: "none"} when target == :product ->
        {:error, "isn't set on a product"}

      %{lot_mode: "none"} when target == :lot ->
        {:error, "isn't set on a lot"}

      _ when is_nil(entry) ->
        {:ok, type, nil}

      %{product_mode: "range"} when target == :product ->
        check_range(type, entry)

      _ ->
        check_single(type, entry, target)
    end
  end

  defp check_single(type, entry, target) do
    with {:ok, attrs} <- entry_attrs(entry),
         :ok <- check_places(type, attrs.value),
         :ok <- check_value(type, attrs.value),
         :ok <- check_entered(type.key, attrs) do
      # A product's standard replaces a range it may have had.
      attrs = if target == :product, do: Map.put(attrs, :value_high, nil), else: attrs
      {:ok, type, attrs}
    end
  end

  # D62 §3.4: `%{"low", "high"}`, either blank (both blank: no range).
  defp check_range(type, entry) when is_map(entry) do
    entry = Map.new(entry, fn {k, v} -> {to_string(k), v} end)

    with {:ok, low} <- decimal(Map.get(entry, "low"), :optional),
         {:ok, high} <- decimal(Map.get(entry, "high"), :optional),
         :ok <- check_end(type, low),
         :ok <- check_end(type, high) do
      cond do
        is_nil(low) and is_nil(high) ->
          {:ok, type, nil}

        low && high && Decimal.gt?(low, high) ->
          {:error, {:labelled, "low is above high"}}

        true ->
          {:ok, type, %{value: low, value_high: high, entered_value: nil, entered_unit: nil}}
      end
    end
  end

  defp check_range(_type, _entry), do: {:error, "is a range: give low and high"}

  defp check_end(_type, nil), do: :ok

  defp check_end(type, value) do
    with :ok <- check_places(type, value), do: check_value(type, value)
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

    replace = [:value, :entered_value, :entered_unit, :updated_at]
    replace = if kind == :product, do: [:value_high | replace], else: replace

    Repo.insert_all(schema, [row],
      on_conflict: {:replace, replace},
      conflict_target: [field, :feature_type_id]
    )
  end

  defp target(:product), do: {ProductFeatureValue, :product_id}
  defp target(:lot), do: {LotFeatureValue, :lot_id}
end
