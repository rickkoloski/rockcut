defmodule RockcutApi.Accounts do
  @moduledoc """
  Identity and membership context: users, departments, and the role
  memberships that connect them. Phase 1 covers authentication and reads;
  user/role management writes are added in phase 2.
  """
  import Ecto.Query
  alias RockcutApi.Repo
  alias RockcutApi.Authz
  alias RockcutApi.Accounts.{User, Department, Membership, AuditEntry, BoardSettings}

  @preloads [memberships: :department]
  @roles ~w(manager employee)

  ## Users

  @doc "Fetch a user by id with memberships + departments preloaded. Raises if missing."
  def get_user!(id) do
    User
    |> Repo.get!(id)
    |> Repo.preload(@preloads)
  end

  @doc "Fetch a user by id, or nil. Preloaded."
  def get_user(id) do
    case Repo.get(User, id) do
      nil -> nil
      user -> Repo.preload(user, @preloads)
    end
  end

  @doc "Fetch a user by (case-insensitive) email, or nil. Preloaded."
  def get_user_by_email(email) when is_binary(email) do
    User
    |> where([u], fragment("? = ? COLLATE NOCASE", u.email, ^String.trim(email)))
    |> Repo.one()
    |> case do
      nil -> nil
      user -> Repo.preload(user, @preloads)
    end
  end

  @doc """
  Authenticate by email + password. Runs a constant-time dummy verify when the
  user is missing to avoid leaking which emails exist. Returns the preloaded
  user or nil. Callers are responsible for checking `user.active`.
  """
  def get_user_by_email_and_password(email, password)
      when is_binary(email) and is_binary(password) do
    user = get_user_by_email(email)

    cond do
      # A shared device never signs in with a password (D33 §3.1).
      user && Authz.device?(user) ->
        Argon2.no_user_verify()
        nil

      user && Argon2.verify_pass(password, user.password_hash) ->
        user

      true ->
        # Constant-time work even on a miss, then no match.
        Argon2.no_user_verify()
        nil
    end
  end

  ## Departments

  @doc "All departments, ordered by name, owners-only ones (Owners) last (D59 §4.4)."
  def list_departments do
    Department |> Repo.all() |> sort_departments(:name)
  end

  @doc """
  The departments `viewer` may know exist (D59 decision 9: an owners-only one
  only for owners and its members), in `list_departments/0`'s order.
  """
  def list_departments_for(%User{} = viewer) do
    Enum.filter(list_departments(), &Authz.can?(viewer, :see, {:department, &1}))
  end

  @doc """
  D59 §4.4: the one department order. `by` (`:name` or `:id`) orders them,
  except that owners-only departments (Owners) come after all the rest.
  """
  def sort_departments(departments, by) when by in [:name, :id],
    do: Enum.sort_by(departments, &{&1.owners_only, Map.fetch!(&1, by)})

  @doc "Fetch a department by its key (e.g. \"brewery\"), or nil."
  def get_department_by_key(key) when is_binary(key) do
    Repo.get_by(Department, key: key)
  end

  def get_department!(id), do: Repo.get!(Department, id)

  def update_department(%Department{} = department, attrs) do
    department |> Department.changeset(attrs) |> Repo.update()
  end

  @doc """
  Minimal staff roster (active users) for schedule display — readable by anyone
  signed in. Each person's `departments` leave out those `viewer` can't see
  (D59 decision 9).
  """
  def list_roster(%User{} = viewer) do
    visible = viewer |> list_departments_for() |> MapSet.new(& &1.key)

    persons_query()
    |> where([u], u.active == true and u.schedulable == true)
    |> order_by([u], asc: u.schedule_order, asc: u.name, asc: u.email)
    |> preload(^@preloads)
    |> Repo.all()
    |> Enum.map(fn u ->
      %{
        id: u.id,
        name: u.name || u.email,
        departments:
          u.memberships
          |> Enum.map(& &1.department.key)
          |> Enum.filter(&MapSet.member?(visible, &1))
          |> Enum.uniq()
      }
    end)
  end

  @doc "Persist the schedule display order (a list of user ids in the desired order)."
  def reorder_roster(user_ids) when is_list(user_ids) do
    user_ids
    |> Enum.with_index()
    |> Enum.each(fn {id, index} ->
      from(u in User, where: u.id == ^id) |> Repo.update_all(set: [schedule_order: index])
    end)

    :ok
  end

  @doc """
  People only: every `users` row except shared devices (D33). Listings of
  staff (roster, Users & Roles, All-staff recipients) start from this.
  """
  def persons_query do
    # authz-boundary: data invariant (devices are not staff)
    from(u in User, where: u.kind == "person")
  end

  @doc "True if `user_id` is a shared-device account (D33): never an assignee."
  def device_id?(nil), do: false

  def device_id?(user_id) do
    # authz-boundary: data invariant (a device is never an assignee)
    Repo.exists?(from(u in User, where: u.id == ^user_id and u.kind == "device"))
  end

  @doc "D58 §3.7 (5204): true for a deactivated person (a shift can't go to them)."
  def inactive_id?(nil), do: false

  def inactive_id?(user_id) do
    Repo.exists?(from(u in User, where: u.id == ^user_id and u.active == false))
  end

  ## Memberships

  @doc "List a user's memberships with departments preloaded."
  def list_memberships(%User{id: user_id}) do
    Membership
    |> where(user_id: ^user_id)
    |> preload(:department)
    |> Repo.all()
  end

  ## User & role management (writes)

  @doc """
  Create a user with a generated temporary password and
  `must_reset_password: true`. A `"password"` in `attrs` is ignored (D51, task
  4231: the response never hands back a password the caller typed). `attrs`
  may include `"memberships"` (a declarative list of
  `%{"department" => key|id, "role" => role}`), which is applied under
  `actor`'s authority. Returns `{:ok, user, temp_password}`.
  """
  def create_user(attrs, %User{} = actor) do
    attrs = stringify(attrs)
    temp_password = generate_temp_password()
    # Left out = no roles; `null` is malformed, as on update (lead decisions 6, gap 7).
    desired = Map.get(attrs, "memberships", [])

    reg_attrs = %{
      "email" => attrs["email"],
      "name" => attrs["name"],
      "password" => temp_password,
      "must_reset_password" => true
    }

    # Hash (Argon2, slow by design) before the transaction, so the single DB
    # connection isn't held while it runs (D34 DEV fix cycle 1).
    changeset = User.registration_changeset(%User{}, reg_attrs)

    result =
      Repo.transaction(fn ->
        with {:ok, user} <- Repo.insert(changeset),
             {:ok, user} <- apply_memberships(user, desired, actor) do
          log_audit(actor.id, user.id, "user.created", %{"email" => user.email})
          user
        else
          {:error, reason} -> Repo.rollback(reason)
        end
      end)

    case result do
      {:ok, user} -> {:ok, user, temp_password}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  D43: set the person's own theme. A display preference: no change-log entry.
  """
  def set_color_mode(%User{} = user, mode) do
    user |> User.color_mode_changeset(%{color_mode: mode}) |> Repo.update()
  end

  @doc "D49: a person's \"Show planned batches\" (`true` / `false`)."
  def set_show_planned_batches(%User{} = user, value) do
    user
    |> User.show_planned_batches_changeset(%{show_planned_batches: value})
    |> Repo.update()
  end

  @doc """
  D58 §3.1: save some of a board's settings for this account (a person or a
  device), keeping its other settings and boards. Answers the board's
  settings with the defaults filled in. A display preference: no change-log
  entry. Read fresh inside the transaction, so two quick changes both stay.
  """
  def save_board_settings(%User{id: id, kind: kind}, board_key, attrs)
      when is_binary(board_key) do
    with {:ok, changes} <- BoardSettings.validate(board_key, attrs, kind) do
      Repo.transaction(fn ->
        user = Repo.get!(User, id)
        board = Map.merge(Map.get(user.board_settings, board_key, %{}), changes)

        if changes != %{} do
          user
          |> Ecto.Changeset.change(board_settings: Map.put(user.board_settings, board_key, board))
          |> Repo.update!()
        end

        BoardSettings.with_defaults(board_key, board)
      end)
    end
  end

  @doc """
  Update a user's profile/status. `is_owner` is only honored when `actor` is an
  owner. Refuses to deactivate or demote the last active owner.
  """
  def update_user(%User{} = target, attrs, %User{} = actor) do
    if Authz.device?(target),
      do: {:error, :device_account},
      else: do_update_user(target, attrs, actor)
  end

  defp do_update_user(target, attrs, actor) do
    attrs = stringify(attrs)
    base = Map.take(attrs, ["name", "email", "active", "schedulable"])
    owner_change? = Map.has_key?(attrs, "is_owner") and Authz.can?(actor, :set_owner, target)

    Repo.transaction(fn ->
      before = feed_access(target.id)

      cond do
        attrs["active"] == false and last_active_owner?(target) ->
          Repo.rollback(:last_owner)

        owner_change? and attrs["is_owner"] in [false, "false"] and last_active_owner?(target) ->
          Repo.rollback(:last_owner)

        true ->
          changeset = User.changeset(target, base)

          changeset =
            if owner_change?,
              do: Ecto.Changeset.put_change(changeset, :is_owner, truthy(attrs["is_owner"])),
              else: changeset

          # D58 §3.3: deactivating or reactivating is its own permission.
          if Ecto.Changeset.get_change(changeset, :active) != nil and
               not Authz.can?(actor, :deactivate, target),
             do: Repo.rollback(:cannot_deactivate)

          case Repo.update(changeset) do
            {:ok, user} ->
              log_audit(actor.id, user.id, "user.updated", %{"fields" => Map.keys(base)})

              # D35 DEV pass G6: owner access changes get their own log entry.
              case Ecto.Changeset.get_change(changeset, :is_owner) do
                true -> log_audit(actor.id, user.id, "user.owner_granted", %{})
                false -> log_audit(actor.id, user.id, "user.owner_removed", %{})
                nil -> :unchanged
              end

              # D37: a deactivated person's staff code stops working.
              RockcutApi.StaffCodes.clear_if_ineligible(user.id, actor)
              # D38: and they come off open Brewery tasks.
              RockcutApi.Tasks.unassign_if_ineligible(user.id, actor)
              # D53: and off Idea Board cards, and their watches, on the
              # boards they can no longer open.
              RockcutApi.IdeaBoards.People.drop_if_ineligible(user.id, actor)
              # D58 lead decisions 1 (gap 9): and off their future shifts.
              opened = unassign_future_shifts(target, user, actor)

              {get_user!(user.id), rotate_lost_feeds(before, user.id, actor), opened}

            {:error, cs} ->
              Repo.rollback(cs)
          end
      end
    end)
    |> notify_opened_shifts()
    |> notify_rotated_feeds()
  end

  # D58 lead decisions 1 (DEV QA gap 9): deactivating someone takes them off
  # every shift that starts after now (drafts stay drafts, published ones
  # become open shifts), with one change-log entry. Reactivating gives none
  # back. Answers the shifts that became open, for after the commit.
  defp unassign_future_shifts(%User{active: true}, %User{active: false} = user, actor) do
    case RockcutApi.Scheduling.unassign_future_shifts(user.id) do
      {0, _} ->
        []

      {count, opened} ->
        log_audit(actor.id, user.id, "user.shifts_unassigned", %{"count" => count})
        opened
    end
  end

  defp unassign_future_shifts(_before, _user, _actor), do: []

  # After commit: the open-shift notification, as publishing an open shift
  # sends it (D18).
  defp notify_opened_shifts({:ok, {user, rotated, opened}}) do
    if opened != [], do: RockcutApi.Notifications.shifts_published(opened)
    {:ok, {user, rotated}}
  end

  defp notify_opened_shifts(other), do: other

  # D35: when someone leaves, or a change takes shared calendar feeds away
  # from them, those feeds get new tokens and everyone who still uses them is
  # told to re-subscribe. `before` is taken inside the same transaction.
  defp feed_access(user_id) do
    user = get_user!(user_id)

    %{
      active: user.active,
      feeds: if(user.active, do: RockcutApi.CalendarFeeds.shared_feeds(user), else: [])
    }
  end

  defp rotate_lost_feeds(%{active: false}, _user_id, _actor), do: nil

  defp rotate_lost_feeds(before, user_id, actor) do
    now = feed_access(user_id)
    departed? = not now.active
    reason = if departed?, do: :departed, else: :lost_access
    person = get_user!(user_id)

    rotated =
      RockcutApi.CalendarFeeds.rotate_lost(
        person,
        before.feeds -- now.feeds,
        departed?,
        reason,
        actor
      )

    {rotated, reason, user_id}
  end

  # After commit: notifications never run for a rolled-back change.
  defp notify_rotated_feeds({:ok, {user, nil}}), do: {:ok, user}

  defp notify_rotated_feeds({:ok, {user, {rotated, reason, user_id}}}) do
    RockcutApi.CalendarFeeds.notify_rotated(rotated, reason, user_id)
    {:ok, user}
  end

  defp notify_rotated_feeds(other), do: other

  @doc """
  Reconcile a user's memberships to `desired` (declarative) under `actor`'s
  authority. Owners may set any department; managers may only touch departments
  they manage (and memberships elsewhere are left untouched). Returns
  `{:ok, user}` or `{:error, reason}`.
  """
  def set_memberships(%User{} = target, desired, %User{} = actor) do
    if Authz.device?(target),
      do: {:error, :device_account},
      else: do_set_memberships(target, desired, actor)
  end

  defp do_set_memberships(target, desired, actor) do
    Repo.transaction(fn ->
      before = feed_access(target.id)

      case apply_memberships(target, desired, actor) do
        {:ok, user} ->
          # D37: leaving the Taproom ends the person's staff code.
          RockcutApi.StaffCodes.clear_if_ineligible(user.id, actor)
          # D38: leaving the Brewery takes them off open Brewery tasks.
          RockcutApi.Tasks.unassign_if_ineligible(user.id, actor)
          # D53: and off that board's Idea Board cards and watches.
          RockcutApi.IdeaBoards.People.drop_if_ineligible(user.id, actor)
          {get_user!(user.id), rotate_lost_feeds(before, user.id, actor)}

        {:error, reason} ->
          Repo.rollback(reason)
      end
    end)
    |> notify_rotated_feeds()
  end

  @doc "Reset a user's password to a fresh temp value with forced reset. Returns {:ok, user, temp}."
  def reset_password(%User{} = target, %User{} = actor) do
    if Authz.device?(target),
      do: {:error, :device_account},
      else: do_reset_password(target, actor)
  end

  defp do_reset_password(target, actor) do
    temp = generate_temp_password()

    case target
         |> User.password_changeset(%{"password" => temp, "must_reset_password" => true})
         |> Repo.update() do
      {:ok, user} ->
        # D34 §3.4: a reset signs the person out everywhere.
        RockcutApi.Sessions.revoke_all(user, nil)
        log_audit(actor.id, user.id, "user.password_reset", %{})
        {:ok, get_user!(user.id), temp}

      {:error, cs} ->
        {:error, cs}
    end
  end

  @doc "Change a user's own password after verifying the current one."
  def change_password(%User{} = user, current, new) do
    cond do
      Authz.device?(user) or not Argon2.verify_pass(current, user.password_hash) ->
        {:error, :invalid_current}

      # DEV pass 1 G3: reusing the current password would only sign out the other devices.
      new == current ->
        {:error, :same_password}

      true ->
        case user
             |> User.password_changeset(%{"password" => new, "must_reset_password" => false})
             |> Repo.update() do
          {:ok, user} -> {:ok, get_user!(user.id)}
          {:error, cs} -> {:error, cs}
        end
    end
  end

  ## User queries & capabilities

  @doc """
  Users & Roles: every person (devices excluded) for an owner or any manager
  (D58 §3.3, decision 3); nobody else lists users. What the actor may do with
  each is `user_access/2`.
  """
  def list_users_for(%User{} = actor) do
    if Authz.can?(actor, :list, %User{}) do
      persons_query()
      |> order_by(:email)
      |> Repo.all()
      |> Repo.preload(@preloads)
    else
      []
    end
  end

  @doc """
  D58 §3.3: what `actor` may do with `target` in Users & Roles, for the UI:
  `can_edit` (`Authz` `:update`: an owner, or a manager of every department
  the person is in), `can_deactivate` (`Authz` `:deactivate`, the same rule), `addable_departments` (the departments the actor
  can add the person to that they aren't in, `%{key, name}`), and
  `hidden_department_ids`: the person's departments the actor can't see
  (Owners, to anyone but owners and its members; lead decisions 1 reverses
  decision 7's read-only chip), left out of every payload about them. Expects memberships preloaded with departments;
  `departments` saves a query per row in a list.
  """
  def user_access(%User{} = actor, %User{} = target, departments \\ list_departments()) do
    can_edit = Authz.can?(actor, :update, target)
    current = MapSet.new(target.memberships, & &1.department_id)

    %{
      can_edit: can_edit,
      can_deactivate: Authz.can?(actor, :deactivate, target),
      addable_departments:
        for(
          d <- departments,
          d.assignable,
          not MapSet.member?(current, d.id),
          Authz.can?(actor, :assign, {:memberships, d.id}),
          do: %{key: d.key, name: d.name}
        ),
      hidden_department_ids:
        for(
          m <- target.memberships,
          not Authz.can?(actor, :see, {:department, m.department}),
          do: m.department_id
        )
    }
  end

  @doc "Capabilities payload for the UI (modules, management scope, owner review count)."
  def capabilities(%User{} = user) do
    if Authz.device?(user),
      do: RockcutApi.Authz.Device.capabilities(user),
      else: person_capabilities(user)
  end

  defp person_capabilities(%User{} = user) do
    assignable = list_departments() |> Enum.filter(& &1.assignable)

    modules =
      if Authz.owner?(user),
        do: Enum.map(assignable, & &1.key),
        else: user.memberships |> Enum.map(& &1.department.key) |> Enum.uniq()

    manages =
      case Authz.scope(user, :schedule, :manage) do
        :all ->
          Enum.map(assignable, & &1.key)

        :none ->
          []

        {:departments, ids} ->
          for m <- user.memberships, m.department_id in ids, do: m.department.key
      end

    %{
      modules: modules ++ ["schedule"],
      manages_departments: manages,
      can_manage_users: Authz.can?(user, :list, %User{}),
      pending_owner_reviews:
        if(Authz.can?(user, :read, :owner_activity),
          do: pending_owner_reviews_count(user),
          else: 0
        )
    }
  end

  @doc "Recent audit entries (newest first) with actor/target preloaded."
  def list_recent_audit(limit \\ 50) do
    AuditEntry
    |> order_by(desc: :inserted_at)
    |> limit(^limit)
    |> preload([:actor, :target])
    |> Repo.all()
  end

  @doc """
  True if `user` sees Admin → Shared devices (D33): an owner, or a manager of
  some device's home department. Returned at the top level of `/api/me`, not
  in `capabilities` (whose keys the D31 parity suite pins).
  """
  def shared_devices?(%User{} = user) do
    case Authz.scope(user, :devices, :manage) do
      :all ->
        true

      :none ->
        false

      {:departments, ids} ->
        # authz-boundary: data invariant (which departments have a device)
        Repo.exists?(from(u in User, where: u.kind == "device" and u.home_department_id in ^ids))
    end
  end

  @doc "Mark the change log as seen for `user` (clears their unread badge)."
  def mark_activity_seen(%User{} = user) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    user |> Ecto.Changeset.change(activity_seen_at: now) |> Repo.update()
  end

  def active_owner_count do
    # authz-boundary: data invariant (last-owner guard)
    User |> where([u], u.is_owner == true and u.active == true) |> Repo.aggregate(:count)
  end

  ## Internal helpers

  defp apply_memberships(%User{} = user, desired_raw, %User{} = actor) do
    authorized? = fn dept_id -> Authz.can?(actor, :assign, {:memberships, dept_id}) end

    with {:ok, desired} <- resolve_desired(desired_raw, authorized?) do
      case Enum.find(desired, fn {dept, _role} -> not authorized?.(dept.id) end) do
        {dept, _role} ->
          {:error, {:unauthorized_department, dept.key}}

        nil ->
          current = current_membership_map(user)
          desired_map = Map.new(desired, fn {dept, role} -> {dept.id, role} end)

          # Remove memberships within the actor's authority that are absent from desired.
          current
          |> Enum.filter(fn {dept_id, _m} ->
            authorized?.(dept_id) and not Map.has_key?(desired_map, dept_id)
          end)
          |> Enum.each(fn {dept_id, m} ->
            Repo.delete!(m)

            log_audit(actor.id, user.id, "membership.removed", %{
              "department_id" => dept_id,
              "role" => m.role
            })
          end)

          # Add or update desired memberships.
          Enum.each(desired_map, fn {dept_id, role} ->
            case Map.get(current, dept_id) do
              nil ->
                %Membership{}
                |> Membership.changeset(%{user_id: user.id, department_id: dept_id, role: role})
                |> Repo.insert!()

                log_audit(actor.id, user.id, "membership.added", %{
                  "department_id" => dept_id,
                  "role" => role
                })

              %Membership{role: ^role} ->
                :noop

              %Membership{} = m ->
                m |> Membership.changeset(%{role: role}) |> Repo.update!()

                log_audit(actor.id, user.id, "membership.changed", %{
                  "department_id" => dept_id,
                  "role" => role
                })
            end
          end)

          {:ok, get_user!(user.id)}
      end
    end
  end

  # Resolve raw desired entries into {%Department{}, role} tuples. Anything but
  # a list of objects (a map, a string, `[null]`, form-encoded) is a 422, not a
  # crash (D55 §2.4, task 4983).
  defp resolve_desired(entries, _authorized?) when not is_list(entries),
    do: {:error, {:invalid_membership, "must be a list"}}

  defp resolve_desired(entries, authorized?) do
    entries
    |> Enum.reduce_while({:ok, []}, fn
      entry, {:ok, acc} when is_map(entry) ->
        resolve_entry(stringify(entry), acc, authorized?)

      _entry, _acc ->
        {:halt, {:error, {:invalid_membership, "each entry needs a department and a role"}}}
    end)
    |> refuse_duplicates()
  end

  # One department named twice (by key or id, any roles) is malformed: which
  # role was meant? It was silently the first (lead decisions 6, gap 6).
  defp refuse_duplicates({:ok, desired}) do
    if Enum.uniq_by(desired, fn {dept, _role} -> dept.id end) == desired,
      do: {:ok, desired},
      else: {:error, {:invalid_membership, "names a department more than once"}}
  end

  defp refuse_duplicates(error), do: error

  defp resolve_entry(entry, acc, authorized?) do
    role = entry["role"]
    dept = resolve_department(entry["department"])

    cond do
      is_nil(dept) ->
        {:halt, {:error, {:invalid_membership, "unknown department"}}}

      not dept.assignable ->
        {:halt, {:error, {:invalid_membership, "department is not assignable"}}}

      # D59 gap 9: permission before role, so someone who can't assign in an
      # owners-only department gets the neutral 403 whatever role they asked for.
      dept.owners_only and not authorized?.(dept.id) ->
        {:halt, {:error, {:unauthorized_department, dept.key}}}

      role not in @roles ->
        {:halt, {:error, {:invalid_membership, "invalid role"}}}

      # D59 §4.3: nobody manages an owners-only department, owners included.
      dept.owners_only and role == "manager" ->
        {:halt, {:error, {:invalid_membership, "#{dept.name} has no managers"}}}

      true ->
        {:cont, {:ok, [{dept, role} | acc]}}
    end
  end

  defp resolve_department(%Department{} = d), do: d

  # D55 §2.11: an id past SQLite's range is an unknown department, not a 500.
  defp resolve_department(id) when is_integer(id), do: get_department_by_id(id)

  defp resolve_department(key) when is_binary(key) do
    case Integer.parse(key) do
      {id, ""} -> get_department_by_id(id)
      _ -> get_department_by_key(key)
    end
  end

  defp resolve_department(_), do: nil

  defp get_department_by_id(id) do
    if id = RockcutApi.Ids.parse(id), do: Repo.get(Department, id)
  end

  defp current_membership_map(user) do
    user |> list_memberships() |> Map.new(fn m -> {m.department_id, m} end)
  end

  # authz-boundary: data invariant (last-owner guard)
  defp last_active_owner?(%User{is_owner: true, active: true}), do: active_owner_count() <= 1
  defp last_active_owner?(%User{}), do: false

  # Unread change-log entries for the owner: anything logged since they last
  # opened the log, excluding their own actions. Drives the nav badge.
  defp pending_owner_reviews_count(%User{} = owner) do
    since = owner.activity_seen_at || ~U[1970-01-01 00:00:00Z]

    AuditEntry
    |> where([a], a.inserted_at > ^since and (is_nil(a.actor_id) or a.actor_id != ^owner.id))
    |> Repo.aggregate(:count)
  end

  @doc "Write one audit-log entry (shows in the owner's User change log)."
  def record_audit(actor_id, target_id, action, detail \\ %{}),
    do: log_audit(actor_id, target_id, action, detail)

  defp log_audit(actor_id, target_id, action, detail) do
    %AuditEntry{}
    |> AuditEntry.changeset(%{
      actor_id: actor_id,
      target_id: target_id,
      action: action,
      detail: detail
    })
    |> Repo.insert!()
  end

  defp generate_temp_password do
    :crypto.strong_rand_bytes(9) |> Base.url_encode64(padding: false)
  end

  defp truthy(v), do: v in [true, "true"]

  defp stringify(map) when is_map(map) do
    Map.new(map, fn {k, v} -> {to_string(k), v} end)
  end
end
