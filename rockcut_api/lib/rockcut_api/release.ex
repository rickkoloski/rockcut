defmodule RockcutApi.Release do
  @moduledoc """
  Release tasks for running migrations from the command line.

  Usage:
    bin/rockcut_api eval "RockcutApi.Release.migrate"
  """

  @app :rockcut_api

  def migrate do
    load_app()

    for repo <- repos() do
      {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :up, all: true))
    end
  end

  def seed do
    load_app()

    for repo <- repos() do
      {:ok, _, _} =
        Ecto.Migrator.with_repo(repo, fn _repo ->
          seed_file = Application.app_dir(@app, "priv/repo/seeds.exs")
          Code.eval_file(seed_file)
        end)
    end
  end

  ## Synthetic personas (D30) — DEV/local only; RockcutApi.Seeds.Guard refuses prod.

  def seed_synthetic do
    {:ok, count} = with_repo(fn -> RockcutApi.Seeds.Synthetic.setup() end)
    IO.puts("Synthetic personas seeded: #{count}")
  end

  def reset_synthetic do
    {:ok, count} = with_repo(fn -> RockcutApi.Seeds.Synthetic.reset() end)
    IO.puts("Synthetic personas reset: #{count}")
  end

  def synthetic_status do
    with_repo(fn -> RockcutApi.Seeds.Synthetic.status() end)
    |> Enum.each(fn s ->
      IO.puts(
        String.pad_trailing(s.key, 14) <>
          String.pad_trailing(s.email, 36) <>
          "exists=#{s.exists} active=#{s.active} authenticates=#{s.authenticates}"
      )
    end)
  end

  @doc "Print a short-lived session token for a persona (the agent login path)."
  def mint_token(persona_key) do
    with_repo(fn -> RockcutApi.Seeds.Synthetic.mint_token(persona_key) end)
    |> IO.puts()
  end

  @doc "Print a 10-minute pairing code for a synthetic device persona (D33; DEV/local only)."
  def pair_synthetic_device(persona_key \\ "taproomDevice") do
    with_repo(fn -> RockcutApi.Seeds.Synthetic.pairing_code(persona_key) end)
    |> IO.puts()
  end

  @doc "Print tokens for every active persona as JSON (used by the Playwright auth setup)."
  def mint_tokens_json do
    with_repo(fn -> RockcutApi.Seeds.Synthetic.mint_tokens() end)
    |> Jason.encode!()
    |> IO.puts()
  end

  defp with_repo(fun) do
    load_app()
    [repo | _] = repos()
    {:ok, result, _} = Ecto.Migrator.with_repo(repo, fn _repo -> fun.() end)
    result
  end

  def rollback(repo, version) do
    load_app()
    {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :down, to: version))
  end

  defp repos do
    Application.fetch_env!(@app, :ecto_repos)
  end

  defp load_app do
    Application.load(@app)
  end
end
