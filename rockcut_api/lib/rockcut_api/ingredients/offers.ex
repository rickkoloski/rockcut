defmodule RockcutApi.Ingredients.Offers do
  @moduledoc """
  D60 §3.6: supplier offers and their price history. An offer's supplier
  must hold the supplier role. The current price is the latest effective on
  or before today in Colorado (`Tasks.today/0`); a future-dated price isn't
  current until its day.
  """
  import Ecto.Query

  alias RockcutApi.{Repo, Tasks}

  alias RockcutApi.Ingredients.{
    ContractLine,
    OfferPrice,
    Parties,
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
    with :ok <- supplier(attrs) do
      %SupplierOffer{}
      |> SupplierOffer.changeset(attrs)
      |> Repo.insert()
      |> reload()
    end
  end

  def update(%SupplierOffer{} = offer, attrs) do
    with :ok <- supplier(attrs) do
      offer
      |> SupplierOffer.changeset(attrs)
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

  defp reload({:ok, offer}), do: {:ok, get!(offer.id)}
  defp reload(error), do: error

  defp filter(query, _field, value) when value in [nil, ""], do: query
  defp filter(query, field, value), do: where(query, [o], field(o, ^field) == ^value)
end
