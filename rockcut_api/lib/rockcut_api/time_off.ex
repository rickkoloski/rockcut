defmodule RockcutApi.TimeOff do
  @moduledoc """
  Time-off requests: an employee requests off (with a type), a manager/owner
  approves or denies. Visibility and review authority derive from D10 roles.
  """
  import Ecto.Query
  require Logger
  alias RockcutApi.{Authz, Notifications, Repo}
  alias RockcutApi.Accounts.User
  alias RockcutApi.Scheduling.Recurrence
  alias RockcutApi.TimeOff.Request

  @preloads [:user, :reviewed_by]

  ## Queries

  def get(id) do
    case Repo.get(Request, id) do
      nil -> nil
      req -> Repo.preload(req, [:reviewed_by, user: :memberships])
    end
  end

  @doc """
  Requests visible to `user`: own + (managers) their departments' people +
  (owner) all. Filters: `status`, `from`/`to` (UTC days), and `when` —
  `"current"` or `"past"` (D44 §2.4; `when_values/0`), newest first either way.
  """
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

  @doc """
  Pending, not past requests `user` sees in `list_for/2` (D44 §2.6): their own
  plus those they manage, each once. The `/api/me` time off badge.
  """
  def pending_count(%User{} = user) do
    Request
    |> visible_to(user)
    |> where([r], r.status == "pending")
    |> current()
    |> Repo.aggregate(:count)
  end

  ## Past (D44 §2.4)

  @when_values ~w(current past)

  @doc "The accepted `when` filter values."
  def when_values, do: @when_values

  @doc """
  A request is past when the Colorado day of its `ends_at` is before today
  (Colorado): time off ending today stays current until tomorrow. All-day
  requests end at 23:59 Colorado time on their last day.
  """
  def past?(%Request{ends_at: ends_at}), do: DateTime.compare(ends_at, today_start()) == :lt

  # Colorado midnight at the start of today, in UTC.
  defp today_start do
    {today, _time} = Recurrence.to_local(DateTime.utc_now())
    Recurrence.local_midnight(today)
  end

  defp current(query) do
    start = today_start()
    where(query, [r], r.ends_at >= ^start)
  end

  defp past(query) do
    start = today_start()
    where(query, [r], r.ends_at < ^start)
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

        with {:ok, req} <- insert_request(attrs, reviewer) do
          # An on-behalf request is created approved: nothing to review (§2.5).
          if is_nil(reviewer), do: notify_reviewers(req)
          {:ok, req}
        end
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

  @doc """
  Approve or deny (including denying an approved request: Remove). A past
  request can't be reviewed (D44 §2.4). The requester is told the decision
  unless they made it (§2.7).
  """
  def review(%Request{} = req, %User{} = reviewer, status, note)
      when status in ~w(approved denied) do
    cond do
      not Authz.can?(reviewer, :review, req) ->
        {:error, :forbidden}

      past?(req) ->
        {:error, :past}

      true ->
        req
        |> Ecto.Changeset.change(%{
          status: status,
          reviewer_note: note,
          reviewed_by_id: reviewer.id,
          reviewed_at: DateTime.utc_now() |> DateTime.truncate(:second)
        })
        |> Repo.update()
        |> case do
          {:ok, updated} ->
            updated = get(updated.id)
            if updated.user_id != reviewer.id, do: notify_requester(updated)
            {:ok, updated}

          other ->
            other
        end
    end
  end

  def review(_req, _reviewer, _status, _note), do: {:error, :invalid_status}

  @doc """
  The requester withdraws their own request. Works while it is `pending` or
  already `approved` (so an approved day off can be given back); a
  denied/cancelled or past (D44 §2.4) request cannot be cancelled.
  """
  def cancel(%Request{} = req, %User{} = user) do
    cond do
      not Authz.can?(user, :cancel, req) ->
        {:error, :forbidden}

      past?(req) ->
        {:error, :past}

      req.status not in ["pending", "approved"] ->
        {:error, :not_cancellable}

      true ->
        case req |> Ecto.Changeset.change(status: "cancelled") |> Repo.update() do
          {:ok, updated} -> {:ok, get(updated.id)}
          other -> other
        end
    end
  end

  ## Notifications (D44 §2.5, §2.7)

  @doc """
  Everyone who could review `req` except its requester: active people for
  whom `Authz.can?(_, :review, req)` holds (owners, managers of the
  requester's departments), each once. `req` needs `user.memberships`.
  """
  def reviewers(%Request{user: %User{memberships: memberships}} = req) do
    memberships
    |> Enum.map(& &1.department_id)
    |> Authz.time_off_reviewers_query()
    |> Repo.all()
    |> Repo.preload(memberships: :department)
    |> Enum.filter(&(&1.id != req.user_id and Authz.can?(&1, :review, req)))
  end

  # Best-effort: a failed notification never fails the request.
  defp notify_reviewers(%Request{} = req) do
    name = person_name(req.user)

    payload = %{
      title: "#{name} requested time off",
      body: join_lines([details(req), req.note]),
      data: %{"url" => "/time_off"}
    }

    req |> reviewers() |> Enum.each(&safe_notify(&1, :time_off_requested, payload))
  rescue
    e -> Logger.error("time off notify failed: #{inspect(e)}")
  end

  defp notify_requester(%Request{} = req) do
    payload = %{
      title: "Your time off was #{req.status}",
      body:
        join_lines([
          details(req),
          "#{String.capitalize(req.status)} by #{person_name(req.reviewed_by)}",
          req.reviewer_note
        ]),
      data: %{"url" => "/time_off"}
    }

    safe_notify(req.user, :time_off_reviewed, payload)
  end

  defp safe_notify(%User{} = user, event, payload) do
    Notifications.notify(user, event, payload)
  rescue
    e -> Logger.error("time off notify failed: #{inspect(e)}")
  end

  defp person_name(%User{name: name, email: email}), do: name || email
  defp person_name(_), do: "someone"

  # "PTO · Mon Nov 23 – Wed Nov 25, all day" / "Sick · Mon Nov 23, 2:00 PM–5:00 PM",
  # Colorado time.
  defp details(%Request{} = req), do: "#{type_label(req.type)} · #{dates_label(req)}"

  defp type_label("pto"), do: "PTO"
  defp type_label(type), do: String.capitalize(type || "")

  defp dates_label(%Request{starts_at: starts_at, ends_at: ends_at, all_day: all_day}) do
    {sd, st} = Recurrence.to_local(starts_at)
    {ed, et} = Recurrence.to_local(ends_at)

    cond do
      all_day and sd == ed -> "#{day_label(sd)}, all day"
      all_day -> "#{day_label(sd)} – #{day_label(ed)}, all day"
      sd == ed -> "#{day_label(sd)}, #{time_label(st)}–#{time_label(et)}"
      true -> "#{day_label(sd)}, #{time_label(st)} – #{day_label(ed)}, #{time_label(et)}"
    end
  end

  defp day_label(%Date{} = d), do: Calendar.strftime(d, "%a %b %-d")
  defp time_label(%Time{} = t), do: Calendar.strftime(t, "%-I:%M %p")

  defp join_lines(lines),
    do: lines |> Enum.reject(&(&1 in [nil, ""])) |> Enum.join("\n")

  ## Helpers

  defp apply_filters(query, filters) do
    query
    |> maybe(filters, "status", fn q, s -> where(q, [r], r.status == ^s) end)
    |> maybe(filters, "when", fn
      q, "current" -> current(q)
      q, "past" -> past(q)
    end)
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
