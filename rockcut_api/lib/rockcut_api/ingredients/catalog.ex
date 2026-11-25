defmodule RockcutApi.Ingredients.Catalog do
  @moduledoc """
  D62 (plan, Shape): the rules per ingredient category, by the top-level
  category's `key` (`grains`, `hops`, `fruits`, `spices`, `sugars`,
  `consumables`, `yeast`, `future`), never its name, so renaming a category
  in Settings changes nothing. A child category has no key of its own: it
  takes its parent's.

  D65 §4.2: every category but Yeast Strains (D64) and Future Ingredients is
  managed (products, packs, movements). D64 §4.1: Yeast Strains is managed
  too (Dry and Liquid, counted `each` in bricks and pitchables). Other Consumables' children share
  its key; their forms, units and packs are the child's, by name (Water
  Salts, Process Aids; D63 §5.1 renamed it from Finings, which is still
  known), and any other child gets the union (A10).
  """
  import Ecto.Query

  alias RockcutApi.Repo
  alias RockcutApi.Brewing.{Ingredient, IngredientCategory}

  @managed ~w(grains hops fruits spices sugars consumables yeast)

  # D65 §4.2 (A4, A10): forms, units and pack names per category key, and
  # per child of Other Consumables. Units are stored as the screens label
  # them; `each` reads "tablets" on a Tablet product (`unit_label/2`).
  @lists %{
    "fruits" =>
      {["Purée", "Whole", "Juice / concentrate"], ["gal", "lb"], ~w(pail drum case bag box)},
    "spices" => {["Whole", "Ground", "Extract"], ["oz", "fl oz"], ~w(bag jar bottle case)},
    "sugars" => {["Dry", "Liquid"], ["lb", "gal"], ~w(bag sack pail drum jug)},
    # D64 §4.1: whole bricks (Dry) and pitchables (Liquid), stored as `each`.
    "yeast" => {["Dry", "Liquid"], ["each"], ~w(brick pitchable case)}
  }

  # D63 §5.1: Process Aids (with g and mL), by its old name too.
  @process_aids {["Liquid", "Powder", "Tablet"], ["fl oz", "lb", "each", "g", "mL"],
                 ~w(jug bottle bag tub)}

  @consumable_children %{
    "water salts" => {["Powder", "Flake"], ["lb"], ~w(bag pail tub)},
    "process aids" => @process_aids,
    "finings" => @process_aids
  }

  # Sugars: Dry is always lb; Liquid is lb or gal.
  @sugar_units %{"Dry" => ["lb"], "Liquid" => ["lb", "gal"]}

  # D65 §4.2: an offer's pack starts as the unit's usual one. Lead decisions
  # 1 (gap 3): a fl oz product whose category has no jug (Spices) takes a
  # bottle; failing all of them, the category's first pack.
  @default_packs %{
    "lb" => ["bag"],
    "gal" => ["pail"],
    "fl oz" => ["jug", "bottle"],
    "oz" => ["bag"],
    "each" => ["tub"],
    "g" => ["bag"],
    "mL" => ["bottle", "jug"]
  }

  @pack_names ~w(sack box bag pail drum case jar bottle jug tub brick pitchable)

  # D64 §4.1: a yeast offer or lot starts with its form's pack.
  @yeast_packs %{"Dry" => "brick", "Liquid" => "pitchable"}

  # D64 §4.1: a yeast product's `each` reads by its form.
  @yeast_labels %{"Dry" => "bricks", "Liquid" => "pitchables"}

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

  @doc """
  D65 decision 8: grain and hop products need their manufacturer; every
  other may say None. D64 A3: so does yeast (its lab).
  """
  def manufacturer_required?(key) when key in ["grains", "hops", "yeast"], do: true
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

  @doc "D64 §4.1: the pack a yeast offer or lot of `form` starts with (Dry brick, Liquid pitchable); nil for another."
  def yeast_pack(form), do: Map.get(@yeast_packs, form)

  @doc """
  The pack names an offer or lot of a product in `form` may use: D64 §4.1
  a Dry yeast brick or case, a Liquid one pitchable or case; every other
  product its category's (`pack_names/2`).
  """
  def pack_names_for("yeast", _category, form) when is_map_key(@yeast_packs, form),
    do: [Map.fetch!(@yeast_packs, form), "case"]

  def pack_names_for(key, category, _form), do: pack_names(key, category)

  @doc "D65 §4.2: the pack an offer in `unit` starts with (lb → bag, gal → pail, …); nil for another."
  def default_pack(unit), do: @default_packs |> Map.get(unit, []) |> List.first()

  @doc """
  D65 lead decisions 1 (gap 3): the pack a new offer or lot in `unit` starts
  with among `names` (a category's): the unit's usual one when it's there
  ("bottle" for a fl oz spice, which has no jug), else the first name; nil
  with no names.
  """
  def default_pack_in(unit, names) do
    Enum.find(Map.get(@default_packs, unit, []), &(&1 in names)) || List.first(names)
  end

  @doc "The default pack per unit, for the screens."
  def default_packs, do: Map.new(@default_packs, fn {unit, [usual | _]} -> {unit, usual} end)

  @doc """
  D65 §4.1, A9: whether a category takes subcategories. Grains and Other
  Consumables do; Hops, Fruits, Spices & Flavorings and Sugars and Extracts
  don't, nor does a child. D64 §4.1: nor does Yeast Strains.
  """
  def allows_children?(key) when key in ["hops", "fruits", "spices", "sugars", "yeast"],
    do: false

  def allows_children?(_key), do: true

  @doc """
  D65 §4.1: whether a category takes custom fields: Grains, Hops, Fruits,
  Spices & Flavorings and Sugars and Extracts use features instead. D64
  §4.1: so does Yeast Strains.
  """
  def allows_fields?(key) when key in ["grains", "hops", "fruits", "spices", "sugars", "yeast"],
    do: false

  def allows_fields?(_key), do: true

  @doc """
  D65 (salts amendment): whether a category is Other Consumables' Water
  Salts child, the one whose ingredients carry ion values.
  """
  def water_salts?(%IngredientCategory{parent_id: parent, name: name} = category)
      when not is_nil(parent),
      do: key(category) == "consumables" and String.downcase(String.trim(name)) == "water salts"

  def water_salts?(_category), do: false

  @doc """
  The display label of a product's unit: "tablets" for `each` on a Tablet
  product (D65 finings amendment; the stored unit stays `each`), else the
  unit itself. D64 §4.1: with the category `key`, a yeast `each` reads by
  its form, "bricks" (Dry) and "pitchables" (Liquid); a key is needed, since
  a Liquid fining may be `each` too.
  """
  def unit_label(unit, form, key \\ nil)

  def unit_label("each", form, "yeast") when is_map_key(@yeast_labels, form),
    do: Map.fetch!(@yeast_labels, form)

  def unit_label("each", "Tablet", _key), do: "tablets"
  def unit_label(unit, _form, _key), do: unit

  @doc "D64: the count words a refusal or label may use, plural → singular."
  def count_words, do: %{"tablets" => "tablet", "bricks" => "brick", "pitchables" => "pitchable"}

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
      # Per unit, the pack this category's offers start with (gap 3: one it takes).
      default_packs:
        Map.new(@default_packs, fn {unit, _} ->
          {unit, default_pack_in(unit, if(key in @managed, do: pack_names(key, child), else: []))}
        end),
      # D64 §4.1: per form, the pack a yeast offer or lot starts with.
      form_packs: if(key == "yeast", do: @yeast_packs, else: %{}),
      # D64 §4.1: per form, how `each` reads (yeast: bricks, pitchables).
      form_unit_labels: if(key == "yeast", do: @yeast_labels, else: %{}),
      manufacturer_required: manufacturer_required?(key),
      allows_children: is_nil(category.parent_id) and allows_children?(key),
      allows_fields: allows_fields?(key),
      # D65 (salts amendment): its ingredients carry ion values.
      ions: water_salts?(category)
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
