ExUnit.start()
Ecto.Adapters.SQL.Sandbox.mode(RockcutApi.Repo, :manual)

# D30: synthetic personas need a seed password; there is no default in code.
if System.get_env("SEED_PASSWORD") in [nil, ""],
  do: System.put_env("SEED_PASSWORD", "synthetic-test-password")
