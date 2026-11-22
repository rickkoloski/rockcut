defmodule RockcutApi.Ingredients.Offers do
  @moduledoc """
  D60 §3.6: supplier offers and their price history. An offer's supplier
  must hold the supplier role. D62 §3.5: a grain offer is in sacks; a hop
  offer is always a box of 11 lb (set when omitted, anything else refused)
  and has no form (lead decisions 1, gap 3).
  The current price is the latest effective on
  or before today in Colorado (`Tasks.today/0`); a future-dated price isn't
  current until its day.
  """
  import Ecto.Query

  alias RockcutApi.{Repo, Tasks}

  alias RockcutApi.Ingredients.{
    Catalog,
    ContractLine,
    OfferPrice,
    Parties,
    Products,
    PurchaseOrderLine,
    SupplierOffer
  }

  @doc "Offers (supplier preloaded, `current_price` filled) by product, then supplier name."
  def list(params \\ %{}) do
    SupplierOffer
    |> filter(:product_id, params["product_id"])
    |> filter(:supplier_party_id, params["supplier_id"])
    |> join(:inner, [o], s in assoc(o, :supplier))
    |> order_by([o, s], [o.product_id, s.name, o.id])
    |> preload([o, s], supplier: s)
    |> Repo.all()
    |> put_current_prices()
  end

  def get!(id),
    do: SupplierOffer |> Repo.get!(id) |> Repo.preload(:supplier) |> put_current_price()

  def create(attrs) do
    key = key(attrs["product_id"])
    category = product_category(attrs["product_id"])

    with :ok <- supplier(attrs),
         {:ok, attrs} <- pack_rules(attrs, key, category),
         {:ok, attrs} <- default_pack(attrs, key, category, attrs["product_id"]),
         :ok <- Products.check_whole(blank(attrs["product_id"]), blank(attrs["pack_size"])),
         {:ok, attrs} <- form_rules(attrs, key) do
      %SupplierOffer{}
      |> SupplierOffer.changeset(attrs, key == "grains")
      |> Repo.insert()
      |> reload()
    end
  end

  def update(%SupplierOffer{} = offer, attrs) do
    key = key(attrs["product_id"] || offer.product_id)
    category = product_category(attrs["product_id"] || offer.product_id)

    with :ok <- supplier(attrs),
         {:ok, attrs} <- pack_rules(attrs, key, category),
         :ok <-
           Products.check_whole(
             attrs["product_id"] || offer.product_id,
             blank(attrs["pack_size"])
           ),
         {:ok, attrs} <- form_rules(attrs, key) do
      offer
      |> SupplierOffer.changeset(attrs, key == "grains")
      |> Repo.update()
      |> reload()
    end
  end

  @doc """
  Deletes an offer and its price history (a lot keeps its supplier and
  pack). D61: refused (422) while an order line uses it or a contract of its
  supplier covers its product; it can be made inactive instead.
  """
  def delete(%SupplierOffer{} = offer) do
    on_order = Repo.exists?(from(l in PurchaseOrderLine, where: l.offer_id == ^offer.id))

    # D65 lead decisions 1 (gap 13): a contract line naming the offer (any supplier) is a restrict key too.
    on_contract = Repo.exists?(from(l in ContractLine, where: l.offer_id == ^offer.id))

    contract_year =
      from(l in ContractLine,
        join: c in assoc(l, :contract),
        where:
          l.product_id == ^offer.product_id and c.supplier_party_id == ^offer.supplier_party_id,
        order_by: [desc: c.year],
        limit: 1,
        select: c.year
      )
      |> Repo.one()

    cond do
      on_order ->
        {:error, {:invalid, %{base: ["This offer is on an order; deactivate it instead"]}}}

      contract_year ->
        {:error,
         {:invalid,
          %{base: ["A #{contract_year} contract covers this offer; deactivate it instead"]}}}

      on_contract ->
        {:error, {:invalid, %{base: ["A contract covers this offer; deactivate it instead"]}}}

      true ->
        Repo.delete(offer)
    end
  end

  @doc "An offer's prices, newest effective first (then newest entered)."
  def list_prices(%SupplierOffer{id: id}) do
    from(p in OfferPrice,
      where: p.offer_id == ^id,
      order_by: [desc: p.effective_on, desc: p.id],
      preload: :entered_by
    )
    |> Repo.all()
  end

  def create_price(%SupplierOffer{id: id}, attrs, user) do
    %OfferPrice{}
    |> OfferPrice.changeset(Map.merge(attrs, %{"offer_id" => id, "entered_by_id" => user.id}))
    |> Repo.insert()
    |> case do
      {:ok, price} -> {:ok, Repo.preload(price, :entered_by)}
      error -> error
    end
  end

  @doc """
  The current price of each offer (`%{offer_id => %OfferPrice{}}`, missing
  when none is current yet), in one query.
  """
  def current_prices(offer_ids, today \\ Tasks.today()) do
    from(p in OfferPrice,
      where: p.offer_id in ^offer_ids and p.effective_on <= ^today,
      order_by: [asc: p.offer_id, desc: p.effective_on, desc: p.id]
    )
    |> Repo.all()
    |> Enum.reduce(%{}, fn p, acc -> Map.put_new(acc, p.offer_id, p) end)
  end

  @doc "Fill each offer's virtual `current_price`."
  def put_current_prices(offers) do
    prices = current_prices(Enum.map(offers, & &1.id))
    Enum.map(offers, &%{&1 | current_price: Map.get(prices, &1.id)})
  end

  defp put_current_price(offer), do: hd(put_current_prices([offer]))

  defp supplier(attrs) do
    case Map.fetch(attrs, "supplier_party_id") do
      {:ok, id} when id not in [nil, ""] ->
        if Parties.has_role?(id, "supplier"),
          do: :ok,
          else: {:error, {:invalid, %{supplier_party_id: ["must be a supplier"]}}}

      _ ->
        :ok
    end
  end

  defp key(product_id), do: product_id |> RockcutApi.Ids.parse() |> Catalog.product_key()

  # D65 Stop 2: the product's ingredient's category (a child of Other
  # Consumables has its own pack names, `Catalog.pack_names/2`); nil when unknown.
  defp product_category(product_id) do
    case RockcutApi.Ids.parse(product_id) do
      id when is_integer(id) ->
        from(p in RockcutApi.Ingredients.Product,
          join: i in assoc(p, :ingredient),
          join: c in assoc(i, :category),
          where: p.id == ^id,
          select: c
        )
        |> Repo.one()

      _ ->
        nil
    end
  end

  # D62 lead decisions 1, gap 3: milled/whole is grain's; any other
  # category's offer has no form (nil), and one sent is refused.
  defp form_rules(attrs, "grains"), do: {:ok, attrs}

  defp form_rules(attrs, _key) do
    if attrs["form"] in [nil, ""],
      do: {:ok, Map.put(attrs, "form", nil)},
      else: {:error, {:invalid, %{form: ["Only grain offers are milled or whole"]}}}
  end

  # The pack the product's category allows (`Catalog.fixed_pack/1`,
  # `Catalog.pack_names/1`).
  defp pack_rules(attrs, key, category) do
    case Catalog.fixed_pack(key) do
      {name, size} ->
        given_name = attrs["pack_name"]
        given_size = attrs["pack_size"]

        if given_name in [nil, "", name] and
             (given_size in [nil, ""] or same_size?(given_size, size)),
           do: {:ok, Map.merge(attrs, %{"pack_name" => name, "pack_size" => size})},
           else: {:error, {:invalid, %{base: ["Hop offers are #{size} lb boxes"]}}}

      nil ->
        names = Catalog.pack_names(key, category)

        if attrs["pack_name"] in [nil, "" | names],
          do: {:ok, attrs},
          else: {:error, {:invalid, %{pack_name: ["must be #{Enum.join(names, " or ")}"]}}}
    end
  end

  # D65 §4.2: a new offer of a D65 product with no pack named starts with
  # its unit's usual pack (lb → bag, gal → pail, fl oz → jug, oz → bag,
  # each → tub), when the category takes it, else the category's first
  # (lead decisions 1, gap 3: a fl oz spice → bottle).
  defp default_pack(attrs, key, category, product_id) do
    with true <- attrs["pack_name"] in [nil, ""],
         true <- key not in ["grains", "hops"],
         name when is_binary(name) <-
           Catalog.default_pack_in(
             Products.unit(blank(product_id)),
             Catalog.pack_names(key, category)
           ) do
      {:ok, Map.put(attrs, "pack_name", name)}
    else
      _ -> {:ok, attrs}
    end
  end

  defp blank(v) when v in [nil, ""], do: nil
  defp blank(v), do: v

  defp same_size?(given, size) do
    case Ecto.Type.cast(:decimal, given) do
      {:ok, d} -> Decimal.eq?(d, size)
      _ -> false
    end
  end

  defp reload({:ok, offer}), do: {:ok, get!(offer.id)}
  defp reload(error), do: error

  defp filter(query, _field, value) when value in [nil, ""], do: query
  defp filter(query, field, value), do: where(query, [o], field(o, ^field) == ^value)
end
