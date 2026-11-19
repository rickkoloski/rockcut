defmodule RockcutApi.Ingredients.Contracts do
  @moduledoc """
  D61 §3.1: malt contracts (Silverston's Agreement). One per supplier per
  calendar year (A1), its lines whole sacks of a maltster product at a price
  per sack (decision 39), sent as a full list on create and update.

  A line with a new or changed price writes a price row on that supplier's
  offer for the product (decision 23): effective Jan 1 of the contract year,
  or today if later (A2), note "Contract <year>". The offer is the
  supplier's one active offer for the product; with several, the line names
  it (`offer_id`). A contract for a year already over writes no price
  (decision 40: the price stays until someone changes it).

  What's on order, received and remaining is computed on read (A5): order
  lines of this supplier and product that aren't off-contract, open ones by
  order date in the year, received ones by received date in the year,
  dollars at the line prices. Going over is shown, not refused (decision
  41). Who may write is `Authz` `:contracts` (the controller).
  """
  import Ecto.Query

  alias RockcutApi.{Repo, Tasks}

  alias RockcutApi.Ingredients.{
    Contract,
    ContractLine,
    OfferPrice,
    Parties,
    Party,
    Product,
    Products,
    PurchaseOrder,
    PurchaseOrderLine,
    SupplierOffer
  }

  @preloads [
    :supplier,
    :created_by,
    lines: {from(l in ContractLine, order_by: l.id), product: [:maltster, :ingredient]}
  ]

  @doc "The contracts for `year` (default this year), by supplier name, figures filled."
  def list(params \\ %{}) do
    year = year(params["year"])

    from(c in Contract,
      join: s in assoc(c, :supplier),
      where: c.year == ^year,
      order_by: [s.name, c.id]
    )
    |> Repo.all()
    |> Repo.preload(@preloads)
    |> put_figures()
  end

  def get!(id), do: Contract |> Repo.get!(id) |> Repo.preload(@preloads) |> put_figures() |> hd()

  def create(attrs, user) do
    write(fn ->
      contract =
        %Contract{}
        |> Contract.changeset(Map.put(attrs, "created_by_id", user.id))
        |> unique_year()
        |> insert_or_rollback()

      put_lines!(contract, attrs["lines"], %{}, user)
      contract.id
    end)
  end

  def update(%Contract{} = contract, attrs, user) do
    write(fn ->
      old = Map.new(Repo.preload(contract, :lines, force: true).lines, &{&1.product_id, &1})

      contract =
        contract
        |> Contract.changeset(Map.drop(attrs, ["created_by_id"]))
        |> unique_year()
        |> update_or_rollback()

      if Map.has_key?(attrs, "lines"), do: put_lines!(contract, attrs["lines"], old, user)
      contract.id
    end)
  end

  @doc "Deletes a contract nothing has been received against in its year (422 otherwise)."
  def delete(%Contract{} = contract) do
    contract = Repo.preload(contract, :lines, force: true)
    figures = figures(contract)

    if Enum.any?(contract.lines, &(figures[&1.product_id].received_sacks > 0)),
      do: refuse("Grain has been received against this contract, so it can't be deleted"),
      else: Repo.delete(contract)
  end

  @doc """
  The year's shortfall (spec §3.1, decision 41): per product with a contract
  line in `year`, contracted and received sacks (summed over its contracts)
  and `short_sacks` = contracted − received, for the products short, most
  short first.
  """
  def shortfall(params) do
    params
    |> list()
    |> Enum.flat_map(fn c -> Enum.map(c.lines, &{&1.product, &1.figures}) end)
    |> Enum.group_by(fn {product, _} -> product.id end)
    |> Enum.map(fn {_id, [{product, _} | _] = rows} ->
      contracted = rows |> Enum.map(fn {_, f} -> f.contracted_sacks end) |> Enum.sum()
      received = rows |> Enum.map(fn {_, f} -> f.received_sacks end) |> Enum.sum()

      %{
        product_id: product.id,
        display_name: Products.display_name(product),
        contracted_sacks: contracted,
        received_sacks: received,
        short_sacks: contracted - received
      }
    end)
    |> Enum.filter(&(&1.short_sacks > 0))
    |> Enum.sort_by(&{-&1.short_sacks, &1.display_name})
  end

  @doc "The contract year from a param: an integer 2000–2100, else this year (Colorado)."
  def year(value) do
    case Integer.parse(to_string(value || "")) do
      {y, ""} when y in 2000..2100 -> y
      _ -> Tasks.today().year
    end
  end

  ## Figures

  # Fill each line's virtual `figures` (decision 38, A5): one query for the
  # order lines of all the contracts' suppliers and products.
  defp put_figures([]), do: []

  defp put_figures(%Contract{} = contract), do: put_figures([contract])

  defp put_figures(contracts) when is_list(contracts) do
    rows = order_rows(contracts)

    Enum.map(contracts, fn c ->
      figures = figures(c, rows)
      %{c | lines: Enum.map(c.lines, &%{&1 | figures: Map.fetch!(figures, &1.product_id)})}
    end)
  end

  defp figures(%Contract{} = contract), do: figures(contract, order_rows([contract]))

  defp figures(%Contract{} = c, rows) do
    Map.new(c.lines, fn line ->
      mine =
        Enum.filter(rows, fn r ->
          r.supplier_id == c.supplier_party_id and r.product_id == line.product_id
        end)

      on_order =
        for r <- mine,
            r.status == "open" and r.ordered_on.year == c.year,
            do: r.sacks_ordered

      received =
        for r <- mine,
            (r.status == "received" and r.received_on) && r.received_on.year == c.year,
            do: r

      received_sacks = received |> Enum.map(&(&1.sacks_received || 0)) |> Enum.sum()

      received_dollars =
        received
        |> Enum.map(&Decimal.mult(&1.price_per_sack, &1.sacks_received || 0))
        |> Enum.reduce(Decimal.new(0), &Decimal.add/2)

      remaining = line.sacks - received_sacks

      {line.product_id,
       %{
         contracted_sacks: line.sacks,
         contracted_dollars: money(Decimal.mult(line.price_per_sack, line.sacks)),
         on_order_sacks: Enum.sum(on_order),
         received_sacks: received_sacks,
         received_dollars: money(received_dollars),
         remaining_sacks: remaining,
         over_by: if(remaining < 0, do: -remaining)
       }}
    end)
  end

  # On-contract order lines of the contracts' suppliers and products, in
  # their years (open by order date, received by received date).
  defp order_rows(contracts) do
    suppliers = contracts |> Enum.map(& &1.supplier_party_id) |> Enum.uniq()
    products = contracts |> Enum.flat_map(& &1.lines) |> Enum.map(& &1.product_id) |> Enum.uniq()
    years = contracts |> Enum.map(& &1.year) |> Enum.uniq()
    first = Date.new!(Enum.min(years, fn -> 2000 end), 1, 1)
    last = Date.new!(Enum.max(years, fn -> 2000 end), 12, 31)

    from(l in PurchaseOrderLine,
      join: o in PurchaseOrder,
      on: o.id == l.order_id,
      join: f in SupplierOffer,
      on: f.id == l.offer_id,
      where:
        o.supplier_party_id in ^suppliers and f.product_id in ^products and
          not o.off_contract and
          ((o.status == "open" and o.ordered_on >= ^first and o.ordered_on <= ^last) or
             (o.status == "received" and o.received_on >= ^first and o.received_on <= ^last)),
      select: %{
        supplier_id: o.supplier_party_id,
        product_id: f.product_id,
        status: o.status,
        ordered_on: o.ordered_on,
        received_on: o.received_on,
        sacks_ordered: l.sacks_ordered,
        sacks_received: l.sacks_received,
        price_per_sack: l.price_per_sack
      }
    )
    |> Repo.all()
  end

  ## Lines

  # The full list of lines replaces the contract's: each product once, each
  # with its supplier's offer; a new or changed price writes a price row.
  defp put_lines!(contract, lines, old, user) do
    lines = lines || []
    unless is_list(lines), do: rollback(%{lines: ["must be a list"]})

    supplier = Repo.get!(Party, contract.supplier_party_id)

    unless Parties.has_role?(supplier.id, "supplier"),
      do: rollback(%{supplier_party_id: ["must be a supplier"]})

    parsed = Enum.map(lines, &line_attrs/1)
    ids = Enum.map(parsed, & &1["product_id"])

    case ids -- Enum.uniq(ids) do
      [] -> :ok
      [dup | _] -> rollback(%{base: ["#{product_name(dup)} is on this contract twice"]})
    end

    from(l in ContractLine,
      where: l.contract_id == ^contract.id and l.product_id not in ^Enum.reject(ids, &is_nil/1)
    )
    |> Repo.delete_all()

    for attrs <- parsed do
      offer = line_offer!(supplier, attrs)
      before = Map.get(old, attrs["product_id"])

      line =
        (before || %ContractLine{})
        |> ContractLine.changeset(Map.put(attrs, "contract_id", contract.id))
        |> Repo.insert_or_update()
        |> case do
          {:ok, line} -> line
          {:error, cs} -> Repo.rollback(cs)
        end

      if is_nil(before) or not Decimal.eq?(before.price_per_sack, line.price_per_sack),
        do: put_price!(offer, line, contract.year, user)
    end
  end

  defp line_attrs(line) when is_map(line) do
    line
    |> Map.new(fn {k, v} -> {to_string(k), v} end)
    |> Map.take(["product_id", "sacks", "price_per_sack", "offer_id"])
    |> Map.update("product_id", nil, &RockcutApi.Ids.parse/1)
  end

  defp line_attrs(_), do: rollback(%{lines: ["each line needs a product, sacks and a price"]})

  # The supplier's active offer for the line's product (decision 23): one,
  # or the one named by `offer_id` when there are several.
  defp line_offer!(supplier, %{"product_id" => product_id} = attrs) do
    offers =
      if product_id,
        do:
          Repo.all(
            from(o in SupplierOffer,
              where:
                o.product_id == ^product_id and o.supplier_party_id == ^supplier.id and o.active,
              order_by: o.id
            )
          ),
        else: []

    named = RockcutApi.Ids.parse(attrs["offer_id"])

    cond do
      is_nil(product_id) ->
        rollback(%{base: ["Pick the product on each line"]})

      offers == [] ->
        rollback(%{base: ["Add a #{supplier.name} offer for #{product_name(product_id)} first"]})

      named ->
        Enum.find(offers, &(&1.id == named)) ||
          rollback(%{
            base: [
              "That offer isn't one of #{supplier.name}'s for #{product_name(product_id)}"
            ]
          })

      length(offers) > 1 ->
        rollback(%{
          base: ["#{supplier.name} has several offers for #{product_name(product_id)}; pick one"]
        })

      true ->
        hd(offers)
    end
  end

  # A2: effective Jan 1 of the year, or today if later; nothing for a year
  # already over (decision 40).
  defp put_price!(offer, line, year, user) do
    today = Tasks.today()

    if year >= today.year do
      effective = Enum.max([Date.new!(year, 1, 1), today], Date)

      %OfferPrice{}
      |> OfferPrice.changeset(%{
        offer_id: offer.id,
        price_per_sack: line.price_per_sack,
        effective_on: effective,
        note: "Contract #{year}",
        entered_by_id: user.id
      })
      |> Repo.insert!()
    end
  end

  defp product_name(nil), do: "a product"

  defp product_name(id) do
    case Repo.get(Product, id) do
      nil -> "that product"
      product -> product |> Repo.preload([:maltster, :ingredient]) |> Products.display_name()
    end
  end

  ## Helpers

  # "BSG already has a 2027 contract" (A1), checked before the unique index.
  defp unique_year(changeset) do
    supplier_id = Ecto.Changeset.get_field(changeset, :supplier_party_id)
    year = Ecto.Changeset.get_field(changeset, :year)
    id = Ecto.Changeset.get_field(changeset, :id)

    taken =
      changeset.valid? and
        Contract
        |> where([c], c.supplier_party_id == ^supplier_id and c.year == ^year)
        |> then(fn q -> if id, do: where(q, [c], c.id != ^id), else: q end)
        |> Repo.exists?()

    if taken do
      name = Repo.get!(Party, supplier_id).name
      Ecto.Changeset.add_error(changeset, :base, "#{name} already has a #{year} contract")
    else
      changeset
    end
  end

  defp write(fun) do
    case Repo.transaction(fun, mode: :immediate) do
      {:ok, id} -> {:ok, get!(id)}
      error -> error
    end
  end

  defp insert_or_rollback(changeset) do
    case Repo.insert(changeset) do
      {:ok, record} -> record
      {:error, cs} -> Repo.rollback(cs)
    end
  end

  defp update_or_rollback(changeset) do
    case Repo.update(changeset) do
      {:ok, record} -> record
      {:error, cs} -> Repo.rollback(cs)
    end
  end

  defp rollback(errors), do: Repo.rollback({:invalid, errors})
  defp refuse(message), do: {:error, {:invalid, %{base: [message]}}}

  defp money(d), do: Decimal.round(d, 2)
end
