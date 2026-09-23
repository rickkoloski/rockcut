defmodule RockcutApi.Scheduling do
  @moduledoc """
  Staff scheduling: company-wide positions and department shifts.

  Read of published shifts is global (any authenticated user, all departments);
  writes are department-scoped and authorized by `RockcutApi.Authz`. Draft
  visibility is enforced here in `list_shifts/2`.
  """
  import Ecto.Query
  alias RockcutApi.Repo
  alias RockcutApi.Authz
  alias RockcutApi.Accounts.User
  alias RockcutApi.Scheduling.{Position, Shift, ShiftTemplate, ScheduleTemplate}
  alias RockcutApi.Notifications

  @shift_preloads [:department, :position, :assignee]

  ## Positions

  def list_positions(filters \\ %{}) do
    Position
    |> filter_positions(filters)
    |> order_by([p], asc: p.group, asc: p.name)
    |> Repo.all()
  end

  def get_position!(id), do: Repo.get!(Position, id)

  def create_position(attrs) do
    %Position{} |> Position.changeset(attrs) |> Repo.insert()
  end

  def update_position(%Position{} = position, attrs) do
    position |> Position.changeset(attrs) |> Repo.update()
  end

  @doc "Delete a position, or soft-deactivate it when shifts reference it."
  def deactivate_or_delete_position(%Position{} = position) do
    if referenced?(position) do
      update_position(position, %{"active" => false})
    else
      case Repo.delete(position) do
        {:ok, _} -> {:ok, :deleted}
        other -> other
      end
    end
  end

  defp referenced?(%Position{id: id}) do
    Repo.exists?(from s in Shift, where: s.position_id == ^id)
  end

  defp filter_positions(query, filters) do
    query
    |> maybe(filters, "group", fn q, g -> where(q, [p], p.group == ^g) end)
    |> maybe(filters, "active", fn q, a -> where(q, [p], p.active == ^truthy(a)) end)
  end

  ## Shifts

  def get_shift(id) do
    case Repo.get(Shift, id) do
      nil -> nil
      shift -> Repo.preload(shift, @shift_preloads)
    end
  end

  def get_shift!(id), do: Shift |> Repo.get!(id) |> Repo.preload(@shift_preloads)

  @doc """
  List shifts visible to `user` (owner: all; others: published anywhere plus
  their managed departments' drafts), narrowed by `filters`.
  """
  def list_shifts(%User{} = user, filters \\ %{}) do
    Shift
    |> restrict_visibility(user)
    |> filter_shifts(user, filters)
    |> order_by([s], asc: s.starts_at)
    |> preload(^@shift_preloads)
    |> Repo.all()
  end

  def create_shift(attrs, %User{} = actor) do
    attrs =
      attrs
      |> stringify()
      |> put_department_from_position()
      |> Map.put("created_by_id", actor.id)
      |> Map.put_new("status", "draft")

    case %Shift{} |> Shift.changeset(attrs) |> Repo.insert() do
      {:ok, shift} -> {:ok, get_shift!(shift.id)}
      other -> other
    end
  end

  def update_shift(%Shift{} = shift, attrs) do
    attrs = attrs |> stringify() |> put_department_from_position()
    old_assignee_id = shift.assignee_id
    old_status = shift.status
    old_start = shift.starts_at
    old_end = shift.ends_at
    old_position_id = shift.position_id

    case shift |> Shift.changeset(attrs) |> Repo.update() do
      {:ok, updated} ->
        full = get_shift!(updated.id)

        cond do
          # Only published, assigned shifts notify the assignee.
          full.status != "published" or is_nil(full.assignee_id) ->
            :ok

          # Newly assigned to this person (or just published to them) → scheduled.
          full.assignee_id != old_assignee_id or old_status != "published" ->
            Notifications.shift_scheduled(full, full.assignee)

          # Same assignee on an already-published shift, but the time/position
          # changed → their schedule changed.
          full.starts_at != old_start or full.ends_at != old_end or
              full.position_id != old_position_id ->
            Notifications.shift_changed(full, full.assignee)

          true ->
            :ok
        end

        {:ok, full}

      other ->
        other
    end
  end

  @doc "The department id a position belongs to (a shift inherits its position's department)."
  def department_for_position(nil), do: nil

  def department_for_position(id) when is_binary(id),
    do: department_for_position(String.to_integer(id))

  def department_for_position(id) when is_integer(id) do
    case Repo.get(Position, id) do
      %Position{department_id: dept_id} -> dept_id
      _ -> nil
    end
  end

  # A shift's department always follows its position (source of truth).
  defp put_department_from_position(attrs) do
    case department_for_position(attrs["position_id"]) do
      nil -> attrs
      dept_id -> Map.put(attrs, "department_id", dept_id)
    end
  end

  def delete_shift(%Shift{} = shift), do: Repo.delete(shift)

  def publish_shift(%Shift{} = shift) do
    with {:ok, published} <- set_status(shift, "published") do
      Notifications.shift_published(published)
      {:ok, published}
    end
  end

  @doc """
  Publish many shifts at once, sending a single coalesced notification per
  recipient. Only draft shifts transition (and are notified about).
  """
  def publish_shifts(shifts) when is_list(shifts) do
    published =
      shifts
      |> Enum.filter(&(&1.status == "draft"))
      |> Enum.map(&set_status(&1, "published"))
      |> Enum.filter(&match?({:ok, _}, &1))
      |> Enum.map(fn {:ok, s} -> s end)

    Notifications.shifts_published(published)
    {:ok, published}
  end

  def unpublish_shift(%Shift{} = shift), do: set_status(shift, "draft")

  defp set_status(%Shift{} = shift, status) do
    case shift |> Shift.changeset(%{"status" => status}) |> Repo.update() do
      {:ok, updated} -> {:ok, get_shift!(updated.id)}
      other -> other
    end
  end

  @doc "Claim an open (unassigned, published) shift for `user`."
  def claim_shift(%Shift{} = shift, %User{} = user) do
    cond do
      shift.status != "published" -> {:error, :not_claimable}
      not is_nil(shift.assignee_id) -> {:error, :not_claimable}
      true -> update_shift(shift, %{"assignee_id" => user.id})
    end
  end

  ## Shift templates (per-position standard hours)

  def list_shift_templates(filters \\ %{}) do
    ShiftTemplate
    |> maybe(filters, "position_id", fn q, id -> where(q, [t], t.position_id == ^to_int(id)) end)
    |> order_by([t], asc: t.position_id, asc: t.name)
    |> Repo.all()
  end

  def get_shift_template!(id), do: Repo.get!(ShiftTemplate, id)

  def create_shift_template(attrs) do
    %ShiftTemplate{} |> ShiftTemplate.changeset(attrs) |> Repo.insert()
  end

  def update_shift_template(%ShiftTemplate{} = template, attrs) do
    template |> ShiftTemplate.changeset(attrs) |> Repo.update()
  end

  def delete_shift_template(%ShiftTemplate{} = template), do: Repo.delete(template)

  ## Schedule templates (named week/day)

  def list_schedule_templates do
    ScheduleTemplate
    |> order_by([t], asc: t.name)
    |> preload(items: :position)
    |> Repo.all()
  end

  def get_schedule_template!(id) do
    ScheduleTemplate |> Repo.get!(id) |> Repo.preload(items: :position)
  end

  def create_schedule_template(attrs, %User{} = actor) do
    attrs = Map.put(stringify(attrs), "created_by_id", actor.id)

    case %ScheduleTemplate{} |> ScheduleTemplate.changeset(attrs) |> Repo.insert() do
      {:ok, template} -> {:ok, get_schedule_template!(template.id)}
      other -> other
    end
  end

  def delete_schedule_template(%ScheduleTemplate{} = template), do: Repo.delete(template)

  ## Query helpers

  defp restrict_visibility(query, %User{is_owner: true}), do: query

  defp restrict_visibility(query, %User{} = user) do
    managed = Authz.managed_department_ids(user)
    where(query, [s], s.status == "published" or s.department_id in ^managed)
  end

  defp filter_shifts(query, user, filters) do
    query
    |> maybe(filters, "department_id", fn q, id ->
      where(q, [s], s.department_id == ^to_int(id))
    end)
    |> maybe(filters, "position_id", fn q, id -> where(q, [s], s.position_id == ^to_int(id)) end)
    |> maybe(filters, "status", fn q, st -> where(q, [s], s.status == ^st) end)
    |> maybe(filters, "assignee_id", fn q, id -> where(q, [s], s.assignee_id == ^to_int(id)) end)
    |> maybe(filters, "from", fn q, d -> where(q, [s], s.starts_at >= ^start_of_day(d)) end)
    |> maybe(filters, "to", fn q, d -> where(q, [s], s.starts_at <= ^end_of_day(d)) end)
    |> maybe(filters, "mine", fn q, v ->
      if truthy(v), do: where(q, [s], s.assignee_id == ^user.id), else: q
    end)
    |> maybe(filters, "open", fn q, v ->
      if truthy(v), do: where(q, [s], is_nil(s.assignee_id)), else: q
    end)
  end

  defp maybe(query, filters, key, fun) do
    case Map.get(filters, key) do
      nil -> query
      "" -> query
      value -> fun.(query, value)
    end
  end

  defp stringify(map), do: Map.new(map, fn {k, v} -> {to_string(k), v} end)

  defp truthy(v), do: v in [true, "true", "1", 1]

  defp to_int(v) when is_integer(v), do: v
  defp to_int(v) when is_binary(v), do: String.to_integer(v)

  defp start_of_day(date) when is_binary(date), do: parse_day(date, ~T[00:00:00])
  defp end_of_day(date) when is_binary(date), do: parse_day(date, ~T[23:59:59])

  defp parse_day(date, time) do
    case Date.from_iso8601(date) do
      {:ok, d} -> DateTime.new!(d, time, "Etc/UTC")
      _ -> DateTime.utc_now()
    end
  end
end
