defmodule RockcutApi.Repo do
  use Ecto.Repo,
    otp_app: :rockcut_api,
    adapter: Ecto.Adapters.SQLite3

  # Preload associations sequentially on the caller's connection. By default Ecto
  # preloads several associations in parallel, each on its own pool connection.
  # With SQLite's single writer that stalls: when the pool is full of requests
  # waiting at BEGIN IMMEDIATE, a request that needs extra connections to preload
  # can't finish, and everything waits for the busy timeout ("database is
  # locked", D32 DEV finding G1). SQLite gains nothing from parallel reads here.
  @impl true
  def default_options(operation) when operation in [:all, :preload, :reload],
    do: [in_parallel: false]

  def default_options(_operation), do: []
end
