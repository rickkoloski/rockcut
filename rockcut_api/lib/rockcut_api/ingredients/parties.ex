defmodule RockcutApi.Ingredients.Parties do
  @moduledoc """
  D60 §3.2: the companies (parties) and their roles. Roles are sent as a
  list (`roles`) and replace the party's roles; a role the party is using
  (a maltster with products, a supplier with offers or lots, a partner
  brewery on a movement) can't be taken away. A party in use is deactivated,
  not deleted.
  """
  import Ecto.Query

  alias RockcutApi.Repo
  alias RockcutApi.Brewing.IngredientLot

  alias RockcutApi.Ingredients.{
    Contract,
    Movement,
    Party,
    PartyRole,
    Product,
    PurchaseOrder,
    SupplierOffer
  }

  @doc """
  Parties by name, roles preloaded and `delete_blocked` filled; `role`
  narrows to those holding it.
  """
  def list(params \\ %{}) do
    Party
    |> filter_role(params["role"])
    |> order_by([p], p.name)
    |> preload(:roles)
    |> Repo.all()
    |> put_delete_blocked()
  end

  def get!(id), do: Party |> Repo.get!(id) |> Repo.preload(:roles) |> put_delete_blocked()

  @doc "True if the party (an id) holds `role`."
  def has_role?(nil, _role), do: false

  def has_role?(party_id, role) do
    Repo.exists?(from(r in PartyRole, where: [party_id: ^party_id, role: ^role]))
  end

  def create(attrs) do
    with {:ok, roles} <- roles(attrs, :required) do
      Repo.transaction(fn ->
        party =
          %Party{}
          |> Party.changeset(attrs)
          |> Repo.insert()
          |> rollback_on_error()

        put_roles!(party, roles)
        get!(party.id)
      end)
    end
  end

  def update(%Party{} = party, attrs) do
    with {:ok, roles} <- roles(attrs, :optional) do
      Repo.transaction(fn ->
        party =
          party
          |> Party.changeset(attrs)
          |> Repo.update()
          |> rollback_on_error()

        if roles do
          case Enum.find(PartyRole.roles() -- roles, &role_in_use?(party.id, &1)) do
            nil ->
              put_roles!(party, roles)

            role ->
              Repo.rollback({:invalid, %{roles: ["#{role} is in use and can't be removed"]}})
          end
        end

        get!(party.id)
      end)
    end
  end

  @doc """
  Deletes a party nothing refers to; otherwise a 422 with the same sentence
  as its `delete_blocked` (D61 lead, Stop 1 note 1).
  """
  def delete(%Party{} = party) do
    case Map.fetch!(delete_blocked([party.id]), party.id) do
      nil -> Repo.delete(party)
      reason -> {:error, {:invalid, %{base: [reason]}}}
    end
  end

  @doc """
  Fill each party's virtual `delete_blocked` (D61 carry-over 2): why
  `delete/1` would refuse it, or nil.
  """
  def put_delete_blocked(parties) when is_list(parties) do
    blocked = delete_blocked(Enum.map(parties, & &1.id))
    Enum.map(parties, &%{&1 | delete_blocked: Map.fetch!(blocked, &1.id)})
  end

  def put_delete_blocked(%Party{} = party), do: hd(put_delete_blocked([party]))

  @doc """
  Why each of `party_ids` can't be deleted, or nil when it can: what refers
  to it (products it makes; offers, lots, contracts or orders it supplies;
  movements it's the partner on), one query each. `delete/1` refuses with
  the same sentence.
  """
  def delete_blocked(party_ids) do
    uses = [
      {"maltster products",
       from(p in Product, where: p.maltster_party_id in ^party_ids, select: p.maltster_party_id)},
      {"supplier offers",
       from(o in SupplierOffer,
         where: o.supplier_party_id in ^party_ids,
         select: o.supplier_party_id
       )},
      {"lots",
       from(l in IngredientLot,
         where: l.supplier_party_id in ^party_ids,
         select: l.supplier_party_id
       )},
      {"contracts",
       from(c in Contract,
         where: c.supplier_party_id in ^party_ids,
         select: c.supplier_party_id
       )},
      {"orders",
       from(o in PurchaseOrder,
         where: o.supplier_party_id in ^party_ids,
         select: o.supplier_party_id
       )},
      {"trades or loans",
       from(m in Movement, where: m.partner_party_id in ^party_ids, select: m.partner_party_id)}
    ]

    found =
      Enum.map(uses, fn {what, query} ->
        {what, query |> distinct(true) |> Repo.all() |> MapSet.new()}
      end)

    Map.new(party_ids, fn id ->
      case for({what, ids} <- found, MapSet.member?(ids, id), do: what) do
        [] -> {id, nil}
        whats -> {id, "This company has #{join(whats)}; deactivate it instead"}
      end
    end)
  end

  defp join([one]), do: one
  defp join(list), do: Enum.join(Enum.drop(list, -1), ", ") <> " and " <> List.last(list)

  defp filter_role(query, role) when role in [nil, ""], do: query

  defp filter_role(query, role) do
    where(
      query,
      [p],
      p.id in subquery(from(r in PartyRole, where: [role: ^role], select: r.party_id))
    )
  end

  # The `roles` list from the body: each in the closed set, no repeats.
  defp roles(attrs, mode) do
    case Map.get(attrs, "roles", Map.get(attrs, :roles)) do
      nil when mode == :optional ->
        {:ok, nil}

      list when is_list(list) and list != [] ->
        bad = Enum.reject(list, &(&1 in PartyRole.roles()))

        if bad == [],
          do: {:ok, Enum.uniq(list)},
          else: {:error, {:invalid, %{roles: ["must be maltster, supplier or partner_brewery"]}}}

      _ ->
        {:error, {:invalid, %{roles: ["pick at least one role"]}}}
    end
  end

  defp put_roles!(party, roles) do
    Repo.delete_all(from(r in PartyRole, where: r.party_id == ^party.id and r.role not in ^roles))

    for role <- roles do
      %PartyRole{}
      |> PartyRole.changeset(%{party_id: party.id, role: role})
      |> Repo.insert!(on_conflict: :nothing, conflict_target: [:party_id, :role])
    end
  end

  defp role_in_use?(id, "maltster"),
    do: Repo.exists?(from(p in Product, where: p.maltster_party_id == ^id))

  defp role_in_use?(id, "supplier") do
    Repo.exists?(from(o in SupplierOffer, where: o.supplier_party_id == ^id)) or
      Repo.exists?(from(l in IngredientLot, where: l.supplier_party_id == ^id)) or
      Repo.exists?(from(c in Contract, where: c.supplier_party_id == ^id)) or
      Repo.exists?(from(o in PurchaseOrder, where: o.supplier_party_id == ^id))
  end

  defp role_in_use?(id, "partner_brewery"),
    do: Repo.exists?(from(m in Movement, where: m.partner_party_id == ^id))

  defp rollback_on_error({:ok, record}), do: record
  defp rollback_on_error({:error, changeset}), do: Repo.rollback(changeset)
end
