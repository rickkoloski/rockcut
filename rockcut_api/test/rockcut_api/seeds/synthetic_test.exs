defmodule RockcutApi.Seeds.SyntheticTest do
  # Not async: tests flip the global :deploy_env and SEED_PASSWORD.
  use RockcutApiWeb.ConnCase, async: false
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
      assert {:ok, 18} = Synthetic.setup()
      first = counts()
      assert {:ok, 18} = Synthetic.setup()
      assert counts() == first
      assert first[User] == 18
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
  end

  describe "reset/0" do
    test "removes persona-owned data and restores the canonical set" do
      {:ok, _} = Synthetic.setup()
      baseline = counts()
      bartender = Accounts.get_user_by_email("bartender1@rockcut-test.com")
      Repo.insert!(%Message{channel_key: "all", user_id: bartender.id, body: "agent chatter"})

      assert {:ok, 18} = Synthetic.reset()
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
      # 16 active people + the taproomDevice tablet (D33) + D34's spare sessions.
      assert map_size(tokens) == 18
      assert %{email: "bartender2@rockcut-test.com", tokens: spares} = tokens["spares"]
      assert length(spares) == 40 and length(Enum.uniq(spares)) == 40
      assert "dev_" <> _ = tokens["taproomDevice"].token
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

    test "a pairing code for it works in the real exchange", %{conn: conn} do
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

      assert_raise ArgumentError, ~r/can't hold a staff code.*brewer1/, fn ->
        with_codes("brewer1:1111", fn -> Synthetic.setup() end)
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
end
