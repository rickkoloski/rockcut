defmodule RockcutApi.Migrations.D63BrewerySettingsTest do
  @moduledoc """
  D63 §6.1: the `brewery_settings` migration on a database file of its own
  (as `D63CatalogTest`), with real connections: its row is the one the schema
  would make, and reads or saves at once leave one row and one winner.
  """
  use ExUnit.Case, async: false

  alias RockcutApi.{BrewerySettings, Repo}
  alias RockcutApi.Accounts.User
  alias RockcutApi.BrewerySettings.Settings

  @moduletag :capture_log
  @version 20_261_124_120_007

  setup do
    path = Path.join(System.tmp_dir!(), "rockcut_d63s_#{System.unique_integer([:positive])}.db")

    {:ok, pid} =
      Repo.start_link(
        name: nil,
        database: path,
        pool: DBConnection.ConnectionPool,
        pool_size: 4,
        busy_timeout: 10_000,
        log: false
      )

    previous = Repo.put_dynamic_repo(pid)

    on_exit(fn ->
      Repo.put_dynamic_repo(previous)
      for f <- [path, path <> "-wal", path <> "-shm"], do: File.rm(f)
    end)

    migrate(:up, all: true)
    %{repo: pid}
  end

  defp migrations do
    for file <-
          Path.wildcard(Application.app_dir(:rockcut_api, "priv/repo/migrations/*.exs"))
          |> Enum.sort() do
      [version | _] = file |> Path.basename() |> String.split("_", parts: 2)
      [_, name] = Regex.run(~r/defmodule\s+([\w.]+)/, File.read!(file))
      module = Module.concat([name])
      unless Code.ensure_loaded?(module), do: Code.require_file(file)
      {String.to_integer(version), module}
    end
  end

  defp migrate(direction, opts),
    do: Ecto.Migrator.run(Repo, migrations(), direction, Keyword.merge(opts, log: false))

  defp at_once(c, n, fun) do
    1..n
    |> Enum.map(fn i ->
      Task.async(fn ->
        Repo.put_dynamic_repo(c.repo)
        fun.(i)
      end)
    end)
    |> Task.await_many(30_000)
  end

  @volatile [:__meta__, :inserted_at, :updated_at, :updated_by]

  test "the migration's row is the one a first read would make; down and up again" do
    assert [made] = Repo.all(Settings)
    assert made.lock_version == 1 and made.updated_by_id == nil
    assert %DateTime{} = made.updated_at

    Repo.delete_all(Settings)
    again = BrewerySettings.get()

    # 2 and 2.0 are one value.
    plain = fn s ->
      s
      |> Map.from_struct()
      |> Map.drop(@volatile)
      |> Map.new(fn {k, v} ->
        {k, if(is_struct(v, Decimal), do: Decimal.normalize(v), else: v)}
      end)
    end

    assert plain.(Repo.get!(Settings, 1)) == plain.(made)
    assert plain.(again) == plain.(made)

    migrate(:down, to: @version)
    migrate(:up, all: true)
    assert plain.(Repo.one!(Settings)) == plain.(made)
  end

  test "first reads at once make one row", c do
    for _ <- 1..15 do
      Repo.delete_all(Settings)
      rows = at_once(c, 8, fn _ -> BrewerySettings.get() end)
      assert Enum.map(rows, & &1.id) |> Enum.uniq() == [1]
      assert Repo.aggregate(Settings, :count) == 1
    end
  end

  test "saves at once from one version: one is kept, the others are stale", c do
    user = Repo.insert!(%User{email: "s@rockcut-test.com", name: "S", password_hash: "x"})

    for round <- 1..5 do
      version = BrewerySettings.get().lock_version

      results =
        at_once(c, 6, fn i ->
          BrewerySettings.update(
            %{"lock_version" => version, "ibu_tolerance" => "#{round}.#{i}"},
            user
          )
        end)

      assert [{:ok, saved}] = Enum.filter(results, &match?({:ok, _}, &1))
      assert Enum.count(results, &match?({:error, {:stale, _, _}}, &1)) == 5
      assert BrewerySettings.get().lock_version == version + 1
      assert Decimal.eq?(BrewerySettings.get().ibu_tolerance, saved.ibu_tolerance)
    end
  end
end
