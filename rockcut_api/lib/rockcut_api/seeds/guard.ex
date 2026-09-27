defmodule RockcutApi.Seeds.Guard do
  @moduledoc """
  Fail-closed guard for synthetic personas and minted tokens (D30).

  Allowed only when **both** hold:
    * `:deploy_env` is `"dev"` (the DEV server, `ROCKCUT_ENV=dev`) or a local
      Mix env (`"dev"` / `"test"`); a release without `ROCKCUT_ENV` is `"prod"`.
    * the API host is on the hard-coded allowlist below. Adding a host is a
      deliberate code change, not an env var.
  """

  @allowed_envs ~w(dev test)
  @allowed_hosts ~w(localhost 127.0.0.1 rockcut-api-dev.fly.dev)

  def allowed_hosts, do: @allowed_hosts

  @doc "The current deploy env (`\"prod\"` if unset — fail closed)."
  def deploy_env, do: Application.get_env(:rockcut_api, :deploy_env, "prod")

  @doc "The API host: `PHX_HOST`, else the endpoint's configured URL host."
  def host do
    System.get_env("PHX_HOST") ||
      get_in(Application.get_env(:rockcut_api, RockcutApiWeb.Endpoint, []), [:url, :host]) ||
      "localhost"
  end

  @doc "Pure check, for tests: `:ok` or `{:error, reason}`."
  def check(deploy_env, host) do
    cond do
      deploy_env not in @allowed_envs ->
        {:error, "deploy env #{inspect(deploy_env)} is not dev/test"}

      host not in @allowed_hosts ->
        {:error, "host #{inspect(host)} is not in the synthetic allowlist"}

      true ->
        :ok
    end
  end

  def allowed?, do: check(deploy_env(), host()) == :ok

  @doc "Raises unless allowed. Call before any synthetic write or token mint."
  def guard! do
    case check(deploy_env(), host()) do
      :ok -> :ok
      {:error, reason} -> raise "Refusing synthetic seed/token operation: #{reason}"
    end
  end
end
