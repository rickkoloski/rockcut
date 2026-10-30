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

  D37: `setup/0` also restores the staff codes of the personas listed in
  `SYNTHETIC_STAFF_CODES` (a secret, like `SEED_PASSWORD`) and clears every
  other persona's code; with the variable unset it leaves codes alone. The
  `[SEED]` Buy-a-Beer Board entries carry the tag on Bought by.

  D38: `[SEED]` Brewery board tasks (tag on the title) relative to today,
  Daily checks for yesterday (3) and today (1), and a `[SEED]` all-day Brewery
  event this week (tag on its notes). `reset/0` also deletes every Daily check
  and restores the four default Daily items. D39: three `[SEED]` recurring
  tasks (Keg Wash weekly, Glycol check monthly, Calibrate pH meter
  quarterly); `[SEED]` and `[TEST-TEMP]` series go with their occurrences.
  D41: `[SEED]` Taproom tasks (two for `bartender1`, one unassigned, one open
  2 days ago, one on Future) and one Office task; Sales starts empty, and only
  the Brewery has Daily items. Tagged tasks, series and Daily items go from
  every board; `reset/0` also deletes the other boards' Daily items.
  D46: tanks FV1–FV7 and Serving 1–2 (restored to their canonical fields and
  order, each setup; D52: Serving 1–4 abbreviated SV1–SV4), their out-of-service periods rebuilt (Serving 2: one
  coming up and one past), and three `[SEED]` process templates.
  `[TEST-TEMP]` tanks, templates, step types and phases are cleaned up.
  D48: tanks FV8–FV9 and Serving 3–4 for a `[SEED]` batch with an added
  filter and a `[SEED]` split batch (one part stays), a clean mark on
  Serving 3 and a dirty one on Serving 4; `[TEST-TEMP]` parts and marks
  are cleaned up.
  D49: a Clean not sanitized mark on FV1 (Enos fills it later: the soft
  flag), a `[SEED]` CIP - no sani on FV7 tomorrow, a pencilled Oktoberfest
  (X1) in Unassigned, and the Brewery board's linked tasks for every seeded
  step (`TaskLink.sync!/1`), Altruism P1's with the Planned batch pill.
    * `mint_token/1`   — short-lived session token for a persona (the default
                          way agents log in; see the credentials policy).

  Requires the reference seed (`priv/repo/seeds.exs`: departments + positions).
  """
  import Ecto.Query
  require Logger
  alias RockcutApi.{Repo, StaffCodes}
  alias RockcutApi.Accounts.{User, Department, Membership}
  alias RockcutApi.Scheduling.{Shift, Position}
  alias RockcutApi.TimeOff.Request
  alias RockcutApi.Availability.Slot
  alias RockcutApi.Messaging.Message
  alias RockcutApi.Notifications.Notification
  alias RockcutApi.Seeds.{Credentials, Guard}
  alias RockcutApi.Devices.DeviceToken
  alias RockcutApi.Scheduling.{Recurrence, ScheduleEvent, ScheduleEventSeries}
  alias RockcutApi.Brewing.{Batch, Brand, BrewTurn, Recipe}
  alias RockcutApi.BeerBoard.Entry
  alias RockcutApi.Tasks
  alias RockcutApi.Tasks.{DailyCheck, DailyItem, Task, TaskSeries}
  alias RockcutApi.Production

  alias RockcutApi.Production.{
    BatchChanges,
    BatchVessel,
    Batches,
    Cips,
    ConditionMark,
    ConditionMarks,
    FlagSignoff,
    Outage,
    Phase,
    Schedule,
    Signoffs,
    Splits,
    Step,
    StepType,
    Tank,
    TaskLink,
    Template,
    TemplateStep,
    UndoRecord
  }

  @domain "@rockcut-test.com"
  @seed_tag "[SEED]"
  @temp_tag "[TEST-TEMP]"

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
    {"taproomDevice", "taproom.device", "Taproom tablets", "bar"},
    # D40: the brewhouse tablet, on the Brewery's task board.
    {"breweryDevice", "brewery.device", "Brewhouse tablet", "brewery"}
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

  ## Setup / reset

  @doc """
  Upserts the personas and rebuilds the scenario data around `today`'s week.
  `today` defaults to the Colorado date (Fly runs in UTC), so an evening setup
  in Colorado doesn't seed next week.
  """
  def setup(today \\ Tasks.today()) do
    Guard.guard!()
    hash = Argon2.hash_pwd_salt(Credentials.password())
    depts = departments!()

    Repo.transaction(fn ->
      cleanup_temp()
      users = Map.new(personas(), fn p -> {p.key, upsert_persona(p, hash, depts)} end)
      devices = Map.new(device_personas(), fn d -> {d.key, upsert_device(d, depts)} end)
      sync_staff_codes(users)
      prune_device_tokens()
      seed_scenario(users, today)
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
      # D38: every Daily check, and the Daily card back to its four items.
      # D41: the other boards start with none.
      Repo.delete_all(DailyCheck)
      restore_daily_items()
      Repo.delete_all(from(i in DailyItem, where: i.department_id != ^brewery_id()))
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

    # D36-F (task 3941): schedule events and series (D32) agents created, with
    # the "[TEST-TEMP]" or bare "TEST-TEMP" title prefix seen on DEV.
    tag = "#{@temp_tag}%"

    series_ids =
      Repo.all(
        from(s in ScheduleEventSeries,
          where: like(s.title, ^tag) or like(s.title, "TEST-TEMP%"),
          select: s.id
        )
      )

    Repo.delete_all(
      from(e in ScheduleEvent,
        where: like(e.title, ^tag) or like(e.title, "TEST-TEMP%") or e.series_id in ^series_ids
      )
    )

    Repo.delete_all(from(s in ScheduleEventSeries, where: s.id in ^series_ids))

    # Brands agents created, with what hangs off them (recipes and batches
    # restrict a brand's delete; brew turns restrict a recipe's).
    brand_ids = Repo.all(from(b in Brand, where: like(b.name, ^"#{@temp_tag}%"), select: b.id))
    recipe_ids = Repo.all(from(r in Recipe, where: r.brand_id in ^brand_ids, select: r.id))
    Repo.delete_all(from(t in BrewTurn, where: t.recipe_id in ^recipe_ids))
    # D48: split parts first (the parent restricts, row by row in SQLite).
    Repo.delete_all(
      from(b in Batch,
        where:
          b.split_parent_id in subquery(
            from(p in Batch, where: p.brand_id in ^brand_ids, select: p.id)
          )
      )
    )

    Repo.delete_all(from(b in Batch, where: b.brand_id in ^brand_ids))
    Repo.delete_all(from(r in Recipe, where: r.id in ^recipe_ids))
    Repo.delete_all(from(b in Brand, where: b.id in ^brand_ids))

    # D46: production setup rows agents created. Entries that use a
    # temporary step type or phase go first (template steps restrict both);
    # a step type's starts phase nilifies itself.
    temp_types = from(t in StepType, where: like(t.name, ^tag), select: t.id)
    temp_phases = from(p in Phase, where: like(p.name, ^tag), select: p.id)
    Repo.delete_all(from(t in Template, where: like(t.name, ^tag)))

    Repo.delete_all(
      from(s in TemplateStep,
        where: s.step_type_id in subquery(temp_types) or s.phase_id in subquery(temp_phases)
      )
    )

    Repo.delete_all(from(t in StepType, where: like(t.name, ^tag)))
    Repo.delete_all(from(p in Phase, where: like(p.name, ^tag)))

    # D47: schedule rows agents made: batches tagged on notes (brands tagged
    # went above; steps, vessels and links cascade), standalone CIPs on
    # temporary tanks or tagged, and the sign-offs of flags about them.
    temp_batch_ids = Repo.all(from(b in Batch, where: like(b.notes, ^tag), select: b.id))

    # D48: parts first (the parent restricts), then tagged clean / dirty marks.
    Repo.delete_all(from(b in Batch, where: b.split_parent_id in ^temp_batch_ids))
    Repo.delete_all(from(b in Batch, where: b.id in ^temp_batch_ids))
    Repo.delete_all(from(m in ConditionMark, where: like(m.note, ^tag)))
    temp_tanks = from(t in Tank, where: like(t.name, ^tag), select: t.id)

    Repo.delete_all(
      from(s in Step,
        where: is_nil(s.batch_id) and (s.tank_id in subquery(temp_tanks) or like(s.notes, ^tag))
      )
    )

    delete_orphan_signoffs()
    Repo.delete_all(from(t in Tank, where: like(t.name, ^tag)))

    # D49: the Brewery board's linked tasks went with their steps; the rest
    # may have changed P-numbers.
    TaskLink.sync!()

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

  # A sign-off whose flag names a batch that's gone (keys hold "batchId.vessel").
  defp delete_orphan_signoffs do
    live = MapSet.new(Repo.all(from(b in Batch, select: b.id)))

    for s <- Repo.all(FlagSignoff),
        ids =
          Regex.scan(~r/(?:^|:)(\d+)\.\d+/, s.flag_key)
          |> Enum.map(fn [_, id] -> String.to_integer(id) end),
        Enum.any?(ids, &(not MapSet.member?(live, &1))),
        do: Repo.delete!(s)

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

  @spares_persona "bartender2"
  @spare_count 40

  @doc """
  Tokens for every active persona: `%{key => %{email, token}}` (one call for
  test setup), plus `"spares"`: #{@spare_count} extra sessions of `#{@spares_persona}`
  for specs that sign a session out (D34). Each spec claims its own, so
  revoking it never signs a shared persona token out, and no password hash
  is spent (Argon2 on DEV's one vCPU starved the suite; DEV fix cycle 2).
  """
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

    spares = %{
      email: persona!(@spares_persona).email,
      tokens: for(_ <- 1..@spare_count, do: mint_token(@spares_persona))
    }

    persons |> Map.merge(devices) |> Map.put("spares", spares)
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

  # D37: each listed persona gets its code back; every other persona's code is
  # cleared (leftovers from manual testing). All persona codes are cleared
  # first, so swapping two personas' codes doesn't collide.
  defp sync_staff_codes(users) do
    case Credentials.staff_codes() do
      :unset ->
        Logger.warning("SYNTHETIC_STAFF_CODES is not set: persona staff codes left as they are")
        :skipped

      {:ok, codes} ->
        unknown = Map.keys(codes) -- Map.keys(users)

        if unknown != [],
          do:
            raise(
              ArgumentError,
              "SYNTHETIC_STAFF_CODES names unknown personas: #{Enum.join(unknown, ", ")}"
            )

        ineligible = for {key, _} <- codes, not StaffCodes.eligible?(users[key]), do: key

        if ineligible != [],
          do:
            raise(
              ArgumentError,
              "SYNTHETIC_STAFF_CODES lists personas who can't hold a staff code " <>
                "(inactive, or in no department): #{Enum.join(ineligible, ", ")}"
            )

        for {_key, user} <- users, do: StaffCodes.seed_clear!(user)

        for {key, code} <- codes do
          case StaffCodes.seed_put(users[key], code) do
            {:ok, _} ->
              :ok

            {:error, :code_in_use} ->
              raise ArgumentError,
                    "SYNTHETIC_STAFF_CODES: #{key}'s code is already held by someone who isn't a persona"
          end
        end

        :ok
    end
  end

  defp synthetic_user_ids do
    Repo.all(from(u in User, where: like(u.email, ^"%#{@domain}"), select: u.id))
  end

  ## Scenario data (rebuilt each setup, relative to the current week)

  defp seed_scenario(u, today) do
    delete_tagged(@seed_tag)
    Repo.delete_all(from(n in Notification, where: n.event == "seed.welcome"))

    pos = Repo.all(Position) |> Map.new(&{&1.name, &1})
    monday = Date.beginning_of_week(today)
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

    # D37 Buy-a-Beer Board: one entry with 1 beer left, a For-name pair (an
    # import duplicate group), and a few ordinary lines. The [SEED] tag is on
    # Bought by. No change-log rows: events are history and never cleaned up.
    # {for, bought by, beers, days since moved off, imported?}
    board = [
      {"Morgan Hill", "Lee", 1, 20, false},
      {"Riley Stone", "Chris", 3, 12, false},
      {"Riley Stone", "Dana", 2, 5, false},
      {"Avery Lake", "Kim", 5, 9, true},
      {"Jesse Park", "Bo", 4, 2, false}
    ]

    for {recipient, purchaser, beers, days_ago, imported?} <- board do
      moved_off = DateTime.add(now, -days_ago * 86_400)

      Repo.insert!(%Entry{
        recipient_name: recipient,
        purchaser_name: "#{@seed_tag} #{purchaser}",
        beers_remaining: beers,
        moved_off_board_at: moved_off,
        imported_at: if(imported?, do: DateTime.add(moved_off, 3_600)),
        created_by_id: u["barMgr"].id
      })
    end

    seed_brewery_board(u, monday, today, now)
    seed_other_boards(u, today, now)
    seed_production(u, today)

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

    # D37: board entries tagged on For or Bought by. Their change-log rows stay
    # (history, harmless).
    Repo.delete_all(
      from(e in Entry,
        where: like(e.recipient_name, ^pattern) or like(e.purchaser_name, ^pattern)
      )
    )

    # D38: board tasks tagged on the title and Daily items on the name (their
    # checks cascade), then the lists close up. Change-log rows stay, as D37.
    # The [SEED] event is tagged on its notes.
    Repo.delete_all(from(e in ScheduleEvent, where: like(e.notes, ^pattern)))
    # D39: recurring task series tagged on the title, with every occurrence
    # (including ones since retitled).
    series_ids = Repo.all(from(s in TaskSeries, where: like(s.title, ^pattern), select: s.id))

    Repo.delete_all(from(t in Task, where: like(t.title, ^pattern) or t.series_id in ^series_ids))

    Repo.delete_all(from(s in TaskSeries, where: s.id in ^series_ids))
    Repo.delete_all(from(i in DailyItem, where: like(i.name, ^pattern)))
    for dept <- Repo.all(Department), do: Tasks.compact_lists(dept)
  end

  ## Production setup (D46)

  # {name, kind, capacity bbl, location}, in display order.
  @tanks [
    {"FV1", "unitank", 30, "brewhouse"},
    {"FV2", "unitank", 20, "brewhouse"},
    {"FV3", "unitank", 20, "brewhouse"},
    {"FV4", "unitank", 30, "brewhouse"},
    {"FV5", "unitank", 20, "brewhouse"},
    {"FV6", "unitank", 20, "brewhouse"},
    {"FV7", "unitank", 30, "brewhouse"},
    # D48: the split and added-filter batches and the marks use these.
    {"FV8", "unitank", 20, "brewhouse"},
    {"FV9", "unitank", 20, "brewhouse"},
    {"Serving 1", "serving", 30, "walk_in"},
    {"Serving 2", "serving", 30, "walk_in"},
    {"Serving 3", "serving", 30, "walk_in"},
    {"Serving 4", "serving", 30, "walk_in"}
  ]

  # D52: the Gantt's names-only column shows these; the FV tanks are short already.
  @tank_abbreviations %{
    "Serving 1" => "SV1",
    "Serving 2" => "SV2",
    "Serving 3" => "SV3",
    "Serving 4" => "SV4"
  }

  # {tank, first day, last day (offsets from today), reason}
  @outages [
    {"Serving 2", 7, 13, "Replace door gasket"},
    {"Serving 2", -30, -28, "Pressure relief valve"}
  ]

  @diacetyl_notes "Forced test: hold a sample at 140°F for 20 minutes, cool it, then smell for butter. Crash only if clean."

  # The mockup's templates. Each entry: {key, type name | {:marker, phase},
  # day, opts}; opts: vessel, temperature, phase, notes, after
  # ([{key, answer}]). `{:ramp, key, first day, start, target, change, after}`
  # adds a Set temp ramp whose steps are `key1`, `key2`, … and `key` (the
  # last). Brew day comes with the template; `{:brew, temperature}` sets its
  # starting temperature.
  defp seed_templates do
    ale = fn pdh, amylo, fdh, ramp, cond ->
      [
        {:brew, 68},
        {:lag, {:marker, "Lag"}, 1, after: [brew: "move_all"]},
        {:ferm, {:marker, "Fermentation"}, 2, after: [lag: "move_all"]},
        {:pdh, "PDH", pdh, after: [brew: "move_all"]}
      ] ++
        if(amylo, do: [{:amylo, "Amylo", amylo, after: [brew: "move_all"]}], else: []) ++
        [
          {:fdh, "FDH", fdh, after: [brew: "move_all"]},
          {:ramp, :crash, ramp, 58, 32, 10, [fdh: "move_all"]},
          {:cond, {:marker, "Conditioning"}, cond, after: [crash: "move_all"]},
          {:carb, "Carb", cond + 1, after: [cond: "move_all"]},
          {:pack, "Package", cond + 3, after: [carb: "move_only"]},
          {:cip, "CIP & Sanitize", cond + 3, after: [pack: "move_all"]}
        ]
    end

    lager = [
      {:brew, 50},
      {:lag, {:marker, "Lag"}, 1, after: [brew: "move_all"]},
      {:ferm, {:marker, "Fermentation"}, 2, after: [lag: "move_all"]},
      {:dr, "Set temp", 12, temperature: 65, phase: "Diacetyl rest", after: [brew: "move_all"]},
      {:dt, "Diacetyl test", 15, notes: @diacetyl_notes, after: [dr: "move_all"]},
      {:c1, "Set temp", 16, temperature: 40, phase: "Crash", after: [dt: "move_all"]},
      {:lagm, {:marker, "Lagering"}, 17, after: [c1: "move_all"]},
      {:c2, "Set temp", 31, temperature: 30, phase: "Crash", after: [lagm: "move_all"]},
      {:cond, {:marker, "Conditioning"}, 33, after: [c2: "move_all"]},
      {:xfer, "Transfer", 35, vessel: 1, after: [cond: "move_all"]},
      {:carb, "Carb", 36, vessel: 1, after: [xfer: "move_all"]},
      {:cond2, {:marker, "Conditioning"}, 38, vessel: 1, after: [carb: "move_all"]},
      {:pack, "Package", 40, vessel: 1, after: [cond2: "move_only"]},
      {:cip, "CIP & Sanitize", 40, vessel: 1, after: [pack: "move_all"]}
    ]

    [
      {"#{@seed_tag} Standard ale", ale.(7, nil, 13, 18, 22)},
      {"#{@seed_tag} Hazy with AMG", ale.(5, 9, 11, 16, 20)},
      {"#{@seed_tag} Lager with transfer", lager}
    ]
  end

  defp seed_production(u, today) do
    seed_tanks(today)

    Repo.delete_all(from(t in Template, where: like(t.name, ^"#{@seed_tag}%")))
    ids = for {name, entries} <- seed_templates(), do: build_template(name, entries).id

    # The [SEED] templates first, then whatever else is active.
    others =
      Production.list_templates()
      |> Enum.filter(&(is_nil(&1.retired_at) and &1.id not in ids))
      |> Enum.map(& &1.id)

    {:ok, _} = Production.reorder_templates(ids ++ others)
    seed_batches(u, today)
    :ok
  end

  ## Production schedule (D47)

  # {key, brand, template, brew day (offset from today), tanks per vessel,
  # number | nil (planned), steps done through (offset), opts}. Every typed
  # step due on or before "done through" is checked off on its day.
  @batches [
    # P49: brewed 18 days ago, Fermentation, 68°, "Set temp - 58°" due today.
    {:crusher, "Crusher", "Standard ale", -18, ["FV4"], "42", -1,
     assign: [{"Set temp - 58°", "brewer1"}]},
    # P50: its 32° step was due yesterday.
    {:enos41, "Enos", "Standard ale", -22, ["FV5"], "41", -2, []},
    {:galactic, "Galactic", "Hazy with AMG", -12, ["FV2"], "40", -1,
     assign: [{"Set temp - 58°", "brewer2"}]},
    # Transferred from FV7 into Serving 2 two days ago.
    {:fest, "Fest", "Lager with transfer", -37, ["FV7", "Serving 2"], "38", -1, []},
    # P51: emptied (packaged) 8 days ago from Serving 1, its CIP removed: dirty, no CIP planned.
    {:crusher43, "Crusher", "Lager with transfer", -48, ["FV6", "Serving 1"], "43", -1,
     drop_cip: 1},
    # P36: Altruism P1, then a later planned batch.
    {:altruism, "Altruism", "Standard ale", 2, ["FV3"], nil, nil,
     assign: [{"Brew day", "brewer2"}]},
    {:enos, "Enos", "Lager with transfer", 9, ["FV1", nil], nil, nil, volume: 35},
    # D48: a Filter added in 3 days into Serving 4 (marked dirty: flagged).
    {:fest37, "Fest", "Standard ale", -14, ["FV9"], "37", -1, filter: {3, "Serving 4"}},
    # D48: split in 4 days, #39.1 stays in FV8, #39.2 to Serving 3 (marked clean).
    {:altruism39, "Altruism", "Standard ale", -10, ["FV8"], "39", -1,
     split: {4, [{:stays, 10}, {"Serving 3", 10}]}},
    # D49 (P130): pencilled in, Unassigned: X1, no board tasks.
    {:oktoberfest, "Oktoberfest", "Lager with transfer", 20, [nil, nil], nil, nil,
     pencilled: true}
  ]

  # D48: {tank, state, day (offset from today), note}, marked by brewer1.
  @condition_marks [
    {"Serving 3", "clean", -2, "Hosed and sanitized after the gasket job"},
    {"Serving 4", "dirty", -1, "Valve leaked; needs a CIP"},
    # D49 §3.12a: CIP'd, not sanitized (Enos fills FV1 later: the soft flag).
    {"FV1", "cleaned", -1, "CIP'd after the gasket job, not sanitized yet"}
  ]

  # D49 §3.12a: standalone CIPs {tank, variant, day (offset from today)}.
  @cips [
    {"FV7", "no_sani", 1}
  ]

  # Plan decision 2: batches not on the schedule (the D1-era rows) go, with
  # their brew turns and log entries (cascade), so DEV matches prod after
  # the clean-up. Then the [SEED] batches (tagged on notes), rebuilt around
  # today, and one signed-off flag (Enos is bigger than FV1).
  defp seed_batches(u, today) do
    Repo.delete_all(
      from(b in Batch, where: b.id not in subquery(from(v in BatchVessel, select: v.batch_id)))
    )

    # Parts before their parents (D48: the parent restricts).
    seeded = from(b in Batch, where: like(b.notes, ^"#{@seed_tag}%"))
    Repo.delete_all(from(b in seeded, where: not is_nil(b.split_parent_id)))
    Repo.delete_all(from(b in seeded, where: is_nil(b.split_parent_id)))

    Repo.delete_all(
      from(s in Step, where: is_nil(s.batch_id) and like(s.notes, ^"#{@seed_tag}%"))
    )

    Repo.delete_all(FlagSignoff)
    Repo.delete_all(UndoRecord)

    tanks = Map.new(Repo.all(from(t in Tank, where: is_nil(t.retired_at))), &{&1.name, &1.id})
    templates = Map.new(Repo.all(Template), &{&1.name, &1.id})

    batches =
      for {key, brand, template, brew, vessels, number, done_through, opts} <- @batches,
          into: %{} do
        batch =
          seed_batch(
            brand!(brand),
            templates["#{@seed_tag} #{template}"],
            Date.add(today, brew),
            Enum.map(vessels, &(&1 && tanks[&1])),
            opts
          )

        if done_through, do: check_off_through(batch, Date.add(today, done_through), u["brewer1"])

        if number do
          last_exit_done =
            Repo.exists?(
              from(s in Step,
                join: t in StepType,
                on: t.id == s.step_type_id,
                where:
                  s.batch_id == ^batch.id and t.behavior == "package" and not is_nil(s.done_on)
              )
            )

          batch
          |> Ecto.Changeset.change(
            batch_number: number,
            status: if(last_exit_done, do: "completed", else: "fermenting")
          )
          |> Repo.update!()
        end

        if k = opts[:drop_cip] do
          cip_types = from(t in StepType, where: t.behavior == "cip", select: t.id)

          Repo.delete_all(
            from(s in Step,
              where:
                s.batch_id == ^batch.id and s.vessel_index == ^k and
                  s.step_type_id in subquery(cip_types)
            )
          )
        end

        for {name, persona} <- Keyword.get(opts, :assign, []) do
          step = batch |> batch_steps() |> Enum.find(&(Production.Steps.name(&1) == name))
          step |> Ecto.Changeset.change(assignee_id: u[persona].id) |> Repo.update!()
        end

        with {day, tank} <- opts[:filter] do
          {:ok, _} =
            BatchChanges.add_transfer(Repo.get!(Batch, batch.id), %{
              "step_type_id" => Repo.get_by!(StepType, name: "Filter").id,
              "due_on" => Date.add(today, day),
              "tank_id" => tanks[tank]
            })
        end

        with {day, parts} <- opts[:split] do
          {:ok, _} =
            Splits.split(Repo.get!(Batch, batch.id), %{
              "due_on" => Date.add(today, day),
              "parts" =>
                Enum.map(parts, fn
                  {:stays, v} -> %{"stays" => true, "volume_bbl" => v}
                  {tank, v} -> %{"tank_id" => tanks[tank], "volume_bbl" => v}
                end)
            })
        end

        {key, batch}
      end

    seed_condition_marks(u, today, tanks)

    for {tank, method, day} <- @cips do
      {:ok, _} =
        Cips.create(
          %{
            "tank_id" => tanks[tank],
            "due_on" => Date.to_iso8601(Date.add(today, day)),
            "cip_method" => method,
            "notes" => "#{@seed_tag} Rinse and caustic only"
          },
          u["brewer1"],
          today
        )
    end

    # One signed-off flag: Enos (35 bbl) is bigger than FV1 (30 bbl).
    {:ok, sched} = Schedule.load(Date.add(today, -7), Date.add(today, 84), today)
    enos = batches[:enos]

    case Enum.find(sched.flags, &(&1.kind == "too_big" and enos.id in &1.batch_ids)) do
      nil ->
        :ok

      flag ->
        {:ok, _} =
          Signoffs.sign_off(
            %{
              "key" => flag.key,
              "signature" => flag.signature,
              "note" => "We'll top up FV1 from the second turn."
            },
            u["brewer1"]
          )
    end

    # D49 §3.12: every seeded step's task on the Brewery board, the done
    # ones too (as if they'd been on the board all along).
    TaskLink.sync!(Repo.all(from(s in Step, select: s.id)))
    # The last setup's linked tasks went with their batches (a cascade, so
    # their days didn't close up): the same positions every setup.
    Tasks.compact_lists(Repo.get_by!(Department, key: "brewery"))
    :ok
  end

  # D48: the seeded tanks' marks start over each setup.
  defp seed_condition_marks(u, today, tanks) do
    seeded_tanks = for {name, _, _, _} <- @tanks, do: tanks[name]
    Repo.delete_all(from(m in ConditionMark, where: m.tank_id in ^seeded_tanks))

    for {tank, state, day, note} <- @condition_marks do
      {:ok, _} =
        ConditionMarks.create(
          Repo.get!(Tank, tanks[tank]),
          %{
            "state" => state,
            "marked_on" => Date.add(today, day),
            "note" => "#{@seed_tag} #{note}"
          },
          u["brewer1"],
          today
        )
    end
  end

  defp seed_batch(brand, template_id, brew_on, tank_ids, opts) do
    {:ok, {batch, _}} =
      Batches.plan(%{
        "brand_id" => brand.id,
        "template_id" => template_id,
        "brew_on" => brew_on,
        "volume_bbl" => Keyword.get(opts, :volume, 20),
        "tank_ids" => tank_ids,
        "pencilled" => Keyword.get(opts, :pencilled, false)
      })

    batch |> Ecto.Changeset.change(notes: "#{@seed_tag} #{brand.name}") |> Repo.update!()
  end

  # Typed steps due on or before `through` are checked off on their day.
  defp check_off_through(batch, through, by) do
    now = now()

    Repo.update_all(
      from(s in Step,
        where: s.batch_id == ^batch.id and not is_nil(s.step_type_id) and s.due_on <= ^through,
        update: [set: [done_on: s.due_on, done_by_id: ^by.id, completed_at: ^now]]
      ),
      []
    )
  end

  defp batch_steps(batch),
    do: Repo.all(from(s in Step, where: s.batch_id == ^batch.id, preload: [:step_type, :phase]))

  # A real brand by name (case-insensitive), made if it's missing.
  defp brand!(name) do
    lowered = String.downcase(name)

    Repo.one(from(b in Brand, where: fragment("lower(?)", b.name) == ^lowered, limit: 1)) ||
      Repo.insert!(%Brand{name: name, status: "active"})
  end

  # The nine tanks with their canonical fields, first in display order and
  # active; their out-of-service periods rebuilt around today.
  defp seed_tanks(today) do
    now = now()

    seeded =
      for {name, kind, capacity, location} <- @tanks do
        fields = %{
          abbreviation: @tank_abbreviations[name],
          kind: kind,
          capacity_bbl: Decimal.new(capacity),
          location: location,
          notes: nil,
          retired_at: nil
        }

        lowered = String.downcase(name)

        case Repo.one(from(t in Tank, where: fragment("lower(?)", t.name) == ^lowered)) do
          nil ->
            Repo.insert!(struct(Tank, Map.merge(fields, %{name: name, position: 0})))

          tank ->
            tank |> Ecto.Changeset.change(Map.put(fields, :name, name)) |> Repo.update!()
        end
      end

    seeded_ids = Enum.map(seeded, & &1.id)

    others =
      Repo.all(
        from(t in Tank,
          where: is_nil(t.retired_at) and t.id not in ^seeded_ids,
          order_by: [t.position, t.id],
          select: t.id
        )
      )

    {:ok, _} = Production.reorder_tanks(seeded_ids ++ others)

    by_name = Map.new(seeded, &{&1.name, &1})
    Repo.delete_all(from(o in Outage, where: o.tank_id in ^seeded_ids))

    for {tank, from, to, reason} <- @outages do
      Repo.insert!(%Outage{
        tank_id: by_name[tank].id,
        starts_on: Date.add(today, from),
        ends_on: Date.add(today, to),
        reason: reason,
        inserted_at: now,
        updated_at: now
      })
    end

    :ok
  end

  defp build_template(name, entries) do
    {:ok, template} = Production.create_template(%{"name" => name})
    [brew] = template.steps
    types = Map.new(Production.list_step_types(), &{&1.name, &1})
    phases = Map.new(Production.list_phases(), &{&1.name, &1.id})

    Enum.reduce(entries, {template, %{brew: brew.id}}, fn
      {:brew, temperature}, {t, keys} ->
        {:ok, t} = Production.update_step(t, brew, %{"temperature" => temperature})
        {t, keys}

      {:ramp, key, first_day, start, target, change, [{after_key, answer}]}, {t, keys} ->
        before = MapSet.new(t.steps, & &1.id)

        {:ok, t} =
          Production.add_ramp(t, %{
            "start" => start,
            "target" => target,
            "change_per_day" => change,
            "first_day" => first_day,
            "comes_after_id" => keys[after_key],
            "comes_after_answer" => answer
          })

        new =
          t.steps |> Enum.reject(&MapSet.member?(before, &1.id)) |> Enum.sort_by(& &1.day_offset)

        {t, Map.put(keys, key, List.last(new).id)}

      {key, what, day, opts}, {t, keys} ->
        before = MapSet.new(t.steps, & &1.id)
        [{after_key, answer} | more] = Keyword.get(opts, :after, [])

        attrs =
          %{
            "day_offset" => day,
            "vessel_index" => Keyword.get(opts, :vessel, 0),
            "temperature" => opts[:temperature],
            "notes" => opts[:notes],
            "comes_after_id" => keys[after_key],
            "comes_after_answer" => answer
          }
          |> Map.merge(
            case what do
              {:marker, phase} -> %{"phase_id" => phases[phase]}
              type -> %{"step_type_id" => types[type].id}
            end
          )
          |> Map.merge(if opts[:phase], do: %{"phase_id" => phases[opts[:phase]]}, else: %{})

        {:ok, t} = Production.add_step(t, attrs)

        # A Transfer adds its CIP too: the new entry is the one of this kind.
        step =
          Enum.find(t.steps, fn s ->
            not MapSet.member?(before, s.id) and
              case what do
                {:marker, _} -> is_nil(s.step_type_id)
                type -> s.step_type_id == types[type].id
              end
          end)

        t =
          Enum.reduce(more, t, fn {k, a}, t ->
            {:ok, t} =
              Production.add_link(t, %{
                "from_step_id" => keys[k],
                "to_step_id" => step.id,
                "default_answer" => a
              })

            t
          end)

        {t, Map.put(keys, key, step.id)}
    end)
    |> elem(0)
  end

  ## Brewery task board (D38)

  # {title, day offset from today | nil (Future), assignee key | nil, done}
  # where done is nil (open) or {display, completed day offset, completer key}.
  @board_tasks [
    {"Carb FV3", -3, "brewer1", nil},
    {"Dry hop FV1", -2, nil, nil},
    {"Transfer BBT2 to the keg line", -2, "brewer2", {"planned_day", -1, "brewer2"}},
    {"Clean FV4", -3, nil, {"both", -1, "brewer1"}},
    {"Cold crash FV5", -1, "brewer1", {"completed_day", 0, "brewer1"}},
    {"Filter FV2 > FV3", 0, "brewer1", nil},
    {"Package FV6", 0, nil, nil},
    {"Brew Hazy IPA into FV4", 0, "brewer2", {"planned_day", 0, "brewer2"}},
    {"Yeast pitch FV4", 1, "brewer2", nil},
    {"CIP the brite tanks", 1, nil, nil},
    {"Keg BBT1", 2, "brewer1", nil},
    {"Gravity check FV1", 4, nil, nil},
    {"Package FV3", 7, "brewer1", nil},
    {"Brew Pale Ale into FV2", 9, "brewer2", nil},
    {"Order CO2", 12, nil, nil},
    {"Replace the glycol pump seal", nil, nil, nil},
    {"Recalibrate the pH meter", nil, "brewer2", nil}
  ]

  # D41: the other boards, in the same shape (none done). No Daily items.
  @taproom_tasks [
    {"Restock the walk-in cooler", -2, nil, nil},
    {"Clean lines", 0, "bartender1", nil},
    {"Restock glassware", 1, "bartender1", nil},
    {"Change the tap list board", 2, nil, nil},
    {"Order more coasters", nil, nil, nil}
  ]

  @office_tasks [
    {"Run payroll", 1, "office1", nil}
  ]

  defp seed_other_boards(u, today, now) do
    seed_board_tasks("bar", @taproom_tasks, u["barMgr"], u, today, now)
    seed_board_tasks("office", @office_tasks, u["dualMgr"], u, today, now)
  end

  defp brewery_id do
    case Repo.get_by(Department, key: "brewery") do
      nil -> -1
      dept -> dept.id
    end
  end

  defp seed_brewery_board(u, monday, today, now) do
    dept = seed_board_tasks("brewery", @board_tasks, u["breweryMgr"], u, today, now)
    mgr = u["breweryMgr"]
    seed_recurring_tasks(mgr, today)

    # Daily card: yesterday 3 of the first 4 ticked, today 1. A past day only
    # counts items that existed then, and the migration may have added the
    # defaults today: date them two weeks back so the seeded days show x/4.
    items = Tasks.list_items(dept)
    yesterday = Date.add(today, -1)
    since = Recurrence.local_midnight(Date.add(today, -14))
    default_ids = for i <- items, i.name in DailyItem.defaults(), do: i.id

    Repo.update_all(
      from(i in DailyItem, where: i.id in ^default_ids and i.inserted_at > ^since),
      set: [inserted_at: since]
    )

    Repo.delete_all(from(c in DailyCheck, where: c.on_date in ^[yesterday, today]))

    for {on_date, count, who} <- [{yesterday, 3, "brewer1"}, {today, 1, "brewer2"}],
        item <- Enum.take(items, count) do
      Repo.insert!(%DailyCheck{
        department_id: dept.id,
        on_date: on_date,
        daily_item_id: item.id,
        completed_by_id: u[who].id,
        completed_at: Recurrence.local_to_utc(on_date, ~T[09:00:00])
      })
    end

    # One published all-day Brewery event on this week's Wednesday.
    wednesday = Date.add(monday, 2)

    Repo.insert!(%ScheduleEvent{
      department_id: dept.id,
      created_by_id: mgr.id,
      title: "Brew day: Hazy IPA",
      notes: "#{@seed_tag} Brew day",
      all_day: true,
      starts_at: Recurrence.local_midnight(wednesday),
      ends_at: Recurrence.local_midnight(Date.add(wednesday, 1)),
      status: "published",
      inserted_at: now,
      updated_at: now
    })
  end

  # A board's one-off [SEED] tasks, after whatever is on each day, then the
  # lists close up. Returns the department.
  defp seed_board_tasks(key, tasks, mgr, u, today, now) do
    dept = Repo.get_by!(Department, key: key)

    for {{title, offset, who, done}, index} <- Enum.with_index(tasks) do
      due_on = offset && Date.add(today, offset)

      completion =
        case done do
          nil ->
            %{}

          {display, done_offset, by} ->
            on = Date.add(today, done_offset)

            %{
              completed_at: Recurrence.local_to_utc(on, ~T[14:00:00]),
              completed_by_id: u[by].id,
              completed_on: on,
              completed_display: display
            }
        end

      Repo.insert!(
        struct(
          %Task{
            department_id: dept.id,
            title: "#{@seed_tag} #{title}",
            due_on: due_on,
            # After whatever is already on the day; compacted below.
            position: 1_000 + index,
            assignee_id: who && u[who].id,
            created_by_id: mgr.id,
            inserted_at: now,
            updated_at: now
          },
          completion
        )
      )
    end

    Tasks.compact_lists(dept)
    dept
  end

  # D39: three recurring tasks, made through the context (12 months ahead,
  # like a real one). Keg Wash starts on the first Wednesday on or after 14
  # days ago, so its two past Wednesdays are open on the Unfinished card.
  defp seed_recurring_tasks(mgr, today) do
    brewery = Repo.get_by!(Department, key: "brewery")
    from = Date.add(today, -14)
    first_wed = Date.add(from, rem(3 - Date.day_of_week(from) + 7, 7))

    for attrs <- [
          %{
            title: "Keg Wash",
            due_on: first_wed,
            repeat: "weekly",
            repeat_weekdays: [3]
          },
          %{
            title: "Glycol check",
            due_on: today,
            repeat: "monthly",
            repeat_month_rule: "weekday",
            repeat_week_of_month: -1,
            repeat_weekday: 5
          },
          %{
            title: "Calibrate pH meter",
            due_on: today,
            repeat: "quarterly",
            repeat_month_rule: "day",
            repeat_day_of_month: 15
          }
        ] do
      {:ok, _} =
        Tasks.create(brewery, %{attrs | title: "#{@seed_tag} #{attrs.title}"}, mgr, today)
    end
  end

  # The four default Daily items, active and in order; any other item goes
  # (reset/0 has already deleted every check).
  defp restore_daily_items do
    case Repo.get_by(Department, key: "brewery") do
      nil ->
        :ok

      dept ->
        defaults = DailyItem.defaults()
        existing = Repo.all(from(i in DailyItem, where: i.department_id == ^dept.id))

        # The first (oldest) item of each default name stays; the rest go.
        keep =
          existing
          |> Enum.filter(&(&1.name in defaults))
          |> Enum.sort_by(& &1.id)
          |> Enum.uniq_by(& &1.name)

        drop_ids = Enum.map(existing -- keep, & &1.id)
        Repo.delete_all(from(i in DailyItem, where: i.id in ^drop_ids))

        for {name, position} <- Enum.with_index(defaults, 1) do
          case Enum.find(keep, &(&1.name == name)) do
            nil ->
              Repo.insert!(%DailyItem{
                department_id: dept.id,
                name: name,
                position: position,
                active: true
              })

            item ->
              item |> Ecto.Changeset.change(position: position, active: true) |> Repo.update!()
          end
        end

        :ok
    end
  end

  defp at(monday, day_offset, hour) do
    date = Date.add(monday, day_offset)
    {:ok, dt} = DateTime.new(date, Time.new!(rem(hour, 24), 0, 0), "Etc/UTC")
    if hour >= 24, do: DateTime.add(dt, 86_400), else: dt
  end

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second)
end
