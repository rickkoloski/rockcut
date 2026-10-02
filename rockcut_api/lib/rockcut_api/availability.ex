defmodule RockcutApi.Availability do
  @moduledoc """
  Employee availability: recurring weekly slots declaring when a user is
  unavailable (or prefers to work). Self-declared — no approval. Visibility
  mirrors D16 time off (owner: all; manager: managed departments' members +
  self; employee: self). D25.
  """
  import Ecto.Query
  alias RockcutApi.Repo
  alias RockcutApi.Authz
  alias RockcutApi.Accounts.User
  alias RockcutApi.Availability.Slot

  @preloads [:user]

  ## Queries

  def get(id) do
    case Repo.get(Slot, id) do
      nil -> nil
      slot -> Repo.preload(slot, @preloads)
    end
  end

  @doc "Slots visible to `user`: own + (managers) their departments' people + (owner) all."
  def list_for(user, filters \\ %{})

  def list_for(%User{} = user, filters) do
    Slot
    |> visible_to(user)
    |> apply_filters(filters)
    |> ordered()
    |> preload(^@preloads)
    |> Repo.all()
  end

  # Own slots plus those of members of departments the user manages.
  defp visible_to(query, %User{} = user) do
    case Authz.scope(user, :availability, :manage) |> Authz.member_ids_in() do
      :all -> query
      member_ids -> where(query, [s], s.user_id == ^user.id or s.user_id in ^member_ids)
    end
  end

  ## Writes

  @doc """
  Create a slot for oneself, or — for a manager/owner — for an employee they
  manage (pass `user_id`); otherwise `:forbidden`.
  """
  def create(attrs, %User{} = actor) do
    attrs = stringify(attrs)

    case resolve_target(actor, attrs["user_id"]) do
      {:error, :forbidden} ->
        {:error, :forbidden}

      {:ok, target_id} ->
        attrs = Map.put(attrs, "user_id", target_id)

        case %Slot{} |> Slot.changeset(attrs) |> Repo.insert() do
          {:ok, slot} -> {:ok, get(slot.id)}
          other -> other
        end
    end
  end

  def delete(%Slot{} = slot, %User{} = actor) do
    if Authz.can?(actor, :delete, slot) do
      Repo.delete(slot)
    else
      {:error, :forbidden}
    end
  end

  # nil / own id → self; a managed employee → their id; otherwise forbidden.
  defp resolve_target(%User{} = actor, raw) do
    case to_user_id(raw) do
      nil ->
        {:ok, actor.id}

      id when id == actor.id ->
        {:ok, actor.id}

      id ->
        if Authz.can?(actor, :manage, {:user_for, id}), do: {:ok, id}, else: {:error, :forbidden}
    end
  end

  defp to_user_id(nil), do: nil
  defp to_user_id(id) when is_integer(id), do: id

  defp to_user_id(id) when is_binary(id) do
    case Integer.parse(id) do
      {n, _} -> n
      :error -> nil
    end
  end

  ## Helpers

  defp ordered(query), do: order_by(query, [s], asc: s.weekday, asc: s.start_time)

  defp apply_filters(query, filters) do
    maybe(query, filters, "user_id", fn q, id -> where(q, [s], s.user_id == ^id) end)
  end

  defp maybe(query, filters, key, fun) do
    case Map.get(filters, key) do
      nil -> query
      "" -> query
      value -> fun.(query, value)
    end
  end

  defp stringify(map), do: Map.new(map, fn {k, v} -> {to_string(k), v} end)
end
