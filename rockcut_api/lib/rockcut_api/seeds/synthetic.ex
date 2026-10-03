defmodule RockcutApi.Seeds.Synthetic do
  @moduledoc """
  Fictional `@rockcut-test.com` personas + scenario data for local dev and the
  DEV server (D30). Never runs in prod — every write and every token mint goes
  through `RockcutApi.Seeds.Guard.guard!/0` first.

    * `setup/0`        — idempotent: cleans `[TEST-TEMP]` rows, restores every
                          persona to its canonical state, rebuilds `[SEED]`
                          scenario data relative to the current week.
    * `status/0`       — per-persona existence / active / password check.
    * `reset/0`        — deletes the synthetic users and everything they own,
                          then `setup/0`.
    * `cleanup_temp/0` — deletes rows agents created with a `[TEST-TEMP]` prefix.
    * `mint_token/1`   — short-lived session token for a persona (the default
                          way agents log in; see the credentials policy).

  Requires the reference seed (`priv/repo/seeds.exs`: departments + positions).
  """
  import Ecto.Query
  alias RockcutApi.Repo
  alias RockcutApi.Accounts.{User, Department, Membership}
  alias RockcutApi.Scheduling.{Shift, Position}
  alias RockcutApi.TimeOff.Request
  alias RockcutApi.Availability.Slot
  alias RockcutApi.Messaging.Message
  alias RockcutApi.Notifications.Notification
  alias RockcutApi.Seeds.{Credentials, Guard}
  alias RockcutApi.Devices.DeviceToken

  @domain "@rockcut-test.com"
  @seed_tag "[SEED]"
  @temp_tag "[TEST-TEMP]"

  @token_salt "synthetic auth"
  @token_max_age 8 * 60 * 60

  # {key, email local part, name, memberships [{dept_key, role}], user flags}
  @personas [
    {"owner", "owner", "Olivia Owner", [], %{is_owner: true}},
    {"breweryMgr", "brewery.manager", "Morgan Mash", [{"brewery", "manager"}], %{}},
    {"barMgr", "bar.manager", "Casey Tap", [{"bar", "manager"}], %{}},
    {"brewer1", "brewer1", "Jake Brewer", [{"brewery", "employee"}], %{}},
    {"brewer2", "brewer2", "Riley Wort", [{"brewery", "employee"}], %{}},
    {"bartender1", "bartender1", "Sam Pour", [{"bar", "employee"}], %{}},
    {"bartender2", "bartender2", "Alex Draft", [{"bar", "employee"}], %{}},
    {"office1", "office1", "Pat Ledger", [{"office", "employee"}], %{}},
    {"floater", "floater", "Jordan Float", [{"bar", "employee"}, {"brewery", "employee"}], %{}},
    {"newhire", "newhire", "Taylor New", [{"bar", "employee"}], %{must_reset_password: true}},
    {"inactive", "inactive", "Drew Gone", [], %{active: false}},
    {"hidden", "hidden", "Quinn Hidden", [{"office", "employee"}], %{schedulable: false}},
    {"dualMgr", "dual.manager", "Dana Dual", [{"bar", "manager"}, {"office", "manager"}], %{}},
    {"splitRole", "split.role", "Rowan Split", [{"bar", "manager"}, {"brewery", "employee"}],
     %{}},
    {"noDept", "nodept", "Nico None", [], %{}},
    {"owner2", "owner2", "Avery Owner", [], %{is_owner: true}},
    {"sales1", "sales1", "Robin Pitch", [{"sales", "employee"}], %{}}
  ]

  # Shared-device personas (D33): {key, email local part, name, home department key}.
  # Kept apart from @personas: a device has no password, no memberships, and
  # logs in only with a `dev_` tablet token (see `mint_token/1`).
  @devices [
    {"taproomDevice", "taproom.device", "Taproom tablets", "bar"}
  ]

  @device_token_name "#{"[SEED]"} Playwright tablet"

  @default_flags %{
    is_owner: false,
    active: true,
    must_reset_password: false,
    schedulable: true
  }

  @doc "Persona definitions as maps (key, email, name, memberships, flags)."
  def personas do
    Enum.map(@personas, fn {key, local, name, memberships, flags} ->
      %{
        key: key,
        email: local <> @domain,
        name: name,
        memberships: memberships,
        flags: Map.merge(@default_flags, flags)
      }
    end)
  end

  @doc "Shared-device persona definitions (D33) as maps (key, email, name, home)."
  def device_personas do
    Enum.map(@devices, fn {key, local, name, home} ->
      %{key: key, email: local <> @domain, name: name, home: home}
    end)
  end

  def device_persona?(key), do: Enum.any?(device_personas(), &(&1.key == key))

  def persona!(key) do
    Enum.find(personas(), &(&1.key == key)) ||
      raise ArgumentError,
            "unknown persona #{inspect(key)}; known: #{Enum.map_join(personas(), ", ", & &1.key)}"
  end

  def synthetic_email?(email) when is_binary(email), do: String.ends_with?(email, @domain)
  def synthetic_email?(_), do: false

  def token_salt, do: @token_salt
  def token_max_age, do: @token_max_age

  ## Setup / reset

  def setup do
    Guard.guard!()
    hash = Argon2.hash_pwd_salt(Credentials.password())
    depts = departments!()

    Repo.transaction(fn ->
      cleanup_temp()
      users = Map.new(personas(), fn p -> {p.key, upsert_persona(p, hash, depts)} end)
      devices = Map.new(device_personas(), fn d -> {d.key, upsert_device(d, depts)} end)
      prune_device_tokens()
      seed_scenario(users)
      Map.merge(users, devices)
    end)
    |> case do
      {:ok, users} -> {:ok, map_size(users)}
      other -> other
    end
  end

  def reset do
    Guard.guard!()

    Repo.transaction(fn ->
      ids = synthetic_user_ids()

      # Shifts reference users with nilify_all; delete the ones synthetic users
      # created or work so they don't linger as orphaned open shifts.
      Repo.delete_all(from(s in Shift, where: s.assignee_id in ^ids or s.created_by_id in ^ids))
      delete_tagged(@seed_tag)
      # Memberships, messages, time off, availability, notifications and push
      # subscriptions cascade (on_delete: :delete_all).
      Repo.delete_all(from(u in User, where: u.id in ^ids))
    end)

    setup()
  end

  def cleanup_temp do
    Guard.guard!()
    delete_tagged(@temp_tag)
    Repo.delete_all(from(p in Position, where: like(p.name, ^"#{@temp_tag}%")))
    # D33: devices and tablet tokens agents created (tokens, codes and channel
    # reads cascade with the device).
    Repo.delete_all(from(t in DeviceToken, where: like(t.name, ^"#{@temp_tag}%")))

    Repo.delete_all(from(u in User, where: u.kind == "device" and like(u.name, ^"#{@temp_tag}%")))

    # D34: throwaway people a spec created to change or reset a password
    # without touching a persona (sessions, memberships, audit rows cascade).
    Repo.delete_all(
      from(u in User,
        where:
          u.kind == "person" and like(u.name, ^"#{@temp_tag}%") and
            like(u.email, ^"%#{@domain}")
      )
    )

    :ok
  end

  def status do
    password =
      case Credentials.fetch() do
        {:ok, pw} -> pw
        :error -> nil
      end

    devices =
      Enum.map(device_personas(), fn d ->
        user = Repo.get_by(User, email: d.email)

        # A device never authenticates with a password (D33).
        %{
          key: d.key,
          email: d.email,
          exists: not is_nil(user),
          active: !!(user && user.active),
          authenticates: false
        }
      end)

    persons =
      Enum.map(personas(), fn p ->
        user = Repo.get_by(User, email: p.email)

        %{
          key: p.key,
          email: p.email,
          exists: not is_nil(user),
          active: !!(user && user.active),
          authenticates:
            !!(user && password && user.active && Argon2.verify_pass(password, user.password_hash))
        }
      end)

    persons ++ devices
  end

  ## Tokens

  @doc """
  A sign-in token for the persona, valid for #{div(@token_max_age, 3600)} hours. A person
  gets a real revocable `ses_` session (D34), so specs exercise the same path
  as a password sign-in; minting runs only where the guard allows.
  """
  def mint_token(key) do
    if device_persona?(key), do: mint_device_token(key), else: mint_person_token(key)
  end

  defp mint_person_token(key) do
    Guard.guard!()
    persona = persona!(key)

    case Repo.get_by(User, email: persona.email) do
      %User{active: true, email: email} = user ->
        true = synthetic_email?(email)
        {token, _row} = RockcutApi.Sessions.create(user, max_age: @token_max_age)
        token

      %User{} ->
        raise "persona #{key} is inactive; tokens are only minted for active personas"

      nil ->
        raise "persona #{key} does not exist yet; run the synthetic setup first"
    end
  end

  @doc "Tokens for every active persona: `%{key => %{email, token}}` (one call for test setup)."
  def mint_tokens do
    Guard.guard!()

    persons =
      for p <- personas(), p.flags.active, into: %{} do
        {p.key, %{email: p.email, token: mint_token(p.key)}}
      end

    devices =
      for d <- device_personas(), into: %{} do
        {d.key, %{email: d.email, token: mint_token(d.key)}}
      end

    Map.merge(persons, devices)
  end

  # A device persona logs in like a real tablet: a `dev_` token row named
  # "[SEED] Playwright tablet" (lead decision 2). No expiry of its own, so
  # rows older than #{div(@token_max_age, 3600)} hours are deleted at each mint and setup.
  @doc """
  A real pairing code for a device persona, generated as the `owner` persona,
  so a human can try "Set up as a shared device" on DEV or locally. 10 minutes, single use.
  """
  def pairing_code(key \\ "taproomDevice") do
    Guard.guard!()

    d =
      Enum.find(device_personas(), &(&1.key == key)) ||
        raise ArgumentError, "unknown device persona #{inspect(key)}"

    device = Repo.get_by!(User, email: d.email)
    owner = Repo.get_by!(User, email: persona!("owner").email)
    {:ok, code, _expires_at} = RockcutApi.Devices.create_pairing_code(device, owner)
    code
  end

  defp mint_device_token(key) do
    Guard.guard!()
    d = Enum.find(device_personas(), &(&1.key == key))

    case Repo.get_by(User, email: d.email) do
      %User{active: true, email: email} = device ->
        true = synthetic_email?(email)
        prune_device_tokens()
        {token, _row} = RockcutApi.Devices.issue_token(device, @device_token_name, nil)
        token

      %User{} ->
        raise "device persona #{key} is inactive; run the synthetic setup first"

      nil ->
        raise "device persona #{key} does not exist yet; run the synthetic setup first"
    end
  end

  defp prune_device_tokens do
    cutoff = DateTime.add(now(), -@token_max_age)
    device_ids = from(u in User, where: like(u.email, ^"%#{@domain}"), select: u.id)

    Repo.delete_all(
      from(t in DeviceToken,
        where:
          t.name == ^@device_token_name and t.inserted_at < ^cutoff and
            t.user_id in subquery(device_ids)
      )
    )
  end

  defp upsert_device(d, depts) do
    home = Map.fetch!(depts, d.home)

    case Repo.get_by(User, email: d.email) do
      nil ->
        device =
          %{"name" => d.name, "home_department_id" => home.id}
          |> User.device_create_changeset()
          |> Ecto.Changeset.put_change(:email, d.email)
          |> Repo.insert!()

        device

      %User{} = existing ->
        # Heal drift: canonical name, home and active; never a person's fields.
        existing
        |> Ecto.Changeset.change(%{
          name: d.name,
          home_department_id: home.id,
          active: true,
          is_owner: false,
          schedulable: false,
          must_reset_password: false,
          kind: "device"
        })
        |> Repo.update!()
        |> tap(fn u -> Repo.delete_all(from(m in Membership, where: m.user_id == ^u.id)) end)
    end
  end

  ## Personas

  defp upsert_persona(p, hash, depts) do
    now = now()
    attrs = Map.merge(p.flags, %{name: p.name, password_hash: hash})

    user =
      case Repo.get_by(User, email: p.email) do
        nil ->
          Repo.insert!(
            struct(User, Map.merge(attrs, %{email: p.email, inserted_at: now, updated_at: now}))
          )

        %User{} = existing ->
          existing |> Ecto.Changeset.change(attrs) |> Repo.update!()
      end

    sync_memberships(user, p.memberships, depts)
    user
  end

  defp sync_memberships(user, wanted, depts) do
    wanted_by_dept = Map.new(wanted, fn {key, role} -> {Map.fetch!(depts, key).id, role} end)
    current = Repo.all(from(m in Membership, where: m.user_id == ^user.id))

    for m <- current do
      case Map.fetch(wanted_by_dept, m.department_id) do
        :error -> Repo.delete!(m)
        {:ok, role} when role == m.role -> :ok
        {:ok, role} -> m |> Ecto.Changeset.change(role: role) |> Repo.update!()
      end
    end

    have = MapSet.new(current, & &1.department_id)
    now = now()

    for {dept_id, role} <- wanted_by_dept, not MapSet.member?(have, dept_id) do
      Repo.insert!(%Membership{
        user_id: user.id,
        department_id: dept_id,
        role: role,
        inserted_at: now,
        updated_at: now
      })
    end
  end

  defp departments! do
    depts = Repo.all(Department) |> Map.new(&{&1.key, &1})

    needed =
      (personas() |> Enum.flat_map(& &1.memberships) |> Enum.map(&elem(&1, 0))) ++
        Enum.map(device_personas(), & &1.home)

    case Enum.reject(Enum.uniq(needed), &Map.has_key?(depts, &1)) do
      [] -> depts
      missing -> raise "missing departments #{inspect(missing)}; run the reference seed first"
    end
  end

  defp synthetic_user_ids do
    Repo.all(from(u in User, where: like(u.email, ^"%#{@domain}"), select: u.id))
  end

  ## Scenario data (rebuilt each setup, relative to the current week)

  defp seed_scenario(u) do
    delete_tagged(@seed_tag)
    Repo.delete_all(from(n in Notification, where: n.event == "seed.welcome"))

    pos = Repo.all(Position) |> Map.new(&{&1.name, &1})
    monday = Date.beginning_of_week(Date.utc_today())
    owner = u["owner"]

    # {week offset, day offset, position, assignee key | nil, start hour UTC, hours, status}
    shifts = [
      {0, 0, "Brewer", "brewer1", 13, 8, "published"},
      {0, 2, "Brewer", "brewer1", 13, 8, "published"},
      {0, 4, "Brewer", "brewer1", 13, 8, "published"},
      {0, 1, "Brewer", "brewer2", 13, 8, "published"},
      {0, 3, "Brewer", "brewer2", 13, 8, "published"},
      {0, 0, "Bar-open", "bartender1", 14, 8, "published"},
      {0, 1, "Bar-open", "bartender1", 14, 8, "published"},
      {0, 2, "Bar-open", "bartender1", 14, 8, "published"},
      {0, 3, "Bar-close", "bartender2", 23, 8, "published"},
      {0, 4, "Bar-close", "bartender2", 23, 8, "published"},
      {0, 5, "Bar-close", "bartender2", 23, 8, "published"},
      # floater double-booked on Tuesday (D24 conflict warning)
      {0, 1, "Brewer", "floater", 13, 8, "published"},
      {0, 1, "Bar-mid", "floater", 18, 8, "published"},
      {0, 0, "Office", "office1", 15, 8, "published"},
      {0, 2, "Office", "office1", 15, 8, "published"},
      {0, 2, "Sales", "sales1", 15, 8, "published"},
      # two open shifts (published, unassigned)
      {0, 5, "Bar-mid", nil, 18, 8, "published"},
      {0, 5, "Brewer", nil, 13, 8, "published"},
      # next week: draft
      {1, 0, "Brewer", "brewer1", 13, 8, "draft"},
      {1, 1, "Brewer", "brewer2", 13, 8, "draft"},
      {1, 0, "Bar-open", "bartender1", 14, 8, "draft"},
      {1, 3, "Bar-close", "bartender2", 23, 8, "draft"}
    ]

    now = now()

    for {week, day, pos_name, who, hour, hours, status} <- shifts do
      position = Map.fetch!(pos, pos_name)
      starts = at(monday, week * 7 + day, hour)

      Repo.insert!(%Shift{
        department_id: position.department_id,
        position_id: position.id,
        assignee_id: who && u[who].id,
        created_by_id: owner.id,
        starts_at: starts,
        ends_at: DateTime.add(starts, hours * 3600),
        status: status,
        notes: "#{@seed_tag} #{pos_name}",
        inserted_at: now,
        updated_at: now
      })
    end

    # brewer1: one pending all-day request next Friday, one approved partial-day this Thursday
    Repo.insert!(%Request{
      user_id: u["brewer1"].id,
      type: "pto",
      all_day: true,
      starts_at: at(monday, 11, 0),
      ends_at: at(monday, 12, 0),
      status: "pending",
      note: "#{@seed_tag} Long weekend",
      inserted_at: now,
      updated_at: now
    })

    Repo.insert!(%Request{
      user_id: u["brewer1"].id,
      type: "personal",
      all_day: false,
      starts_at: at(monday, 3, 20),
      ends_at: at(monday, 3, 23),
      status: "approved",
      reviewed_by_id: u["breweryMgr"].id,
      reviewed_at: now,
      note: "#{@seed_tag} Appointment",
      inserted_at: now,
      updated_at: now
    })

    # bartender1: unavailable Sundays, prefers Monday afternoons (Denver wall clock)
    Repo.insert!(%Slot{
      user_id: u["bartender1"].id,
      weekday: 0,
      kind: "unavailable",
      all_day: true,
      note: "#{@seed_tag} Family day",
      inserted_at: now,
      updated_at: now
    })

    Repo.insert!(%Slot{
      user_id: u["bartender1"].id,
      weekday: 1,
      kind: "preferred",
      all_day: false,
      start_time: ~T[12:00:00],
      end_time: ~T[18:00:00],
      note: "#{@seed_tag} Afternoons",
      inserted_at: now,
      updated_at: now
    })

    for {channel, who, body} <- [
          {"all", "owner", "Welcome to the DEV server — everything here is fictional."},
          {"all", "breweryMgr", "Brew day schedule for this week is published."},
          {"dept:bar", "barMgr", "Reminder: close checklist is on the back bar."},
          {"dept:bar", "bartender1", "Can someone cover Saturday mid?"}
        ] do
      Repo.insert!(%Message{
        channel_key: channel,
        user_id: u[who].id,
        body: "#{@seed_tag} #{body}",
        inserted_at: now,
        updated_at: now
      })
    end

    # One notification per persona so the bell has something in it (no push/email).
    for {_key, user} <- u do
      Repo.insert!(%Notification{
        user_id: user.id,
        event: "seed.welcome",
        title: "Welcome to Rockcut DEV",
        body: "You're signed in as a fictional test persona.",
        data: %{},
        inserted_at: now,
        updated_at: now
      })
    end

    :ok
  end

  defp delete_tagged(tag) do
    pattern = "#{tag}%"
    Repo.delete_all(from(s in Shift, where: like(s.notes, ^pattern)))
    Repo.delete_all(from(r in Request, where: like(r.note, ^pattern)))
    Repo.delete_all(from(s in Slot, where: like(s.note, ^pattern)))
    Repo.delete_all(from(m in Message, where: like(m.body, ^pattern)))
  end

  defp at(monday, day_offset, hour) do
    date = Date.add(monday, day_offset)
    {:ok, dt} = DateTime.new(date, Time.new!(rem(hour, 24), 0, 0), "Etc/UTC")
    if hour >= 24, do: DateTime.add(dt, 86_400), else: dt
  end

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second)
end
