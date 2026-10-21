defmodule RockcutApi.Seeds.SyntheticTest do
  # Not async: tests flip the global :deploy_env and SEED_PASSWORD.
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.TaskFixtures
  @moduletag :capture_log

  import Ecto.Query
  alias RockcutApi.{Accounts, Repo}
  alias RockcutApi.Accounts.{Department, User, Membership}
  alias RockcutApi.Scheduling.{Position, Shift}
  alias RockcutApi.TimeOff.Request
  alias RockcutApi.Availability.Slot
  alias RockcutApi.Messaging.Message
  alias RockcutApi.Notifications.Notification
  alias RockcutApi.Seeds.{Guard, Synthetic}
  alias RockcutApi.AccountsFixtures

  @positions [
    {"Brewer", "brewery"},
    {"Bar-open", "bar"},
    {"Bar-mid", "bar"},
    {"Bar-close", "bar"},
    {"Office", "office"},
    {"Sales", "sales"}
  ]

  setup do
    for key <- ~w(brewery bar office sales), do: AccountsFixtures.department_fixture(key)

    for {name, dept} <- @positions do
      Repo.insert!(%Position{
        name: name,
        active: true,
        department_id: AccountsFixtures.department_fixture(dept).id
      })
    end

    :ok
  end

  defp with_deploy_env(env, fun) do
    previous = Application.get_env(:rockcut_api, :deploy_env)
    Application.put_env(:rockcut_api, :deploy_env, env)

    try do
      fun.()
    after
      Application.put_env(:rockcut_api, :deploy_env, previous)
    end
  end

  defp counts do
    for schema <- [User, Membership, Shift, Request, Slot, Message, Notification],
        into: %{},
        do: {schema, Repo.aggregate(schema, :count)}
  end

  describe "guard" do
    test "allows dev/test envs on allowlisted hosts only" do
      assert Guard.check("dev", "rockcut-api-dev.fly.dev") == :ok
      assert Guard.check("test", "localhost") == :ok
      assert {:error, _} = Guard.check("prod", "localhost")
      assert {:error, _} = Guard.check("dev", "rockcut-api.fly.dev")
      assert {:error, _} = Guard.check(nil, "localhost")
    end

    test "setup, reset, cleanup and minting refuse in prod" do
      with_deploy_env("prod", fn ->
        assert_raise RuntimeError, ~r/Refusing/, fn -> Synthetic.setup() end
        assert_raise RuntimeError, ~r/Refusing/, fn -> Synthetic.reset() end
        assert_raise RuntimeError, ~r/Refusing/, fn -> Synthetic.cleanup_temp() end
        assert_raise RuntimeError, ~r/Refusing/, fn -> Synthetic.mint_token("owner") end
      end)

      assert Repo.aggregate(User, :count) == 0
    end
  end

  describe "setup/0" do
    test "requires SEED_PASSWORD (no default)" do
      password = System.get_env("SEED_PASSWORD")
      System.delete_env("SEED_PASSWORD")

      try do
        assert_raise RuntimeError, ~r/SEED_PASSWORD is not set/, fn -> Synthetic.setup() end
      after
        System.put_env("SEED_PASSWORD", password)
      end
    end

    test "is idempotent" do
      assert {:ok, 19} = Synthetic.setup()
      first = counts()
      assert {:ok, 19} = Synthetic.setup()
      assert counts() == first
      # 17 people + 2 tablets (D33, D40).
      assert first[User] == 19
    end

    test "every active persona authenticates; inactive does not" do
      {:ok, _} = Synthetic.setup()
      password = System.get_env("SEED_PASSWORD")

      for p <- Synthetic.personas() do
        user = Accounts.get_user_by_email_and_password(p.email, password)
        assert user, "#{p.key} should authenticate"
        assert user.active == p.flags.active
      end

      status = Map.new(Synthetic.status(), &{&1.key, &1})
      assert status["owner"].authenticates
      refute status["inactive"].authenticates
    end

    test "memberships match the persona definitions" do
      {:ok, _} = Synthetic.setup()

      split =
        Accounts.get_user_by_email("split.role@rockcut-test.com")
        |> Repo.preload(memberships: :department)

      roles = Map.new(split.memberships, &{&1.department.key, &1.role})
      assert roles == %{"bar" => "manager", "brewery" => "employee"}

      nodept = Accounts.get_user_by_email("nodept@rockcut-test.com") |> Repo.preload(:memberships)
      assert nodept.memberships == []
    end

    test "heals drift and removes [TEST-TEMP] rows" do
      {:ok, _} = Synthetic.setup()
      newhire = Accounts.get_user_by_email("newhire@rockcut-test.com")
      newhire |> Ecto.Changeset.change(must_reset_password: false) |> Repo.update!()

      Repo.insert!(%Message{channel_key: "all", user_id: newhire.id, body: "[TEST-TEMP] hello"})

      {:ok, _} = Synthetic.setup()
      assert Accounts.get_user_by_email("newhire@rockcut-test.com").must_reset_password
      refute Repo.exists?(from(m in Message, where: like(m.body, "[TEST-TEMP]%")))
    end

    test "removes [TEST-TEMP] events, series, brands and people; keeps real ones (D36-F)" do
      alias RockcutApi.Scheduling.{ScheduleEvent, ScheduleEventSeries}
      alias RockcutApi.Brewing.{Batch, Brand, BrewTurn, Recipe}

      {:ok, _} = Synthetic.setup()
      bar = Repo.get_by!(Department, key: "bar")
      now = DateTime.utc_now() |> DateTime.truncate(:second)

      event = fn title, extra ->
        Repo.insert!(
          struct(
            %ScheduleEvent{department_id: bar.id, title: title, starts_at: now, ends_at: now},
            extra
          )
        )
      end

      series =
        Repo.insert!(%ScheduleEventSeries{
          department_id: bar.id,
          title: "TEST-TEMP Trivia",
          frequency: "weekly",
          start_date: Date.utc_today()
        })

      event.("TEST-TEMP Trivia", %{series_id: series.id})
      event.("[TEST-TEMP] one-off", %{})
      keep_event = event.("Real staff meeting", %{})

      brand = Repo.insert!(%Brand{name: "[TEST-TEMP] Brand"})
      recipe = Repo.insert!(%Recipe{brand_id: brand.id, batch_size: Decimal.new(10)})
      batch = Repo.insert!(%Batch{brand_id: brand.id, batch_number: "T-1"})
      Repo.insert!(%BrewTurn{batch_id: batch.id, recipe_id: recipe.id, turn_number: 1})
      keep_brand = Repo.insert!(%Brand{name: "Real Brand"})

      temp_person =
        AccountsFixtures.user_fixture(%{
          email: "a-temp-x@rockcut-test.com",
          name: "[TEST-TEMP] QA x"
        })

      {:ok, _} = Synthetic.setup()

      refute Repo.get(ScheduleEventSeries, series.id)
      refute Repo.exists?(from(e in ScheduleEvent, where: like(e.title, "%TEST-TEMP%")))
      assert Repo.get(ScheduleEvent, keep_event.id)
      refute Repo.get(Brand, brand.id)
      refute Repo.get(Recipe, recipe.id)
      assert Repo.get(Brand, keep_brand.id)
      refute Repo.get(User, temp_person.id)
      assert Accounts.get_user_by_email("bartender1@rockcut-test.com")
    end

    test "seeds the scenario: open shifts, floater double-booking, time off" do
      {:ok, _} = Synthetic.setup()
      assert Repo.aggregate(from(s in Shift, where: is_nil(s.assignee_id)), :count) == 2
      assert Repo.aggregate(from(s in Shift, where: s.status == "draft"), :count) == 4

      floater = Accounts.get_user_by_email("floater@rockcut-test.com")

      [a, b] =
        Repo.all(from(s in Shift, where: s.assignee_id == ^floater.id, order_by: s.starts_at))

      assert DateTime.compare(b.starts_at, a.ends_at) == :lt

      brewer1 = Accounts.get_user_by_email("brewer1@rockcut-test.com")
      statuses = Repo.all(from(r in Request, where: r.user_id == ^brewer1.id, select: r.status))
      assert Enum.sort(statuses) == ["approved", "pending"]
    end

    test "seeds the Colorado week on a Sunday evening (UTC already Monday)" do
      alias RockcutApi.Tasks
      alias RockcutApi.Scheduling.Recurrence

      # Sunday 2026-10-11, 7 pm MDT = Monday 01:00 UTC.
      now = ~U[2026-10-12 01:00:00Z]
      sunday = Tasks.today_at(now)
      assert sunday == ~D[2026-10-11]

      {:ok, _} = Synthetic.setup(sunday)

      week_start = Recurrence.local_midnight(~D[2026-10-05])
      week_end = Recurrence.local_midnight(~D[2026-10-12])

      published =
        Repo.all(from(s in Shift, where: s.status == "published", select: s.starts_at))

      assert length(published) == 18

      for starts <- published do
        assert DateTime.compare(starts, week_start) != :lt
        assert DateTime.compare(starts, week_end) == :lt
      end
    end
  end

  describe "reset/0" do
    test "removes persona-owned data and restores the canonical set" do
      {:ok, _} = Synthetic.setup()
      baseline = counts()
      bartender = Accounts.get_user_by_email("bartender1@rockcut-test.com")
      Repo.insert!(%Message{channel_key: "all", user_id: bartender.id, body: "agent chatter"})

      assert {:ok, 19} = Synthetic.reset()
      assert counts() == baseline
    end
  end

  describe "mint_token/1" do
    test "mints a token the API accepts", %{conn: conn} do
      {:ok, _} = Synthetic.setup()
      token = Synthetic.mint_token("barMgr")

      conn = conn |> put_req_header("authorization", "Bearer #{token}") |> get(~p"/api/me")
      assert json_response(conn, 200)["user"]["email"] == "bar.manager@rockcut-test.com"
    end

    test "is rejected once the env is prod", %{conn: conn} do
      {:ok, _} = Synthetic.setup()
      token = Synthetic.mint_token("owner")

      with_deploy_env("prod", fn ->
        assert :error = RockcutApi.Sessions.authenticate(token)
        conn = conn |> put_req_header("authorization", "Bearer #{token}") |> get(~p"/api/me")
        assert json_response(conn, 401)
      end)
    end

    test "mint_tokens/0 covers every active persona" do
      {:ok, _} = Synthetic.setup()
      tokens = Synthetic.mint_tokens()
      # 16 active people + the taproomDevice and breweryDevice tablets (D33,
      # D40) + D34's spare sessions.
      assert map_size(tokens) == 19
      assert %{email: "bartender2@rockcut-test.com", tokens: spares} = tokens["spares"]
      assert length(spares) == 40 and length(Enum.uniq(spares)) == 40
      assert "dev_" <> _ = tokens["taproomDevice"].token
      assert "dev_" <> _ = tokens["breweryDevice"].token
      refute Map.has_key?(tokens, "inactive")
      # D34: a person's minted token is a real revocable session.
      assert "ses_" <> _ = tokens["owner"].token

      assert {:ok, %{email: "owner@rockcut-test.com"}, _} =
               RockcutApi.Sessions.authenticate(tokens["owner"].token)
    end

    test "refuses unknown and inactive personas" do
      {:ok, _} = Synthetic.setup()
      assert_raise ArgumentError, fn -> Synthetic.mint_token("nobody") end
      assert_raise RuntimeError, ~r/inactive/, fn -> Synthetic.mint_token("inactive") end
    end

    test "does not affect normal login tokens in prod" do
      user = AccountsFixtures.user_fixture()
      token = Phoenix.Token.sign(RockcutApiWeb.Endpoint, "user auth", user.id)

      with_deploy_env("prod", fn ->
        assert {:ok, id} = RockcutApiWeb.SessionController.verify_token(token)
        assert id == user.id
      end)
    end
  end

  describe "taproomDevice persona (D33)" do
    test "exists as a device at home in bar, with the invariants" do
      {:ok, _} = Synthetic.setup()
      d = Accounts.get_user_by_email("taproom.device@rockcut-test.com")
      assert d.kind == "device"
      assert d.home_department_id == AccountsFixtures.department_fixture("bar").id
      refute d.is_owner
      refute d.schedulable
      assert d.memberships == []

      status = Map.new(Synthetic.status(), &{&1.key, &1})
      assert status["taproomDevice"].exists
      refute status["taproomDevice"].authenticates
      refute Accounts.get_user_by_email_and_password(d.email, System.get_env("SEED_PASSWORD"))
    end

    test "its mint is a dev_ tablet token the API accepts", %{conn: conn} do
      {:ok, _} = Synthetic.setup()
      token = Synthetic.mint_token("taproomDevice")
      assert "dev_" <> _ = token

      body =
        conn
        |> put_req_header("authorization", "Bearer #{token}")
        |> get(~p"/api/me")
        |> json_response(200)

      assert body["user"]["kind"] == "device"
      assert body["capabilities"]["modules"] == ["bar", "schedule"]
    end

    test "D40: breweryDevice is at home in the Brewery and opens only its board", %{conn: conn} do
      {:ok, _} = Synthetic.setup()
      d = Accounts.get_user_by_email("brewery.device@rockcut-test.com")
      assert d.kind == "device"
      assert d.name == "Brewhouse tablet"
      assert d.home_department_id == AccountsFixtures.department_fixture("brewery").id
      assert d.memberships == []

      body =
        conn
        |> put_req_header("authorization", "Bearer #{Synthetic.mint_token("breweryDevice")}")
        |> get(~p"/api/me")
        |> json_response(200)

      assert body["capabilities"]["modules"] == ["brewery", "schedule"]
      assert [%{"key" => "brewery", "manage" => false}] = body["task_boards"]
    end

    test "a pairing code for it works in the real exchange", %{conn: conn} do
      # The limiter's counters are global; another module's wrong codes in the
      # same 10-minute window would make this exchange a 429.
      RockcutApi.Devices.PairingRateLimiter.reset()
      {:ok, _} = Synthetic.setup()
      code = Synthetic.pairing_code("taproomDevice")

      conn = post(conn, ~p"/api/device_tokens", %{code: code, name: "[TEST-TEMP] iPad"})
      assert "dev_" <> _ = json_response(conn, 201)["token"]

      # cleanup_temp removes agent-paired tablets.
      :ok = Synthetic.cleanup_temp()

      refute Repo.exists?(
               from(t in RockcutApi.Devices.DeviceToken, where: t.name == "[TEST-TEMP] iPad")
             )
    end

    test "setup heals a drifted device and removes [TEST-TEMP] devices" do
      {:ok, _} = Synthetic.setup()
      d = Accounts.get_user_by_email("taproom.device@rockcut-test.com")
      d |> Ecto.Changeset.change(name: "Renamed", active: false) |> Repo.update!()
      owner = Accounts.get_user_by_email("owner@rockcut-test.com")

      {:ok, temp} =
        RockcutApi.Devices.create_device(
          %{"name" => "[TEST-TEMP] Tablet", "home_department_id" => d.home_department_id},
          owner
        )

      {:ok, _} = Synthetic.setup()
      healed = Accounts.get_user!(d.id)
      assert healed.name == "Taproom tablets"
      assert healed.active
      refute Repo.get(User, temp.id)
    end
  end

  describe "Buy-a-Beer Board and staff codes (D37)" do
    alias RockcutApi.{BeerBoard, StaffCodes}
    alias RockcutApi.BeerBoard.{Entry, Event}
    alias RockcutApi.Seeds.Credentials

    import ExUnit.CaptureLog

    defp with_codes(value, fun) do
      previous = System.get_env("SYNTHETIC_STAFF_CODES")

      if value,
        do: System.put_env("SYNTHETIC_STAFF_CODES", value),
        else: System.delete_env("SYNTHETIC_STAFF_CODES")

      try do
        fun.()
      after
        if previous,
          do: System.put_env("SYNTHETIC_STAFF_CODES", previous),
          else: System.delete_env("SYNTHETIC_STAFF_CODES")
      end
    end

    defp persona(key), do: Accounts.get_user_by_email(Synthetic.persona!(key).email)

    defp code_of(key) do
      user = persona(key)
      user.staff_code_encrypted && StaffCodes.decrypt(user.staff_code_encrypted, user.id)
    end

    defp board,
      do:
        BeerBoard.list_entries()
        |> Enum.map(
          &{&1.recipient_name, &1.purchaser_name, &1.beers_remaining, not is_nil(&1.imported_at)}
        )
        |> Enum.sort()

    @codes "bartender1:1111,bartender2:2222,barMgr:3333"

    test "seeds the [SEED] entries: one with 1 left, a For-name pair, Bought by tagged" do
      with_codes(nil, fn -> capture_log(fn -> {:ok, _} = Synthetic.setup() end) end)

      assert board() == [
               {"Avery Lake", "[SEED] Kim", 5, true},
               {"Jesse Park", "[SEED] Bo", 4, false},
               {"Morgan Hill", "[SEED] Lee", 1, false},
               {"Riley Stone", "[SEED] Chris", 3, false},
               {"Riley Stone", "[SEED] Dana", 2, false}
             ]

      assert Repo.aggregate(Event, :count) == 0
    end

    test "D40: brewer1 (Brewery only) gets a code from the list too" do
      with_codes(@codes <> ",brewer1:4444", fn -> {:ok, _} = Synthetic.setup() end)
      assert code_of("brewer1") == "4444"
      assert StaffCodes.resolve("4444").email == "brewer1@rockcut-test.com"
    end

    test "sets the listed personas' codes from SYNTHETIC_STAFF_CODES; they resolve" do
      with_codes(@codes, fn -> {:ok, _} = Synthetic.setup() end)

      assert {code_of("bartender1"), code_of("bartender2"), code_of("barMgr")} ==
               {"1111", "2222", "3333"}

      assert StaffCodes.resolve("2222").id == persona("bartender2").id
    end

    test "unset: logs one line and leaves codes alone" do
      {:ok, _} = with_codes(@codes, fn -> Synthetic.setup() end)

      log = with_codes(nil, fn -> capture_log(fn -> {:ok, _} = Synthetic.setup() end) end)
      assert log =~ "SYNTHETIC_STAFF_CODES is not set"
      assert code_of("bartender1") == "1111"
    end

    test "clears leftover codes on other personas and restores changed ones" do
      {:ok, _} = with_codes(@codes, fn -> Synthetic.setup() end)
      {:ok, _} = StaffCodes.seed_put(persona("floater"), "4444")
      {:ok, _} = StaffCodes.seed_put(persona("bartender1"), "5555")

      {:ok, _} = with_codes(@codes, fn -> Synthetic.setup() end)
      assert code_of("floater") == nil
      assert code_of("bartender1") == "1111"
      assert StaffCodes.resolve("4444") == nil
    end

    test "codes can swap between personas" do
      {:ok, _} = with_codes(@codes, fn -> Synthetic.setup() end)
      {:ok, _} = with_codes("bartender1:2222,bartender2:1111", fn -> Synthetic.setup() end)

      assert {code_of("bartender1"), code_of("bartender2"), code_of("barMgr")} ==
               {"2222", "1111", nil}
    end

    test "a bad list is refused with a clear error that doesn't show the codes" do
      for {value, reason} <- [
            {"bartender1=1111", "isn't persona:code"},
            {"bartender1:111", "4 digits"},
            {"bartender1:1111,bartender1:2222", "listed twice"},
            {"bartender1:1111,bartender2:1111", "share a code"}
          ] do
        error = assert_raise ArgumentError, fn -> Credentials.parse_staff_codes!(value) end
        assert error.message =~ reason
        refute error.message =~ "1111"
      end

      with_codes(nil, fn -> capture_log(fn -> {:ok, _} = Synthetic.setup() end) end)

      assert_raise ArgumentError, ~r/unknown personas: nobody/, fn ->
        with_codes("nobody:1111", fn -> Synthetic.setup() end)
      end

      # D40: any employee may hold one; someone in no department may not.
      assert_raise ArgumentError, ~r/can't hold a staff code.*noDept/, fn ->
        with_codes("noDept:1111", fn -> Synthetic.setup() end)
      end
    end

    test "cleanup_temp removes [TEST-TEMP] entries by For or Bought by; keeps history" do
      with_codes(nil, fn -> capture_log(fn -> {:ok, _} = Synthetic.setup() end) end)
      mgr = persona("barMgr")

      for {r, p} <- [{"[TEST-TEMP] Pat", "Chris"}, {"Ana", "[TEST-TEMP] Bo"}, {"Kept", "Real"}] do
        {:ok, _} = BeerBoard.create(%{recipient_name: r, purchaser_name: p, beers: 1}, mgr, nil)
      end

      :ok = Synthetic.cleanup_temp()
      names = Enum.map(BeerBoard.list_entries(), & &1.recipient_name)
      assert "Kept" in names
      refute "[TEST-TEMP] Pat" in names
      refute "Ana" in names
      assert Repo.aggregate(Event, :count) == 3
    end

    test "setup twice gives the same board and codes" do
      {:ok, _} = with_codes(@codes, fn -> Synthetic.setup() end)
      first = {board(), Repo.aggregate(Entry, :count), code_of("barMgr")}
      {:ok, _} = with_codes(@codes, fn -> Synthetic.setup() end)
      assert {board(), Repo.aggregate(Entry, :count), code_of("barMgr")} == first
    end

    test "reset removes the [SEED] entries before rebuilding them" do
      with_codes(nil, fn -> capture_log(fn -> {:ok, _} = Synthetic.setup() end) end)
      with_codes(nil, fn -> capture_log(fn -> {:ok, _} = Synthetic.reset() end) end)
      assert Repo.aggregate(Entry, :count) == 5
    end
  end

  describe "Brewery task board (D38)" do
    alias RockcutApi.Tasks
    alias RockcutApi.Tasks.{DailyCheck, DailyItem, Task, TaskSeries}
    alias RockcutApi.Scheduling.ScheduleEvent

    # The Brewery's one-off [SEED] tasks (D39's recurring ones are checked on
    # their own; D41's other boards below).
    defp seed_tasks do
      brewery = brewery_board()

      Repo.all(
        from(t in Task,
          where:
            like(t.title, "[SEED]%") and is_nil(t.series_id) and
              t.department_id == ^brewery.id,
          order_by: [t.due_on, t.position, t.id],
          select: {t.title, t.due_on, t.position, t.completed_on, t.completed_display}
        )
      )
    end

    defp checks do
      Repo.all(
        from(c in DailyCheck,
          join: i in assoc(c, :daily_item),
          order_by: [c.on_date, i.position],
          select: {c.on_date, i.name}
        )
      )
    end

    defp item_names,
      do: Enum.map(Tasks.list_items(brewery_board()), &{&1.name, &1.position})

    defp board_lists do
      Repo.all(
        from(t in Task,
          where: not is_nil(t.due_on) or is_nil(t.completed_at),
          order_by: [t.due_on, t.position],
          select: {{t.department_id, t.due_on}, t.position}
        )
      )
      # D41: each board has its own lists.
      |> Enum.group_by(&elem(&1, 0), &elem(&1, 1))
    end

    test "seeds tasks, Daily checks and a Brewery event relative to today" do
      {:ok, _} = Synthetic.setup()
      today = Tasks.today()
      {:ok, board} = Tasks.board(brewery_board(), Date.add(today, -3), Date.add(today, 13), today)

      assert length(seed_tasks()) == 17
      # D38's two, plus Keg Wash's two past Wednesdays (D39).
      assert length(board.unfinished) == 4
      assert length(board.future) == 2

      displays = for {_, _, _, on, d} <- seed_tasks(), on, uniq: true, do: d
      assert Enum.sort(displays) == ~w(both completed_day planned_day)

      cards = Enum.flat_map(board.days, & &1.cards)
      assert Enum.any?(cards, & &1.task.assignee_id)
      assert Enum.any?(cards, & &1.locked)

      daily = Map.new(board.days, &{&1.date, &1.daily})
      assert %{done: 3, total: 4} = daily[Date.add(today, -1)]
      assert %{done: 1, total: 4} = daily[today]

      brewery = Repo.get_by!(Department, key: "brewery")

      assert [%ScheduleEvent{all_day: true, status: "published"} = event] =
               Repo.all(
                 from(e in ScheduleEvent,
                   where: e.department_id == ^brewery.id and like(e.notes, "[SEED]%")
                 )
               )

      monday = Date.beginning_of_week(Tasks.today())
      assert Tasks.today_at(event.starts_at) == Date.add(monday, 2)
    end

    test "setup twice gives the same tasks, checks and items" do
      {:ok, _} = Synthetic.setup()
      first = {seed_tasks(), checks(), item_names(), Repo.aggregate(ScheduleEvent, :count)}
      {:ok, _} = Synthetic.setup()

      assert {seed_tasks(), checks(), item_names(), Repo.aggregate(ScheduleEvent, :count)} ==
               first
    end

    test "cleanup_temp removes [TEST-TEMP] tasks and items; the lists stay dense" do
      {:ok, _} = Synthetic.setup()
      mgr = Accounts.get_user_by_email(Synthetic.persona!("breweryMgr").email)
      today = Tasks.today()

      {:ok, _} = Tasks.create(brewery_board(), %{title: "[TEST-TEMP] first", due_on: today}, mgr)
      {:ok, kept} = Tasks.create(brewery_board(), %{title: "Real task", due_on: today}, mgr)
      {:ok, _} = Tasks.create(brewery_board(), %{title: "[TEST-TEMP] later"}, mgr)
      {:ok, item} = Tasks.create_item(brewery_board(), %{name: "[TEST-TEMP] Hoses"}, mgr)
      {:ok, _} = Tasks.tick(brewery_board(), today, item, mgr, today)

      :ok = Synthetic.cleanup_temp()

      refute Repo.exists?(from(t in Task, where: like(t.title, "[TEST-TEMP]%")))
      refute Repo.exists?(from(i in DailyItem, where: like(i.name, "[TEST-TEMP]%")))
      assert Repo.get(Task, kept.id)
      assert Enum.map(item_names(), &elem(&1, 0)) == DailyItem.defaults()

      for {_day, positions} <- board_lists(),
          do: assert(positions == Enum.to_list(1..length(positions)))
    end

    defp seed_series do
      Repo.all(
        from(s in TaskSeries,
          left_join: t in assoc(s, :tasks),
          group_by: [s.id, s.title, s.frequency, s.start_date],
          order_by: s.title,
          select: {s.title, s.frequency, s.start_date, count(t.id)}
        )
      )
    end

    test "seeds three recurring tasks, Keg Wash with two open past Wednesdays (D39)" do
      {:ok, _} = Synthetic.setup()
      today = Tasks.today()

      assert [
               {"[SEED] Calibrate pH meter", "quarterly", ^today, _},
               {"[SEED] Glycol check", "monthly", ^today, _},
               {"[SEED] Keg Wash", "weekly", keg_start, keg_count}
             ] = seed_series()

      assert Date.day_of_week(keg_start) == 3
      assert Date.diff(today, keg_start) in 8..14
      assert keg_count >= 54

      {:ok, board} = Tasks.board(brewery_board(), Date.add(today, -3), Date.add(today, 27), today)
      keg = Enum.filter(board.unfinished, &(&1.task.title == "[SEED] Keg Wash"))
      assert length(keg) == 2
      assert Enum.all?(keg, & &1.task.series_id)

      cards = Enum.flat_map(board.days, & &1.cards)
      assert Enum.any?(cards, &(&1.task.title == "[SEED] Glycol check" and &1.task.series_id))
      assert Enum.any?(cards, &(&1.task.title == "[SEED] Keg Wash" and &1.task.series_id))
    end

    test "setup twice gives the same series; cleanup_temp removes [TEST-TEMP] series" do
      {:ok, _} = Synthetic.setup()
      first = seed_series()
      {:ok, _} = Synthetic.setup()
      assert seed_series() == first

      mgr = Accounts.get_user_by_email(Synthetic.persona!("breweryMgr").email)
      today = Tasks.today()

      {:ok, temp} =
        Tasks.create(
          brewery_board(),
          %{title: "[TEST-TEMP] Hoses", due_on: today, repeat: "annually"},
          mgr,
          today
        )

      # An occurrence retitled on its own still goes with its series.
      {:ok, _} =
        Tasks.update(brewery_board(), temp, %{title: "Renamed"}, mgr, scope: "this")

      :ok = Synthetic.cleanup_temp()
      refute Repo.get(TaskSeries, temp.series_id)
      refute Repo.exists?(from(t in Task, where: t.series_id == ^temp.series_id))
      refute Repo.get(Task, temp.id)
      assert seed_series() == first

      for {_day, positions} <- board_lists(),
          do: assert(positions == Enum.to_list(1..length(positions)))
    end

    test "reset deletes every Daily check and restores the four default items" do
      {:ok, _} = Synthetic.setup()
      mgr = Accounts.get_user_by_email(Synthetic.persona!("breweryMgr").email)
      today = Tasks.today()
      [backups, gravities | _] = Tasks.list_items(brewery_board())

      {:ok, _} = Tasks.tick(brewery_board(), Date.add(today, -5), gravities, mgr, today)
      {:ok, _} = Tasks.rename_item(brewery_board(), gravities, "Gravity", mgr)
      {:ok, _} = Tasks.retire_item(brewery_board(), backups, mgr)
      {:ok, _} = Tasks.create_item(brewery_board(), %{name: "Hoses"}, mgr)

      {:ok, _} = Synthetic.reset()

      assert item_names() == Enum.with_index(DailyItem.defaults(), 1)
      assert Enum.map(checks(), &elem(&1, 0)) |> Enum.uniq() == [Date.add(today, -1), today]
      assert length(seed_tasks()) == 17
      assert length(seed_series()) == 3
    end
  end

  describe "the other boards (D41)" do
    alias RockcutApi.Tasks
    alias RockcutApi.Tasks.{DailyItem, Task, TaskSeries}

    defp board_titles(key) do
      dept = task_board(key)

      Repo.all(
        from(t in Task,
          where: t.department_id == ^dept.id,
          order_by: [t.title],
          select: {t.title, t.due_on, t.assignee_id}
        )
      )
    end

    defp persona_id(key), do: Accounts.get_user_by_email(Synthetic.persona!(key).email).id

    test "seeds the Taproom (two for bartender1, one unassigned, one 2 days ago, one on Future) and one Office task; Sales empty; Daily items only on the Brewery" do
      {:ok, _} = Synthetic.setup()
      today = Tasks.today()
      bartender = persona_id("bartender1")

      taproom = board_titles("bar")
      assert length(taproom) == 5
      assert Enum.all?(taproom, fn {title, _, _} -> String.starts_with?(title, "[SEED] ") end)
      assert Enum.count(taproom, &(elem(&1, 2) == bartender)) == 2

      {:ok, board} = Tasks.board(task_board("bar"), today, Date.add(today, 6), today)
      assert [%{planned_on: past}] = board.unfinished
      assert past == Date.add(today, -2)
      assert [%{task: %{assignee_id: nil}}] = board.future
      cards = Enum.flat_map(board.days, & &1.cards)
      assert Enum.any?(cards, &is_nil(&1.task.assignee_id))
      assert Enum.all?(board.days, &(&1.daily.total == 0))

      assert [{"[SEED] Run payroll", due, office1}] = board_titles("office")
      assert due == Date.add(today, 1)
      assert office1 == persona_id("office1")
      assert board_titles("sales") == []

      for key <- ~w(bar office sales),
          do: assert(Tasks.list_items(task_board(key)) == [], key)
    end

    test "setup twice gives the same boards" do
      {:ok, _} = Synthetic.setup()
      first = for key <- ~w(bar office sales), do: board_titles(key)
      {:ok, _} = Synthetic.setup()
      assert for(key <- ~w(bar office sales), do: board_titles(key)) == first
    end

    test "cleanup_temp removes a [TEST-TEMP] Taproom task, series and Daily item; keeps real ones" do
      {:ok, _} = Synthetic.setup()
      mgr = Accounts.get_user!(persona_id("barMgr"))
      today = Tasks.today()
      bar = task_board("bar")

      {:ok, temp} = Tasks.create(bar, %{title: "[TEST-TEMP] Lines", due_on: today}, mgr, today)

      {:ok, series} =
        Tasks.create(
          bar,
          %{
            title: "[TEST-TEMP] Kegs",
            due_on: today,
            repeat: "monthly",
            repeat_month_rule: "day",
            repeat_day_of_month: 1
          },
          mgr,
          today
        )

      {:ok, real} = Tasks.create(bar, %{title: "Real taproom task", due_on: today}, mgr, today)
      {:ok, item} = Tasks.create_item(bar, %{name: "[TEST-TEMP] Lines cleaned"}, mgr)

      :ok = Synthetic.cleanup_temp()

      refute Repo.get(Task, temp.id)
      refute Repo.get(TaskSeries, series.series_id)
      refute Repo.exists?(from(t in Task, where: t.series_id == ^series.series_id))
      refute Repo.get(DailyItem, item.id)
      assert Repo.get(Task, real.id)
      assert length(board_titles("bar")) == 6

      {:ok, board} = Tasks.board(bar, today, today, today)

      assert Enum.map(hd(board.days).cards, & &1.task.position) |> Enum.sort() ==
               Enum.to_list(1..length(hd(board.days).cards))
    end

    test "reset clears the other boards' Daily items and rebuilds their [SEED] tasks" do
      {:ok, _} = Synthetic.setup()
      mgr = Accounts.get_user!(persona_id("barMgr"))
      {:ok, _} = Tasks.create_item(task_board("bar"), %{name: "Lines cleaned"}, mgr)
      {:ok, _} = Tasks.create(task_board("bar"), %{title: "[SEED] Stray"}, mgr)

      {:ok, _} = Synthetic.reset()

      assert Tasks.list_items(task_board("bar")) == []
      assert length(board_titles("bar")) == 5
      assert length(board_titles("office")) == 1
      assert Enum.map(Tasks.list_items(task_board("brewery")), & &1.name) == DailyItem.defaults()
    end
  end

  describe "production setup (D46)" do
    alias RockcutApi.{Production, Tasks}
    alias RockcutApi.Production.{Outage, Tank}

    defp production_state do
      tanks =
        for t <- Production.list_tanks(),
            do:
              {t.name, t.kind, Decimal.to_string(t.capacity_bbl), t.location, t.position,
               t.retired_at, Enum.map(t.outages, &{&1.starts_on, &1.ends_on, &1.reason})}

      templates =
        for t <- Production.list_templates() do
          full = Production.get_template(t.id)

          {t.name, t.issues,
           Enum.map(full.steps, &{Production.step_name(&1), &1.day_offset, &1.vessel_index}),
           length(full.links)}
        end

      {tanks, templates}
    end

    test "seeds nine tanks, Serving 2's periods and three complete [SEED] templates" do
      {:ok, _} = Synthetic.setup()
      today = Tasks.today()
      tanks = Production.list_tanks()

      assert Enum.map(
               tanks,
               &{&1.name, &1.kind, Decimal.to_integer(&1.capacity_bbl), &1.location}
             ) == [
               {"FV1", "unitank", 30, "brewhouse"},
               {"FV2", "unitank", 20, "brewhouse"},
               {"FV3", "unitank", 20, "brewhouse"},
               {"FV4", "unitank", 30, "brewhouse"},
               {"FV5", "unitank", 20, "brewhouse"},
               {"FV6", "unitank", 20, "brewhouse"},
               {"FV7", "unitank", 30, "brewhouse"},
               {"Serving 1", "serving", 30, "walk_in"},
               {"Serving 2", "serving", 30, "walk_in"}
             ]

      serving2 = List.last(tanks)

      assert Enum.map(serving2.outages, &{&1.starts_on, &1.ends_on, &1.reason}) == [
               {Date.add(today, -30), Date.add(today, -28), "Pressure relief valve"},
               {Date.add(today, 7), Date.add(today, 13), "Replace door gasket"}
             ]

      templates = Production.list_templates()

      assert Enum.map(templates, & &1.name) ==
               ["[SEED] Standard ale", "[SEED] Hazy with AMG", "[SEED] Lager with transfer"]

      assert Enum.all?(templates, &(&1.issues == []))

      lager = Production.get_template(List.last(templates).id)

      assert Enum.map(lager.steps, &{Production.step_name(&1), &1.day_offset, &1.vessel_index}) ==
               [
                 {"Brew day", 0, 0},
                 {"Lag", 1, 0},
                 {"Fermentation", 2, 0},
                 {"Set temp - 65°", 12, 0},
                 {"Diacetyl test", 15, 0},
                 {"Set temp - 40°", 16, 0},
                 {"Lagering", 17, 0},
                 {"Set temp - 30°", 31, 0},
                 {"Conditioning", 33, 0},
                 {"Transfer", 35, 1},
                 {"CIP & Sanitize", 35, 0},
                 {"Carb", 36, 1},
                 {"Conditioning", 38, 1},
                 {"Package", 40, 1},
                 {"CIP & Sanitize", 40, 1}
               ]

      assert Enum.find(lager.steps, &(Production.step_name(&1) == "Diacetyl test")).notes =~
               "140°F"

      assert hd(lager.steps).temperature == 50

      ale = Production.get_template(hd(templates).id)
      ramp = Enum.filter(ale.steps, & &1.ramp_group)

      assert Enum.map(ramp, &{&1.day_offset, &1.temperature}) == [
               {18, 58},
               {19, 48},
               {20, 38},
               {21, 32}
             ]
    end

    test "setup twice gives the same tanks and templates; drift is healed" do
      {:ok, _} = Synthetic.setup()
      first = production_state()

      fv3 = Repo.get_by!(Tank, name: "FV3")
      {:ok, _} = Production.update_tank(fv3, %{"capacity_bbl" => 99, "name" => "fv3"})
      # D47: FV6 only holds finished steps, so it can be retired (FV1 has Enos P2).
      {:ok, _} = Production.retire_tank(Repo.get_by!(Tank, name: "FV6"))

      {:ok, _} =
        Production.create_outage(
          fv3,
          %{"starts_on" => Date.to_iso8601(Tasks.today())},
          %RockcutApi.Accounts.User{id: nil}
        )

      {:ok, _} = Synthetic.setup()
      assert production_state() == first
    end

    test "cleanup_temp removes [TEST-TEMP] tanks, templates, step types and phases; keeps real ones" do
      {:ok, _} = Synthetic.setup()

      {:ok, temp_tank} =
        Production.create_tank(%{"name" => "[TEST-TEMP] FV8", "capacity_bbl" => 30})

      {:ok, real_tank} = Production.create_tank(%{"name" => "FV10", "capacity_bbl" => 30})

      {:ok, phase} =
        Production.create_phase(%{"name" => "[TEST-TEMP] Souring", "color" => "rose"})

      {:ok, type} =
        Production.create_step_type(%{
          "name" => "[TEST-TEMP] Hop stand",
          "starts_phase_id" => phase.id
        })

      {:ok, temp_t} = Production.create_template(%{"name" => "[TEST-TEMP] Lager"})

      # A real template that used the temporary type and phase loses those entries only.
      {:ok, real_t} = Production.create_template(%{"name" => "Real ale"})
      {:ok, real_t} = Production.add_step(real_t, %{"step_type_id" => type.id, "day_offset" => 3})
      {:ok, _} = Production.add_step(real_t, %{"phase_id" => phase.id, "day_offset" => 4})

      {:ok, _} =
        Production.create_outage(
          temp_tank,
          %{"starts_on" => "2026-11-01"},
          %RockcutApi.Accounts.User{id: nil}
        )

      :ok = Synthetic.cleanup_temp()

      refute Repo.get(Tank, temp_tank.id)
      refute Repo.exists?(from(o in Outage, where: o.tank_id == ^temp_tank.id))
      assert Repo.get(Tank, real_tank.id)
      refute Production.get_template(temp_t.id)
      refute Production.get_step_type(type.id)
      refute Production.get_phase(phase.id)

      assert Enum.map(Production.get_template(real_t.id).steps, &Production.step_name/1) == [
               "Brew day"
             ]
    end
  end

  describe "production schedule (D47)" do
    alias RockcutApi.Production
    alias RockcutApi.Production.{Batches, Cips, Schedule, Signoffs, Step}
    alias RockcutApi.Brewing.{Batch, BatchLogEntry, Brand}

    @today ~D[2026-10-21]

    defp schedule do
      {:ok, sched} = Schedule.load(Date.add(@today, -14), Date.add(@today, 70), @today)
      sched
    end

    defp line(sched, tank_name) do
      tank = Enum.find(sched.tanks, &(&1.name == tank_name))
      Enum.find(sched.statuses, &(&1.tank_id == tank.id))
    end

    test "seeds batches in every state; statuses, numbers, a signed-off flag (P36, P49–P51)" do
      brand = Repo.insert!(%Brand{name: "Old brand", status: "active"})

      legacy =
        Repo.insert!(%Batch{brand_id: brand.id, batch_number: "D1-7", status: "fermenting"})

      Repo.insert!(%BatchLogEntry{
        batch_id: legacy.id,
        timestamp: DateTime.utc_now() |> DateTime.truncate(:second),
        event_type: "note"
      })

      {:ok, _} = Synthetic.setup(@today)
      refute Repo.get(Batch, legacy.id)
      refute Repo.exists?(from(e in BatchLogEntry, where: e.batch_id == ^legacy.id))

      sched = schedule()

      assert %{line: "Day 18 · Fermentation · 68° · set to 58° today", batch_label: "Crusher #42"} =
               line(sched, "FV4")

      assert %{line: "Day 22 · Crash · 38° · 32° change late", alert: true} = line(sched, "FV5")
      assert %{batch_label: "Galactic #40", state: "in_use"} = line(sched, "FV2")
      assert %{batch_label: "Fest #38", state: "in_use"} = line(sched, "Serving 2")

      assert %{line: "Empty · dirty 8 days · no CIP planned", alert: true} =
               line(sched, "Serving 1")

      assert %{line: "Sani 13 days"} = line(sched, "FV6")

      labels = sched.batches |> Enum.map(& &1.label) |> Enum.sort()
      assert "Altruism P1" in labels
      assert "Enos P2" in labels
      assert Batches.next_batch_number() == "44"

      assert Enum.any?(sched.flags, &(&1.kind == "dirty_no_cip" and not &1.signed_off))

      assert [%{signed_off: true, signoff: %{user_name: "Jake Brewer"}}] =
               Enum.filter(sched.flags, &(&1.kind == "too_big"))

      assigned =
        Repo.all(
          from(s in Step,
            join: u in assoc(s, :assignee),
            where: not is_nil(s.assignee_id),
            select: u.name
          )
        )

      assert "Jake Brewer" in assigned
      assert "Riley Wort" in assigned
    end

    test "setup twice gives the same schedule" do
      {:ok, _} = Synthetic.setup(@today)
      first = schedule()
      {:ok, _} = Synthetic.setup(@today)
      second = schedule()
      assert Enum.map(second.batches, & &1.label) == Enum.map(first.batches, & &1.label)
      assert Enum.map(second.statuses, & &1.line) == Enum.map(first.statuses, & &1.line)
      assert length(second.flags) == length(first.flags)
    end

    test "cleanup_temp removes [TEST-TEMP] batches, CIPs on [TEST-TEMP] tanks, and their sign-offs" do
      {:ok, _} = Synthetic.setup(@today)
      brewer = Repo.get_by!(RockcutApi.Accounts.User, name: "Jake Brewer")

      {:ok, temp_tank} =
        Production.create_tank(%{"name" => "[TEST-TEMP] FV9", "capacity_bbl" => 20})

      [template | _] = Production.list_templates()
      galactic = Repo.get_by!(Brand, name: "Galactic")

      {:ok, {temp, _}} =
        Batches.plan(%{
          "brand_id" => galactic.id,
          "template_id" => template.id,
          "brew_on" => "2026-11-02",
          "volume_bbl" => 20,
          "tank_ids" => [temp_tank.id]
        })

      temp |> Ecto.Changeset.change(notes: "[TEST-TEMP] P21") |> Repo.update!()

      {:ok, cip} =
        Cips.create(%{"tank_id" => temp_tank.id, "due_on" => "2026-10-22"}, brewer, @today)

      {:ok, _} = Signoffs.sign_off(%{"key" => "no_tank:#{temp.id}.0", "signature" => "x"}, brewer)

      :ok = Synthetic.cleanup_temp()

      refute Repo.get(Batch, temp.id)
      refute Repo.get(Step, cip.id)
      refute Signoffs.get_by_key("no_tank:#{temp.id}.0")
      assert Enum.any?(Signoffs.list(), &String.starts_with?(&1.flag_key, "too_big"))
    end
  end
end
