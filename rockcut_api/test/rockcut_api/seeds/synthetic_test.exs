defmodule RockcutApi.Seeds.SyntheticTest do
  # Not async: tests flip the global :deploy_env and SEED_PASSWORD.
  use RockcutApiWeb.ConnCase, async: false

  import Ecto.Query
  alias RockcutApi.{Accounts, Repo}
  alias RockcutApi.Accounts.{User, Membership}
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
      assert {:ok, 17} = Synthetic.setup()
      first = counts()
      assert {:ok, 17} = Synthetic.setup()
      assert counts() == first
      assert first[User] == 17
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

      assert {:ok, 17} = Synthetic.reset()
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
        assert {:error, _} = RockcutApiWeb.SessionController.verify_token(token)
        conn = conn |> put_req_header("authorization", "Bearer #{token}") |> get(~p"/api/me")
        assert json_response(conn, 401)
      end)
    end

    test "mint_tokens/0 covers every active persona" do
      {:ok, _} = Synthetic.setup()
      tokens = Synthetic.mint_tokens()
      assert map_size(tokens) == 16
      refute Map.has_key?(tokens, "inactive")
      assert {:ok, _} = RockcutApiWeb.SessionController.verify_token(tokens["owner"].token)
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
end
