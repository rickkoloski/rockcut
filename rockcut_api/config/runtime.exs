import Config

# config/runtime.exs is executed for all environments, including
# during releases. It is executed after compilation and before the
# system starts, so it is typically used to load production configuration
# and secrets from environment variables or elsewhere. Do not define
# any compile-time configuration in here, as it won't be applied.
# The block below contains prod specific runtime configuration.

# ## Using releases
#
# If you use `mix release`, you need to explicitly enable the server
# by passing the PHX_SERVER=true when you start it:
#
#     PHX_SERVER=true bin/rockcut_api start
#
# Alternatively, you can use `mix phx.gen.release` to generate a `bin/server`
# script that automatically sets the env var above.
if System.get_env("PHX_SERVER") do
  config :rockcut_api, RockcutApiWeb.Endpoint, server: true
end

# D33: trust the `fly-client-ip` header (set by Fly's edge proxy) for the
# pairing-code rate limiter only when actually running on Fly. Everywhere else
# the header is client-controlled, so the limiter uses the socket address.
config :rockcut_api, :trust_fly_client_ip, System.get_env("FLY_APP_NAME") not in [nil, ""]

# Deploy environment (D30). Releases read ROCKCUT_ENV — "prod" (default, fail
# closed) or "dev" (the shared DEV server). Local Mix envs use their own name.
# Gates synthetic personas + minted tokens (RockcutApi.Seeds.Guard).
deploy_env =
  if config_env() == :prod do
    case System.get_env("ROCKCUT_ENV", "prod") do
      env when env in ["prod", "dev"] -> env
      other -> raise "ROCKCUT_ENV must be \"prod\" or \"dev\", got: #{inspect(other)}"
    end
  else
    Atom.to_string(config_env())
  end

config :rockcut_api, :deploy_env, deploy_env

if config_env() == :prod do
  database_path =
    System.get_env("DATABASE_PATH") ||
      raise """
      environment variable DATABASE_PATH is missing.
      For example: /data/rockcut_api.db
      """

  # One connection: SQLite has a single writer, and with several connections
  # concurrent writers wait inside SQLite's lock handler, which on DEV's 1 vCPU
  # stalled requests (and even the health check) for the full busy timeout and
  # failed some with "database is locked" (D32 DEV finding G1). With one
  # connection, requests queue in Elixir instead: a burst of 6 repeating-event
  # saves took ~340 ms, all succeeding. Override with POOL_SIZE if needed.
  config :rockcut_api, RockcutApi.Repo,
    database: database_path,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "1")

  # The secret key base is used to sign/encrypt cookies and other secrets.
  # A default value is used in config/dev.exs and config/test.exs but you
  # want to use a different value for prod and you most likely don't want
  # to check this value into version control, so we use an environment
  # variable instead.
  secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
      raise """
      environment variable SECRET_KEY_BASE is missing.
      You can generate one by calling: mix phx.gen.secret
      """

  host = System.get_env("PHX_HOST") || "example.com"
  port = String.to_integer(System.get_env("PORT") || "4000")

  config :rockcut_api, :dns_cluster_query, System.get_env("DNS_CLUSTER_QUERY")

  config :rockcut_api, RockcutApiWeb.Endpoint,
    url: [host: host, port: 443, scheme: "https"],
    http: [
      # Enable IPv6 and bind on all interfaces.
      # Set it to  {0, 0, 0, 0, 0, 0, 0, 1} for local network only access.
      # See the documentation on https://hexdocs.pm/bandit/Bandit.html#t:options/0
      # for details about using IPv6 vs IPv4 and loopback vs public addresses.
      ip: {0, 0, 0, 0, 0, 0, 0, 0},
      port: port
    ],
    secret_key_base: secret_key_base,
    check_origin: false

  # CORS origins — default permissive for demo, override via CORS_ORIGINS env var
  cors_origins =
    case System.get_env("CORS_ORIGINS") do
      nil -> ["*"]
      origins -> String.split(origins, ",", trim: true)
    end

  config :rockcut_api, :cors_origins, cors_origins

  # Admin credentials for login gate
  if admin_email = System.get_env("ADMIN_EMAIL") do
    config :rockcut_api, :admin_email, admin_email
  end

  if admin_password_hash = System.get_env("ADMIN_PASSWORD_HASH") do
    config :rockcut_api, :admin_password_hash, admin_password_hash
  end

  # D37 staff codes: the AES-256-GCM key that lets managers see a code in the
  # user dialog. 32 random bytes, base64 (`openssl rand -base64 32`). Required:
  # boot stops here rather than failing on the first code a manager saves.
  staff_code_key =
    case Base.decode64(System.get_env("STAFF_CODE_KEY") || "") do
      {:ok, <<_::binary-32>> = key} ->
        key

      _ ->
        raise "STAFF_CODE_KEY is missing or not 32 bytes of base64 (openssl rand -base64 32)"
    end

  config :rockcut_api, :staff_code_key, staff_code_key

  # Web Push (D21) — production VAPID keypair from Fly secrets. Generate with
  # `mix web_push_ex.vapid` and set WEB_PUSH_EX_VAPID_{PUBLIC,PRIVATE}_KEY.
  # Without these, the web_push channel simply no-ops (best-effort delivery).
  if vapid_public = System.get_env("WEB_PUSH_EX_VAPID_PUBLIC_KEY") do
    config :web_push_ex, :vapid,
      public_key: vapid_public,
      private_key: System.fetch_env!("WEB_PUSH_EX_VAPID_PRIVATE_KEY"),
      subject: System.get_env("WEB_PUSH_EX_VAPID_SUBJECT") || "mailto:matt@rockcut.com"
  end

  # Email (D28): no real provider this release. Use a no-op adapter that logs and
  # never raises, so notification emails (D18/D21/D23) degrade cleanly to the
  # in-app bell + web push. Swap in a real Swoosh adapter (Mailgun/Postmark/SMTP)
  # here when a provider + sending domain are chosen.
  config :rockcut_api, RockcutApi.Mailer, adapter: RockcutApi.MailerNoop

  # ## SSL Support
  #
  # To get SSL working, you will need to add the `https` key
  # to your endpoint configuration:
  #
  #     config :rockcut_api, RockcutApiWeb.Endpoint,
  #       https: [
  #         ...,
  #         port: 443,
  #         cipher_suite: :strong,
  #         keyfile: System.get_env("SOME_APP_SSL_KEY_PATH"),
  #         certfile: System.get_env("SOME_APP_SSL_CERT_PATH")
  #       ]
  #
  # The `cipher_suite` is set to `:strong` to support only the
  # latest and more secure SSL ciphers. This means old browsers
  # and clients may not be supported. You can set it to
  # `:compatible` for wider support.
  #
  # `:keyfile` and `:certfile` expect an absolute path to the key
  # and cert in disk or a relative path inside priv, for example
  # "priv/ssl/server.key". For all supported SSL configuration
  # options, see https://hexdocs.pm/plug/Plug.SSL.html#configure/1
  #
  # We also recommend setting `force_ssl` in your config/prod.exs,
  # ensuring no data is ever sent via http, always redirecting to https:
  #
  #     config :rockcut_api, RockcutApiWeb.Endpoint,
  #       force_ssl: [hsts: true]
  #
  # Check `Plug.SSL` for all available options in `force_ssl`.

  # ## Configuring the mailer
  #
  # In production you need to configure the mailer to use a different adapter.
  # Here is an example configuration for Mailgun:
  #
  #     config :rockcut_api, RockcutApi.Mailer,
  #       adapter: Swoosh.Adapters.Mailgun,
  #       api_key: System.get_env("MAILGUN_API_KEY"),
  #       domain: System.get_env("MAILGUN_DOMAIN")
  #
  # Most non-SMTP adapters require an API client. Swoosh supports Req, Hackney,
  # and Finch out-of-the-box. This configuration is typically done at
  # compile-time in your config/prod.exs:
  #
  #     config :swoosh, :api_client, Swoosh.ApiClient.Req
  #
  # See https://hexdocs.pm/swoosh/Swoosh.html#module-installation for details.
end
