defmodule Mix.Tasks.Rockcut.Synthetic.Setup do
  @shortdoc "Seed/heal the synthetic @rockcut-test.com personas (local dev)"
  @moduledoc "Idempotent. Needs SEED_PASSWORD (env or rockcut_api/.env.synthetic). See RockcutApi.Seeds.Synthetic."
  use Mix.Task

  @impl true
  def run(_args) do
    Mix.Task.run("app.start")
    {:ok, count} = RockcutApi.Seeds.Synthetic.setup()
    Mix.shell().info("Synthetic personas seeded: #{count}")
  end
end

defmodule Mix.Tasks.Rockcut.Synthetic.Reset do
  @shortdoc "Delete and re-create the synthetic personas and their data (local dev)"
  @moduledoc "Removes every @rockcut-test.com user and what they own, then runs setup."
  use Mix.Task

  @impl true
  def run(_args) do
    Mix.Task.run("app.start")
    {:ok, count} = RockcutApi.Seeds.Synthetic.reset()
    Mix.shell().info("Synthetic personas reset: #{count}")
  end
end

defmodule Mix.Tasks.Rockcut.Synthetic.Status do
  @shortdoc "Show which synthetic personas exist and authenticate"
  @moduledoc "Read-only."
  use Mix.Task

  @impl true
  def run(_args) do
    Mix.Task.run("app.start")

    for s <- RockcutApi.Seeds.Synthetic.status() do
      Mix.shell().info(
        String.pad_trailing(s.key, 12) <>
          String.pad_trailing(s.email, 36) <>
          "exists=#{s.exists} active=#{s.active} authenticates=#{s.authenticates}"
      )
    end
  end
end

defmodule Mix.Tasks.Rockcut.Synthetic.Token do
  @shortdoc "Print a short-lived session token for a synthetic persona"
  @moduledoc """
  Usage: mix rockcut.synthetic.token barMgr
         mix rockcut.synthetic.token --all   # JSON: {key: {email, token}} for every active persona

  Set it as localStorage.rockcut_token on the UI origin (see rockcut-ui/tests/RUNNING.md).
  """
  use Mix.Task

  @impl true
  def run(["--all"]) do
    Mix.Task.run("app.start")
    Mix.shell().info(Jason.encode!(RockcutApi.Seeds.Synthetic.mint_tokens()))
  end

  def run([key]) do
    Mix.Task.run("app.start")
    Mix.shell().info(RockcutApi.Seeds.Synthetic.mint_token(key))
  end

  def run(_), do: Mix.raise("usage: mix rockcut.synthetic.token <persona key>")
end

defmodule Mix.Tasks.Rockcut.Synthetic.PairCode do
  @shortdoc "Print a pairing code for a synthetic shared device (D33)"
  @moduledoc """
  Usage: mix rockcut.synthetic.pair_code [taproomDevice]

  Enter the code on the login screen under "Set up as a shared device".
  Single use; expires in 10 minutes.
  """
  use Mix.Task

  @impl true
  def run(args) do
    Mix.Task.run("app.start")
    Mix.shell().info(RockcutApi.Seeds.Synthetic.pairing_code(List.first(args) || "taproomDevice"))
  end
end
