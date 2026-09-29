defmodule RockcutApi.TimeOff do
  @moduledoc """
  Time-off requests: an employee requests off (with a type), a manager/owner
  approves or denies. Visibility and review authority derive from D10 roles.
  """
  import Ecto.Query
  alias RockcutApi.Repo
  alias RockcutApi.Authz
  alias RockcutApi.Accounts.User
  alias RockcutApi.TimeOff.Request

  @preloads [:user, :reviewed_by]

  ## Queries

  def get(id) do
    case Repo.get(Request, id) do
      nil -> nil
      req -> Repo.preload(req, [:reviewed_by, user: :memberships])
    end
  end

  @doc "Requests visible to `user`: own + (managers) their departments' people + (owner) all."
  def list_for(user, filters \\ %{})

  def list_for(%User{} = user, filters) do
    Request
    |> visible_to(user)
    |> apply_filters(filters)
    |> order_by([r], desc: r.starts_at)
    |> preload(^@preloads)
    |> Repo.all()
  end

  # Own requests plus those of members of departments the user manages.
  defp visible_to(query, %User{} = user) do
    case Authz.scope(user, :time_off, :manage) |> Authz.member_ids_in() do
      :all -> query
      member_ids -> where(query, [r], r.user_id == ^user.id or r.user_id in ^member_ids)
    end
  end

  ## Writes

  @doc """
  Create a request. For oneself it is `pending` (normal request flow). A
  manager/owner may pass a `user_id` for an employee they manage; that request
  is created **approved** (they hold review authority), otherwise `:forbidden`.
  """
  def create(attrs, %User{} = requester) do
    attrs = stringify(attrs)

    case resolve_target(requester, attrs["user_id"]) do
      {:error, :forbidden} ->
        {:error, :forbidden}

      {:ok, target_id} ->
        attrs = Map.put(attrs, "user_id", target_id)
        reviewer = if target_id == requester.id, do: nil, else: requester
        insert_request(attrs, reviewer)
    end
  end

  defp insert_request(attrs, reviewer) do
    changeset = Request.create_changeset(%Request{}, attrs)

    changeset =
      if reviewer do
        Ecto.Changeset.change(changeset,
          status: "approved",
          reviewed_by_id: reviewer.id,
          reviewed_at: DateTime.utc_now() |> DateTime.truncate(:second)
        )
      else
        changeset
      end

    case Repo.insert(changeset) do
      {:ok, req} -> {:ok, get(req.id)}
      other -> other
    end
  end

  # nil / own id → self; a managed employee → their id; otherwise forbidden.
  defp resolve_target(%User{} = requester, raw) do
    case to_user_id(raw) do
      nil ->
        {:ok, requester.id}

      id when id == requester.id ->
        {:ok, requester.id}

      id ->
        if Authz.can?(requester, :manage, {:user_for, id}),
          do: {:ok, id},
          else: {:error, :forbidden}
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

  def review(%Request{} = req, %User{} = reviewer, status, note)
      when status in ~w(approved denied) do
    if Authz.can?(reviewer, :review, req) do
      req
      |> Ecto.Changeset.change(%{
        status: status,
        reviewer_note: note,
        reviewed_by_id: reviewer.id,
        reviewed_at: DateTime.utc_now() |> DateTime.truncate(:second)
      })
      |> Repo.update()
      |> case do
        {:ok, updated} -> {:ok, get(updated.id)}
        other -> other
      end
    else
      {:error, :forbidden}
    end
  end

  def review(_req, _reviewer, _status, _note), do: {:error, :invalid_status}

  @doc """
  The requester withdraws their own request. Works while it is `pending` or
  already `approved` (so an approved day off can be given back); a
  denied/cancelled request cannot be re-cancelled.
  """
  def cancel(%Request{} = req, %User{} = user) do
    cond do
      not Authz.can?(user, :cancel, req) ->
        {:error, :forbidden}

      req.status not in ["pending", "approved"] ->
        {:error, :not_cancellable}

      true ->
        case req |> Ecto.Changeset.change(status: "cancelled") |> Repo.update() do
          {:ok, updated} -> {:ok, get(updated.id)}
          other -> other
        end
    end
  end

  ## Helpers

  defp apply_filters(query, filters) do
    query
    |> maybe(filters, "status", fn q, s -> where(q, [r], r.status == ^s) end)
    |> maybe(filters, "from", fn q, d -> where(q, [r], r.ends_at >= ^day_start(d)) end)
    |> maybe(filters, "to", fn q, d -> where(q, [r], r.starts_at <= ^day_end(d)) end)
  end

  defp maybe(query, filters, key, fun) do
    case Map.get(filters, key) do
      nil -> query
      "" -> query
      value -> fun.(query, value)
    end
  end

  defp stringify(map), do: Map.new(map, fn {k, v} -> {to_string(k), v} end)

  defp day_start(date), do: parse_day(date, ~T[00:00:00])
  defp day_end(date), do: parse_day(date, ~T[23:59:59])

  defp parse_day(date, time) do
    case Date.from_iso8601(date) do
      {:ok, d} -> DateTime.new!(d, time, "Etc/UTC")
      _ -> DateTime.utc_now()
    end
  end
end
