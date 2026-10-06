defmodule RockcutApi.Authz do
  @moduledoc """
  Central authorization decisions for Rockcut.

  Tiers:
    * owner    — global; sees all departments, may assign any role
    * manager  — per-department; manages users within that department
    * employee — per-department; limited authority

  `role_in/2`, `member_of?/2`, and `can_manage_users_in?/2` answer
  department-scoped questions. `can?/3` is the action-aware entry point used to
  authorize operations on a resource; it takes the resource struct so per-item
  policy (e.g. D11 schedule `employee_write_scope`) can be consulted.

  A department may be given as a `%Department{}`, its integer id, or its string
  key (e.g. "brewery"). Key matching requires the user's memberships to be
  preloaded with `:department` (as `Accounts.get_user!/1` does).
  """
  import Ecto.Query, only: [from: 2]
  alias RockcutApi.Repo
  alias RockcutApi.Accounts.{User, Membership, Department}

  alias RockcutApi.Scheduling.{
    Shift,
    ScheduleEvent,
    ScheduleEventSeries,
    Position,
    ShiftTemplate,
    ScheduleTemplate
  }

  alias RockcutApi.TimeOff.Request
  alias RockcutApi.Availability.Slot

  @doc "True if the account is a shared device (D33), not a person."
  def device?(%User{kind: "device"}), do: true
  def device?(_), do: false

  @doc """
  True if `user` may hold a D37 staff code: an active person (not a device)
  with a Taproom membership. Expects memberships preloaded with departments.
  """
  def can_hold_staff_code?(%User{kind: "person", active: true} = user),
    do: member_of?(user, "bar")

  def can_hold_staff_code?(_), do: false

  @doc "True if the user is a global owner."
  def owner?(%User{is_owner: owner}), do: owner == true

  @doc """
  The user's role in a department: `:owner` (global), `:manager`, `:employee`,
  or `nil` when the user has no membership there.
  """
  def role_in(%User{is_owner: true}, _department), do: :owner

  def role_in(%User{} = user, department) do
    case Enum.find(memberships(user), &matches_department?(&1, department)) do
      %Membership{role: "manager"} -> :manager
      %Membership{role: "employee"} -> :employee
      _ -> nil
    end
  end

  @doc "True if the user is an owner or has any membership in the department."
  def member_of?(%User{} = user, department) do
    role_in(user, department) != nil
  end

  @doc "True if the user may manage users within the department (owner or its manager)."
  def can_manage_users_in?(%User{} = user, department) do
    role_in(user, department) in [:owner, :manager]
  end

  @doc "Department ids the user manages (managers only; owners are handled separately by callers)."
  def managed_department_ids(%User{} = user) do
    user
    |> memberships()
    |> Enum.filter(&(&1.role == "manager"))
    |> Enum.map(& &1.department_id)
  end

  @doc """
  True if `user` may act on behalf of `target_user_id`: an owner may manage
  anyone; a manager may manage a user who is a member of a department they
  manage. (Self is decided by callers.)
  """
  def can_manage_user?(%User{kind: "device"}, _target), do: false
  def can_manage_user?(%User{is_owner: true}, _target), do: true

  def can_manage_user?(%User{} = user, %User{memberships: target_memberships})
      when is_list(target_memberships) do
    managed = managed_department_ids(user)
    Enum.any?(target_memberships, &(&1.department_id in managed))
  end

  def can_manage_user?(%User{} = user, target_user_id) do
    case managed_department_ids(user) do
      [] ->
        false

      dept_ids ->
        Repo.exists?(
          from(m in Membership,
            where: m.user_id == ^target_user_id and m.department_id in ^dept_ids
          )
        )
    end
  end

  @doc """
  True if the user counts as a manager: an owner, or a manager of any
  department. Decides the Managers channel and every "any manager" rule
  (D29 §3.7 `counts_as_manager`).
  """
  def counts_as_manager?(%User{kind: "device"}), do: false
  def counts_as_manager?(%User{is_owner: true}), do: true

  def counts_as_manager?(%User{} = user),
    do: Enum.any?(memberships(user), &(&1.role == "manager"))

  @doc "Active users in the Managers audience: manager memberships plus owners (D29 §3.7)."
  def managers_audience_query do
    from(u in User,
      left_join: m in Membership,
      on: m.user_id == u.id and m.role == "manager",
      where: u.active == true and (u.is_owner == true or not is_nil(m.id)),
      distinct: true
    )
  end

  @doc """
  The departments whose records `user` may act on at `level` in `module`
  (D29 §3.5), for scoping list queries. `:all` = no department restriction
  (owners); callers still apply baseline rows (own records, published
  shifts) and data rules (assignable departments) themselves.

    * `:manage` — managed departments (any module)
    * `:edit` on `:messaging` — member departments
  """
  # A device (D33): its home department's channel for messaging; nothing
  # department-scoped anywhere else, so lists show published records only.
  def scope(%User{kind: "device", home_department_id: home}, :messaging, _level),
    do: {:departments, [home]}

  def scope(%User{kind: "device"}, _module, _level), do: :none

  def scope(%User{is_owner: true}, _module, _level), do: :all

  def scope(%User{} = user, _module, :manage),
    do: departments_or_none(managed_department_ids(user))

  def scope(%User{} = user, :messaging, :edit),
    do: departments_or_none(member_department_ids(user))

  def scope(_user, _module, _level), do: :none

  @doc "User ids with a membership in `scope`'s departments: `:all`, or a list."
  def member_ids_in(:all), do: :all
  def member_ids_in(:none), do: []

  def member_ids_in({:departments, ids}) do
    from(m in Membership, where: m.department_id in ^ids, select: m.user_id, distinct: true)
    |> Repo.all()
  end

  @doc """
  Authorize `action` (a verb atom such as `:read`, `:create`, `:update`,
  `:delete`) on `resource`. Owners may do anything, except the few rules that
  bind owners too (time-off cancel, non-assignable channels); otherwise the
  resource's policy decides. `resource` is a struct for a record, a tagged
  tuple when there is no record (`{:channel, key}`, `{:calendar_feed, type, id}`,
  `{:memberships, dept_id}`, `{:user_for, user_id}`, `{:module, key}`), or an
  atom for a company-level surface (`:roster`, `:owner_activity`, `:memberships`).
  """
  # Shared devices (D33 §3.4) come first, above everything that binds owners:
  # every decision about a device goes to its own allowlist, which denies by
  # default.
  def can?(%User{kind: "device"} = device, action, resource),
    do: RockcutApi.Authz.Device.can?(device, action, resource)

  # Rules that bind owners too come before the owner clause.

  # Time off: only the requester may cancel, owners included (was time_off.ex:143-146).
  def can?(%User{id: id}, :cancel, %Request{user_id: uid}), do: id == uid

  # Channels exist only for assignable departments, owners included (was messaging.ex:37-45).
  def can?(%User{} = user, action, {:channel, key}) when action in [:view, :post],
    do: channel_access?(user, key)

  # Only the three feed kinds exist, owners included (was calendar_feeds.ex:69).
  def can?(%User{}, :rotate, {:calendar_feed, type, _id})
      when type not in ["user", "department", "all"],
      do: false

  # Acting on behalf of a user binds owners too (D33 review item 2): nobody acts
  # on behalf of a shared device (time off, availability). People: owners may
  # act for anyone, managers for their departments' members.
  def can?(%User{} = user, action, {:user_for, target_id}) do
    cond do
      device_account?(target_id) -> false
      owner?(user) -> true
      action == :manage -> can_manage_user?(user, target_id)
      true -> false
    end
  end

  # A personal calendar feed: your own, or any person's for an owner; never a
  # device's, owners included (D33 review item 2).
  def can?(%User{} = user, :rotate, {:calendar_feed, "user", subject_id}) do
    cond do
      device_account?(subject_id) -> false
      owner?(user) -> true
      true -> user.id == subject_id
    end
  end

  def can?(%User{is_owner: true}, _action, _resource), do: true

  # Scheduling — shifts: global read of published; department-scoped write;
  # employees may claim open published shifts in their own department.
  def can?(%User{} = user, action, %Shift{} = shift) do
    manager? = role_in(user, shift.department_id) == :manager

    case action do
      :read ->
        shift.status == "published" or manager?

      a when a in [:create, :update, :assign, :delete, :publish, :unpublish] ->
        manager?

      :claim ->
        shift.status == "published" and is_nil(shift.assignee_id) and
          member_of?(user, shift.department_id)

      _ ->
        false
    end
  end

  # Schedule events (D32): published events are readable by everyone; drafts and
  # every write belong to the department's managers (owners pass above).
  def can?(%User{} = user, action, %ScheduleEvent{} = event) do
    manager? = role_in(user, event.department_id) == :manager

    case action do
      :read -> event.status == "published" or manager?
      a when a in [:create, :update, :delete, :publish, :unpublish] -> manager?
      _ -> false
    end
  end

  # A repeating event's series: only the department's managers extend or change it.
  def can?(%User{} = user, action, %ScheduleEventSeries{} = series)
      when action in [:update, :delete, :extend],
      do: role_in(user, series.department_id) == :manager

  # Scheduling — positions are company-wide: anyone reads; any manager/owner writes.
  def can?(%User{} = user, action, %Position{}) do
    case action do
      :read -> true
      a when a in [:create, :update, :delete] -> counts_as_manager?(user)
      _ -> false
    end
  end

  # Shift templates, schedule templates, roster order: anyone reads; any
  # manager writes (was shift_template_controller:47, schedule_template_controller:16,26,
  # roster_controller:14).
  def can?(%User{} = user, action, resource)
      when is_struct(resource, ShiftTemplate) or is_struct(resource, ScheduleTemplate) or
             resource == :roster do
    case action do
      :read -> true
      a when a in [:create, :update, :delete, :reorder] -> counts_as_manager?(user)
      _ -> false
    end
  end

  # Time off review: a manager of one of the requester's departments; a manager
  # (of anything) may review their own request (was time_off.ex:165-175). Needs
  # `req.user.memberships` preloaded, as `TimeOff.get/1` does.
  def can?(%User{id: id} = user, :review, %Request{user_id: uid}) when id == uid,
    do: counts_as_manager?(user)

  def can?(%User{} = user, :review, %Request{user: %{memberships: memberships}})
      when is_list(memberships),
      do: Enum.any?(memberships, &(role_in(user, &1.department_id) == :manager))

  # Acting on behalf of a user by id (time off, availability; was time_off.ex:102,
  # availability.ex:89) is decided above the owner clause.

  # Availability: own slots, or a managed user's (was availability.ex:80-82).
  def can?(%User{id: id}, :delete, %Slot{user_id: uid}) when id == uid, do: true
  def can?(%User{} = user, :delete, %Slot{user_id: uid}), do: can_manage_user?(user, uid)

  # Calendar feed tokens (was calendar_feeds.ex:63-69). Personal feeds are
  # decided above the owner clause.
  def can?(%User{} = user, :rotate, {:calendar_feed, "department", sid}),
    do: role_in(user, sid) == :manager

  # Shared devices (D33 Q2): managers of a device's home department see it, pair
  # tablets to it and revoke them. Creating, renaming, deactivating and deleting
  # the device account is owner-only (owners pass above; `:manage_device` falls
  # through to false for everyone else).
  def can?(%User{} = user, action, %User{kind: "device"} = device)
      when action in [:view_device, :pair, :revoke_token],
      do: role_in(user, device.home_department_id) == :manager

  # People: listing and creating users is "any manager"; changing a user needs
  # a department in common that the actor manages (was user_controller:12,22,49,76,89;
  # accounts.ex:266-270).
  def can?(%User{} = user, action, %User{}) when action in [:list, :create],
    do: counts_as_manager?(user)

  def can?(%User{} = user, action, %User{} = target) when action in [:update, :reset_password],
    do: can_manage_user?(user, target)

  # Memberships: set in a department only by its manager. Whether the department
  # is assignable at all is a data rule left in Accounts (was membership_controller:18,
  # accounts.ex:413-414).
  def can?(%User{} = user, :set, :memberships), do: counts_as_manager?(user)

  def can?(%User{} = user, :assign, {:memberships, dept_id}),
    do: role_in(user, dept_id) == :manager

  # D37 Buy-a-Beer Board: any Taproom member reads and writes (add, redeem,
  # edit, delete); the change log, import and export are for Taproom managers.
  # Owners pass above.
  def can?(%User{} = user, action, :beer_board) when action in [:read, :write],
    do: member_of?(user, "bar")

  def can?(%User{} = user, action, :beer_board) when action in [:history, :import, :export],
    do: role_in(user, "bar") == :manager

  # D37 staff codes: owners (above) and Taproom managers set and see them.
  # Whether the target may hold one is StaffCodes' check (can_hold_staff_code?/1).
  def can?(%User{} = user, action, %User{})
      when action in [:set_staff_code, :reveal_staff_code],
      do: role_in(user, "bar") == :manager

  # Departments: anyone reads; only owners (handled above) change them.
  def can?(%User{}, :read, %Department{}), do: true

  # Modules gated by department membership, e.g. the Brewery routes
  # (was module_access_plug.ex:26,40; replaces the unused Brewing struct clause).
  def can?(%User{} = user, :access, {:module, key}) when is_atom(key),
    do: member_of?(user, Atom.to_string(key))

  def can?(_user, _action, _resource), do: false

  ## Helpers

  defp departments_or_none([]), do: :none
  defp departments_or_none(ids), do: {:departments, ids}

  defp member_department_ids(%User{id: id}) do
    from(m in Membership, where: m.user_id == ^id, select: m.department_id) |> Repo.all()
  end

  # A shared-device account id (D33): used where owners are bound too.
  defp device_account?(id) when is_integer(id),
    do: Repo.exists?(from(u in User, where: u.id == ^id and u.kind == "device"))

  defp device_account?(_), do: false

  defp channel_access?(%User{} = user, "all"), do: user.active
  defp channel_access?(%User{} = user, "managers"), do: counts_as_manager?(user)

  defp channel_access?(%User{} = user, "dept:" <> key) do
    Repo.exists?(from(d in Department, where: d.key == ^key and d.assignable == true)) and
      (owner?(user) or
         Repo.exists?(
           from(m in Membership,
             join: d in Department,
             on: d.id == m.department_id,
             where: m.user_id == ^user.id and d.key == ^key
           )
         ))
  end

  defp channel_access?(_user, _key), do: false

  defp memberships(%User{memberships: m}) when is_list(m), do: m
  defp memberships(_), do: []

  defp matches_department?(%Membership{department_id: id}, %Department{id: id}), do: true
  defp matches_department?(%Membership{department_id: id}, id) when is_integer(id), do: true

  defp matches_department?(%Membership{department: %Department{key: key}}, key)
       when is_binary(key),
       do: true

  defp matches_department?(%Membership{}, _), do: false
end
