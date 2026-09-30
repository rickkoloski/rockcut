defmodule RockcutApi.Accounts do
  @moduledoc """
  Identity and membership context: users, departments, and the role
  memberships that connect them. Phase 1 covers authentication and reads;
  user/role management writes are added in phase 2.
  """
  import Ecto.Query
  alias RockcutApi.Repo
  alias RockcutApi.Authz
  alias RockcutApi.Accounts.{User, Department, Membership, AuditEntry}

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

  @doc "All departments, ordered by name."
  def list_departments do
    Department |> order_by(:name) |> Repo.all()
  end

  @doc "Fetch a department by its key (e.g. \"brewery\"), or nil."
  def get_department_by_key(key) when is_binary(key) do
    Repo.get_by(Department, key: key)
  end

  def get_department!(id), do: Repo.get!(Department, id)

  def update_department(%Department{} = department, attrs) do
    department |> Department.changeset(attrs) |> Repo.update()
  end

  @doc "Minimal staff roster (active users) for schedule display — readable by anyone signed in."
  def list_roster do
    persons_query()
    |> where([u], u.active == true and u.schedulable == true)
    |> order_by([u], asc: u.schedule_order, asc: u.name, asc: u.email)
    |> preload(^@preloads)
    |> Repo.all()
    |> Enum.map(fn u ->
      %{
        id: u.id,
        name: u.name || u.email,
        departments: u.memberships |> Enum.map(& &1.department.key) |> Enum.uniq()
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
  Create a user with a temporary password and `must_reset_password: true`.
  `attrs` may include `"password"` (else one is generated) and `"memberships"`
  (a declarative list of `%{"department" => key|id, "role" => role}`), which is
  applied under `actor`'s authority. Returns `{:ok, user, temp_password}`.
  """
  def create_user(attrs, %User{} = actor) do
    attrs = stringify(attrs)
    temp_password = attrs["password"] || generate_temp_password()
    desired = attrs["memberships"] || []

    reg_attrs = %{
      "email" => attrs["email"],
      "name" => attrs["name"],
      "password" => temp_password,
      "must_reset_password" => true
    }

    result =
      Repo.transaction(fn ->
        with {:ok, user} <- %User{} |> User.registration_changeset(reg_attrs) |> Repo.insert(),
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

          case Repo.update(changeset) do
            {:ok, user} ->
              log_audit(actor.id, user.id, "user.updated", %{"fields" => Map.keys(base)})
              get_user!(user.id)

            {:error, cs} ->
              Repo.rollback(cs)
          end
      end
    end)
  end

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
      case apply_memberships(target, desired, actor) do
        {:ok, user} -> user
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
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
        log_audit(actor.id, user.id, "user.password_reset", %{})
        {:ok, get_user!(user.id), temp}

      {:error, cs} ->
        {:error, cs}
    end
  end

  @doc "Change a user's own password after verifying the current one."
  def change_password(%User{} = user, current, new) do
    if not Authz.device?(user) and Argon2.verify_pass(current, user.password_hash) do
      case user
           |> User.password_changeset(%{"password" => new, "must_reset_password" => false})
           |> Repo.update() do
        {:ok, user} -> {:ok, get_user!(user.id)}
        {:error, cs} -> {:error, cs}
      end
    else
      {:error, :invalid_current}
    end
  end

  ## User queries & capabilities

  @doc "Users visible to the actor: all for an owner; a manager's departments' members otherwise."
  def list_users_for(%User{} = actor) do
    case Authz.scope(actor, :people, :manage) |> Authz.member_ids_in() do
      [] ->
        []

      ids ->
        persons_query()
        |> only_ids(ids)
        |> order_by(:email)
        |> Repo.all()
        |> Repo.preload(@preloads)
    end
  end

  defp only_ids(query, :all), do: query
  defp only_ids(query, ids), do: where(query, [u], u.id in ^ids)

  @doc "Capabilities payload for the UI (modules, management scope, owner review count)."
  def capabilities(%User{} = user) do
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
    with {:ok, desired} <- resolve_desired(desired_raw) do
      authorized? = fn dept_id -> Authz.can?(actor, :assign, {:memberships, dept_id}) end

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

  # Resolve raw desired entries into {%Department{}, role} tuples.
  defp resolve_desired(entries) do
    Enum.reduce_while(entries, {:ok, []}, fn entry, {:ok, acc} ->
      entry = stringify(entry)
      role = entry["role"]
      dept = resolve_department(entry["department"])

      cond do
        is_nil(dept) ->
          {:halt, {:error, {:invalid_membership, "unknown department"}}}

        not dept.assignable ->
          {:halt, {:error, {:invalid_membership, "department is not assignable"}}}

        role not in @roles ->
          {:halt, {:error, {:invalid_membership, "invalid role"}}}

        true ->
          {:cont, {:ok, [{dept, role} | acc]}}
      end
    end)
  end

  defp resolve_department(%Department{} = d), do: d
  defp resolve_department(id) when is_integer(id), do: Repo.get(Department, id)

  defp resolve_department(key) when is_binary(key) do
    case Integer.parse(key) do
      {id, ""} -> Repo.get(Department, id)
      _ -> get_department_by_key(key)
    end
  end

  defp resolve_department(_), do: nil

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
