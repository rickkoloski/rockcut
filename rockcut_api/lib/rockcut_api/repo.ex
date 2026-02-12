defmodule RockcutApi.Repo do
  use Ecto.Repo,
    otp_app: :rockcut_api,
    adapter: Ecto.Adapters.SQLite3
end
