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

  def create(attrs, %User{} = requester) do
    attrs = attrs |> stringify() |> Map.put("user_id", requester.id)

    case %Request{} |> Request.create_changeset(attrs) |> Repo.insert() do
      {:ok, req} -> {:ok, get(req.id)}
      other -> other
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

  def cancel(%Request{} = req, %User{} = user) do
    cond do
      req.user_id != user.id -> {:error, :forbidden}
      req.status != "pending" -> {:error, :not_pending}
      true -> req |> Ecto.Changeset.change(status: "cancelled") |> Repo.update()
    end
  end

  ## Authorization

  def can_view?(%User{is_owner: true}, _req), do: true
  def can_view?(%User{} = user, %Request{user_id: uid}) when uid == user.id, do: true
  def can_view?(%User{} = user, %Request{} = req), do: manages_requester_dept?(user, req)

  def can_review?(%User{is_owner: true}, _req), do: true
  def can_review?(%User{id: id}, %Request{user_id: uid}) when id == uid, do: false
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
