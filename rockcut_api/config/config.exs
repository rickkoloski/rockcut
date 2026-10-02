# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :rockcut_api,
  ecto_repos: [RockcutApi.Repo],
  generators: [timestamp_type: :utc_datetime]

# Configures the endpoint
config :rockcut_api, RockcutApiWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: RockcutApiWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: RockcutApi.PubSub,
  live_view: [signing_salt: "mVN+/LE4"]

# Configures the mailer
#
# By default it uses the "Local" adapter which stores the emails
# locally. You can see the emails in your browser, at "/dev/mailbox".
#
# For production it's recommended to configure a different adapter
# at the `config/runtime.exs`.
config :rockcut_api, RockcutApi.Mailer, adapter: Swoosh.Adapters.Local

# Configures Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# D32: real time-zone rules (recurring events keep Colorado wall-clock time across DST).
config :elixir, :time_zone_database, Tz.TimeZoneDatabase

# SQLite allows one writer at a time. Wait up to 10 s for the write lock rather
# than failing with "database is locked" (ecto_sqlite3 default: 2 s) — a large
# repeating-event series can hold it for a moment (D32 DEV finding G1).
# Each environment's config adds the database path; these keys merge.
config :rockcut_api, RockcutApi.Repo, busy_timeout: 10_000

# Web Push (D21). This is a DEV/TEST keypair — safe to commit; prod overrides
# public_key/private_key from Fly secrets in config/runtime.exs. Regenerate with
# `mix web_push_ex.vapid`. The private key must never be a production secret.
config :web_push_ex, :vapid,
  public_key:
    "BIson3HqmbBXrodsMY49xHuZ6lFASieRZp7LTLiiCR0VyOTwFDKeNNyNwcpblQCvgfHtdsp_JAOhFGDcPxtktg0",
  private_key: "XJyQrbsKYhDAKNZzJFEKJ7VsoA78frxBm6Drrtmz1ys",
  subject: "mailto:matt@rockcut.com"

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
