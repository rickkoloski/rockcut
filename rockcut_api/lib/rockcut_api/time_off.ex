defmodule RockcutApi.TimeOff do
  @moduledoc """
  Time-off requests: an employee requests off (with a type), a manager/owner
  approves or denies. Visibility and review authority derive from D10 roles.
  """
  import Ecto.Query
  alias RockcutApi.Repo
  alias RockcutApi.Authz
  alias RockcutApi.Accounts.{User, Membership}
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

  def list_for(%User{is_owner: true}, filters) do
    Request
    |> apply_filters(filters)
    |> order_by([r], desc: r.starts_at)
    |> preload(^@preloads)
    |> Repo.all()
  end

  def list_for(%User{} = user, filters) do
    member_ids =
      case Authz.managed_department_ids(user) do
        [] ->
          []

        dept_ids ->
          Membership
          |> where([m], m.department_id in ^dept_ids)
          |> select([m], m.user_id)
          |> distinct(true)
          |> Repo.all()
      end

    Request
    |> where([r], r.user_id == ^user.id or r.user_id in ^member_ids)
    |> apply_filters(filters)
    |> order_by([r], desc: r.starts_at)
    |> preload(^@preloads)
    |> Repo.all()
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
      nil -> {:ok, requester.id}
      id when id == requester.id -> {:ok, requester.id}
      id -> if Authz.can_manage_user?(requester, id), do: {:ok, id}, else: {:error, :forbidden}
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
    if can_review?(reviewer, req) do
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
      req.user_id != user.id ->
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

  ## Authorization

  def can_view?(%User{is_owner: true}, _req), do: true
  def can_view?(%User{} = user, %Request{user_id: uid}) when uid == user.id, do: true
  def can_view?(%User{} = user, %Request{} = req), do: manages_requester_dept?(user, req)

  def can_review?(%User{is_owner: true}, _req), do: true
  # Managers/owners may approve/deny their OWN requests (they hold the authority).
  def can_review?(%User{id: id} = user, %Request{user_id: uid}) when id == uid,
    do: Authz.can_manage_any?(user)

  def can_review?(%User{} = user, %Request{} = req), do: manages_requester_dept?(user, req)

  defp manages_requester_dept?(%User{} = user, %Request{user: %{memberships: memberships}})
       when is_list(memberships) do
    Enum.any?(memberships, fn m -> Authz.role_in(user, m.department_id) == :manager end)
  end

  defp manages_requester_dept?(_user, _req), do: false

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
