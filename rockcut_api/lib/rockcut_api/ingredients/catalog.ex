defmodule RockcutApi.Ingredients.Catalog do
  @moduledoc """
  D62 (plan, Shape): the rules per ingredient category, by the top-level
  category's `key` (`grains`, `hops`, `fruits`, `spices`, `sugars`,
  `consumables`, `yeast`, `future`), never its name, so renaming a category
  in Settings changes nothing. A child category has no key of its own: it
  takes its parent's.

  D65 §4.2: every category but Yeast Strains (D64) and Future Ingredients is
  managed (products, packs, movements). Other Consumables' children share
  its key; their forms, units and packs are the child's, by name (Water
  Salts, Finings), and any other child gets the union of the two (A10).
  """
  import Ecto.Query

  alias RockcutApi.Repo
  alias RockcutApi.Brewing.{Ingredient, IngredientCategory}

  @managed ~w(grains hops fruits spices sugars consumables)

  # D65 §4.2 (A4, A10): forms, units and pack names per category key, and
  # per child of Other Consumables. Units are stored as the screens label
  # them; `each` reads "tablets" on a Tablet product (`unit_label/2`).
  @lists %{
    "fruits" =>
      {["Purée", "Whole", "Juice / concentrate"], ["gal", "lb"], ~w(pail drum case bag box)},
    "spices" => {["Whole", "Ground", "Extract"], ["oz", "fl oz"], ~w(bag jar bottle case)},
    "sugars" => {["Dry", "Liquid"], ["lb", "gal"], ~w(bag sack pail drum jug)}
  }

  @consumable_children %{
    "water salts" => {["Powder", "Flake"], ["lb"], ~w(bag pail tub)},
    "finings" => {["Liquid", "Powder", "Tablet"], ["fl oz", "lb", "each"], ~w(jug bottle bag tub)}
  }

  # Sugars: Dry is always lb; Liquid is lb or gal.
  @sugar_units %{"Dry" => ["lb"], "Liquid" => ["lb", "gal"]}

  # D65 §4.2: an offer's pack starts as the unit's usual one.
  @default_packs %{
    "lb" => "bag",
    "gal" => "pail",
    "fl oz" => "jug",
    "oz" => "bag",
    "each" => "tub"
  }

  @pack_names ~w(sack box bag pail drum case jar bottle jug tub)

  # D62 §3.6, amendments: a hop product is a variety in one of these forms.
  @hop_forms ["T90 Pellet", "Cryo", "Whole leaf", "Extract"]

  @doc """
  The key of a category (`%IngredientCategory{}` with its parent loaded, or
  an id): its own, else its parent's. nil for a category with neither.
  """
  def key(%IngredientCategory{key: key}) when is_binary(key), do: key

  def key(%IngredientCategory{parent: %IngredientCategory{key: key}}) when is_binary(key),
    do: key

  def key(%IngredientCategory{parent_id: nil}), do: nil
  def key(%IngredientCategory{id: id}), do: key(id)

  def key(id) when is_integer(id) or is_binary(id) do
    from(c in IngredientCategory,
      left_join: p in IngredientCategory,
      on: p.id == c.parent_id,
      where: c.id == ^id,
      select: coalesce(c.key, p.key)
    )
    |> Repo.one()
  end

  def key(_), do: nil

  @doc "The key of an ingredient's category (an ingredient id); nil when unknown."
  def ingredient_key(nil), do: nil

  def ingredient_key(ingredient_id) do
    from(i in Ingredient,
      join: c in IngredientCategory,
      on: c.id == i.category_id,
      left_join: p in IngredientCategory,
      on: p.id == c.parent_id,
      where: i.id == ^ingredient_id,
      select: coalesce(c.key, p.key)
    )
    |> Repo.one()
  end

  @doc "The key of a product's category (a product id); nil when unknown."
  def product_key(nil), do: nil

  def product_key(product_id) do
    from(p in RockcutApi.Ingredients.Product, where: p.id == ^product_id, select: p.ingredient_id)
    |> Repo.one()
    |> ingredient_key()
  end

  @doc "The ids of the categories with these keys and their children."
  def category_ids(keys) when is_list(keys) do
    from(c in IngredientCategory,
      left_join: p in IngredientCategory,
      on: p.id == c.parent_id,
      where: c.key in ^keys or p.key in ^keys,
      select: c.id
    )
    |> Repo.all()
  end

  @doc """
  Whether a category (a key, or anything `key/1` takes) has products, packs
  and movements: every key but `yeast` and `future` (D65 §4.2).
  """
  def managed?(key) when is_binary(key) or is_nil(key), do: key in @managed
  def managed?(category), do: category |> key() |> managed?()

  @doc "D65 decision 8: grain and hop products need their manufacturer; every other may say None."
  def manufacturer_required?(key) when key in ["grains", "hops"], do: true
  def manufacturer_required?(_key), do: false

  @doc """
  The unit a contract line counts in (D62 §3.7): `:packs` for grain (whole
  sacks at $/sack), `:lb` for hops (lb at $/lb, A1), nil (no contracts)
  otherwise (D65 decision 3).
  """
  def contract_unit("grains"), do: :packs
  def contract_unit("hops"), do: :lb
  def contract_unit(_key), do: nil

  @doc """
  The forms a category's products take (§3.6); none for grain, whose form is
  on the offer. Other Consumables: the union of its children's.
  """
  def forms("hops"), do: @hop_forms
  def forms("consumables"), do: union(0)
  def forms(key), do: list(key, 0)

  @doc """
  The forms for a product in `category` (an `%IngredientCategory{}`, or nil
  for the top-level list): a child of Other Consumables has its own.
  """
  def forms(key, category), do: child_list(key, category, 0) || forms(key)

  @doc "The units a category's products may be in: lb for grain and hops."
  def units(key) when key in ["grains", "hops"], do: ["lb"]
  def units("consumables"), do: union(1)
  def units(key), do: list(key, 1)

  @doc "The units for a product in `category`, as `forms/2`."
  def units(key, category), do: child_list(key, category, 1) || units(key)

  @doc """
  The units a product of `form` may be in: Sugars by form (Dry lb; Liquid lb
  or gal), every other category its own (`units/2`).
  """
  def form_units("sugars", _category, form), do: Map.get(@sugar_units, form, units("sugars"))
  def form_units(key, category, _form), do: units(key, category)

  @doc "Every pack name an offer or lot may use."
  def pack_names, do: @pack_names

  @doc """
  The one pack a category's offers and lots come in, `{name, size}`, or nil
  when it's free (decision 6: hops are always 11 lb boxes).
  """
  def fixed_pack("hops"), do: {"box", Decimal.new(11)}
  def fixed_pack(_key), do: nil

  @doc "The pack names a category's offers may use (sack for grain, box for hops; D65 §4.2)."
  def pack_names("grains"), do: ["sack"]
  def pack_names("hops"), do: ["box"]
  def pack_names("consumables"), do: union(2)

  def pack_names(key) do
    case list(key, 2) do
      [] -> @pack_names
      names -> names
    end
  end

  @doc "The pack names for a product in `category`, as `forms/2`."
  def pack_names(key, category), do: child_list(key, category, 2) || pack_names(key)

  @doc "D65 §4.2: the pack an offer in `unit` starts with (lb → bag, gal → pail, …); nil for another."
  def default_pack(unit), do: Map.get(@default_packs, unit)

  @doc "The default pack per unit, for the screens."
  def default_packs, do: @default_packs

  @doc """
  D65 §4.1, A9: whether a category takes subcategories. Grains and Other
  Consumables do; Hops, Fruits, Spices & Flavorings and Sugars and Extracts
  don't, nor does a child. Yeast Strains keeps D60's behavior (it may).
  """
  def allows_children?(key) when key in ["hops", "fruits", "spices", "sugars"], do: false
  def allows_children?(_key), do: true

  @doc """
  D65 §4.1: whether a category takes custom fields: Grains, Hops, Fruits,
  Spices & Flavorings and Sugars and Extracts use features instead.
  """
  def allows_fields?(key) when key in ["grains", "hops", "fruits", "spices", "sugars"], do: false
  def allows_fields?(_key), do: true

  @doc """
  The display label of a product's unit: "tablets" for `each` on a Tablet
  product (D65 finings amendment; the stored unit stays `each`), else the
  unit itself.
  """
  def unit_label("each", "Tablet"), do: "tablets"
  def unit_label(unit, _form), do: unit

  @doc """
  Everything the screens need about a category (with its parent loaded):
  its key, the forms, units (per form, for sugars) and packs its products
  take, and whether it takes a manufacturer, children and fields.
  """
  def describe(%IngredientCategory{} = category) do
    key = key(category)
    child = if category.parent_id, do: category

    forms = if key in @managed, do: forms(key, child), else: []

    %{
      key: key,
      managed: managed?(key),
      forms: forms,
      units: if(key in @managed, do: units(key, child), else: []),
      form_units: Map.new(forms, &{&1, form_units(key, child, &1)}),
      pack_names: if(key in @managed, do: pack_names(key, child), else: []),
      default_packs: @default_packs,
      manufacturer_required: manufacturer_required?(key),
      allows_children: is_nil(category.parent_id) and allows_children?(key),
      allows_fields: allows_fields?(key)
    }
  end

  defp list(key, i) do
    case Map.fetch(@lists, key) do
      {:ok, lists} -> elem(lists, i)
      :error -> []
    end
  end

  # A child of Other Consumables: its own list, the union for one Catalog
  # doesn't know; nil for anything else (the top-level list applies).
  defp child_list("consumables", %IngredientCategory{parent_id: parent, name: name}, i)
       when not is_nil(parent) do
    case Map.fetch(@consumable_children, name |> String.trim() |> String.downcase()) do
      {:ok, lists} -> elem(lists, i)
      :error -> union(i)
    end
  end

  defp child_list(_key, _category, _i), do: nil

  defp union(i) do
    @consumable_children
    |> Enum.sort_by(fn {name, _} -> if name == "water salts", do: 0, else: 1 end)
    |> Enum.flat_map(fn {_, lists} -> elem(lists, i) end)
    |> Enum.uniq()
  end
end
