defmodule RockcutApi.Seeds.Credentials do
  @moduledoc """
  The one definition of the synthetic personas' shared password (D30).

  There is deliberately **no default**: the value is a secret kept in a
  PortableMind file shared by Matt and Rick, set as the `SEED_PASSWORD` Fly
  secret on DEV, and in the gitignored `rockcut_api/.env.synthetic` locally
  (`SEED_PASSWORD=...`). Agents normally don't need it — they use minted tokens
  (`RockcutApi.Seeds.Synthetic.mint_token/1`).
  """

  @env_file ".env.synthetic"

  # The local file is skipped under test (config :rockcut_api, :seed_env_file, nil)
  # so a developer's real value never leaks into the suite.
  defp env_file, do: Application.get_env(:rockcut_api, :seed_env_file, @env_file)

  @doc "The seed password, or raises with setup instructions."
  def password do
    case fetch() do
      {:ok, password} ->
        password

      :error ->
        raise """
        SEED_PASSWORD is not set.
        Set it in the environment, or locally in rockcut_api/#{@env_file} as
        SEED_PASSWORD=<value> (the value is in the PortableMind file shared by
        Matt and Rick). There is intentionally no default.
        """
    end
  end

  @doc "`{:ok, password}` from `SEED_PASSWORD` or the local env file, else `:error`."
  def fetch do
    case System.get_env("SEED_PASSWORD") || from_env_file() do
      value when is_binary(value) and value != "" -> {:ok, value}
      _ -> :error
    end
  end

  defp from_env_file do
    with path when is_binary(path) <- env_file(),
         {:ok, contents} <- File.read(path) do
      contents
      |> String.split("\n")
      |> Enum.find_value(fn line ->
        case String.split(String.trim(line), "=", parts: 2) do
          ["SEED_PASSWORD", value] -> value |> String.trim() |> String.trim("\"")
          _ -> nil
        end
      end)
    else
      _ -> nil
    end
  end
end
