defmodule RockcutApi.PersonaFixtures do
  @moduledoc """
  D30 personas for tests (D31 parity suite). Users and memberships come from
  `RockcutApi.Seeds.Synthetic.personas/0`, the same definitions DEV and the
  Playwright suite use, inserted directly: fixture password, no scenario data.
  Each test adds only the records it needs.
  """

  import Phoenix.ConnTest, only: [build_conn: 0]
  import Plug.Conn, only: [put_req_header: 3]

  alias RockcutApi.{Accounts, AccountsFixtures, Repo}
  alias RockcutApi.Accounts.{Department, User}
  alias RockcutApi.Seeds.Synthetic

  @endpoint RockcutApiWeb.Endpoint

  @doc """
  Insert every persona (or only `keys`) plus the departments they reference and
  the non-assignable `other` department. Returns `%{key => %User{}}` with
  memberships preloaded, as `AuthPlug` loads them.
  """
  def personas(keys \\ :all) do
    departments()

    selected =
      if keys == :all, do: Synthetic.personas(), else: Enum.map(keys, &Synthetic.persona!/1)

    Map.new(selected, fn p -> {p.key, insert_persona(p)} end)
  end

  @doc "Department structs by key: brewery, bar, office, sales, and `other` (not assignable)."
  def departments do
    assignable =
      Map.new(~w(brewery bar office sales), &{&1, AccountsFixtures.department_fixture(&1)})

    other =
      Repo.get_by(Department, key: "other") ||
        Repo.insert!(%Department{key: "other", name: "Other", assignable: false})

    Map.put(assignable, "other", other)
  end

  @doc "A fresh conn authenticated as `user`, with a new `ses_` session (D34)."
  def as(%User{} = user) do
    token = AccountsFixtures.session_token_fixture(user)
    build_conn() |> put_req_header("authorization", "Bearer #{token}")
  end

  @doc "Dispatch `method path` as `user`; returns the response conn."
  def call(%User{} = user, method, path, params \\ %{}) do
    Phoenix.ConnTest.dispatch(as(user), @endpoint, method, path, params)
  end

  @doc """
  The D33 `taproomDevice` persona: a device account at home in `bar`, with one
  paired tablet. Returns `{device, dev_token}`. A device can't use `as/1` (it
  refuses session tokens); use `call_device/4`.
  """
  def taproom_device do
    departments()
    device = AccountsFixtures.device_fixture(%{name: "Taproom tablets", home: "bar"})
    {device, AccountsFixtures.device_token_fixture(device, "Taproom iPad 1")}
  end

  @doc "A fresh conn with a tablet's `dev_` token."
  def as_token(token) when is_binary(token),
    do: build_conn() |> put_req_header("authorization", "Bearer #{token}")

  @doc "Dispatch `method path` with a tablet token; returns the response conn."
  def call_device(token, method, path, params \\ %{}) do
    Phoenix.ConnTest.dispatch(as_token(token), @endpoint, method, path, params)
  end

  @doc "HTTP status of `method path` as `user`."
  def status(%User{} = user, method, path, params \\ %{}),
    do: call(user, method, path, params).status

  @doc "The `id`s in a JSON `data` list response."
  def data_ids(conn) do
    conn.resp_body |> Jason.decode!() |> Map.fetch!("data") |> Enum.map(& &1["id"])
  end

  @doc "Re-read a user with the preloads `AuthPlug` uses."
  def reload(%User{id: id}), do: Accounts.get_user!(id)

  # Inserted directly with a placeholder hash: parity tests authenticate with a
  # signed token, and hashing 17 passwords per test at full Argon2 cost is slow.
  defp insert_persona(p) do
    user =
      Repo.insert!(
        struct(
          User,
          Map.merge(
            Map.take(p.flags, [:is_owner, :active, :must_reset_password, :schedulable]),
            %{email: p.email, name: p.name, password_hash: "persona-fixture-no-login"}
          )
        )
      )

    Enum.reduce(p.memberships, Accounts.get_user!(user.id), fn {dept, role}, u ->
      AccountsFixtures.add_membership(u, dept, role)
    end)
  end
end
