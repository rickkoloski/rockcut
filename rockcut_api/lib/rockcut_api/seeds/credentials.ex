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
    case System.get_env("SEED_PASSWORD") || from_env_file("SEED_PASSWORD") do
      value when is_binary(value) and value != "" -> {:ok, value}
      _ -> :error
    end
  end

  @doc """
  The persona staff codes from `SYNTHETIC_STAFF_CODES`: `{:ok, %{key => code}}`,
  or `:unset`. A malformed list raises: each entry is `persona:code`, codes are
  4 digits, and no persona or code repeats.
  """
  def staff_codes do
    case System.get_env("SYNTHETIC_STAFF_CODES") || from_env_file("SYNTHETIC_STAFF_CODES") do
      value when is_binary(value) and value != "" -> {:ok, parse_staff_codes!(value)}
      _ -> :unset
    end
  end

  @doc false
  def parse_staff_codes!(value) do
    pairs =
      value
      |> String.split(",", trim: true)
      |> Enum.map(fn entry ->
        case String.split(String.trim(entry), ":", parts: 2) do
          [key, code] when key != "" -> {String.trim(key), String.trim(code)}
          _ -> raise ArgumentError, bad_codes("an entry isn't persona:code")
        end
      end)

    cond do
      pairs == [] ->
        raise ArgumentError, bad_codes("it's empty")

      Enum.any?(pairs, fn {_, code} -> not Regex.match?(~r/^\d{4}$/, code) end) ->
        raise ArgumentError, bad_codes("each code must be 4 digits")

      length(Enum.uniq_by(pairs, &elem(&1, 0))) != length(pairs) ->
        raise ArgumentError, bad_codes("a persona is listed twice")

      length(Enum.uniq_by(pairs, &elem(&1, 1))) != length(pairs) ->
        raise ArgumentError, bad_codes("two personas share a code")

      true ->
        Map.new(pairs)
    end
  end

  # Never echoes the value: the codes are secrets.
  defp bad_codes(reason),
    do:
      "SYNTHETIC_STAFF_CODES is malformed: #{reason}. Expected persona:code pairs, " <>
        "comma-separated, e.g. bartender1:1234,bartender2:5678 (values not shown)."

  defp from_env_file(name) do
    with path when is_binary(path) <- env_file(),
         {:ok, contents} <- File.read(path) do
      contents
      |> String.split("\n")
      |> Enum.find_value(fn line ->
        case String.split(String.trim(line), "=", parts: 2) do
          [^name, value] -> value |> String.trim() |> String.trim("\"")
          _ -> nil
        end
      end)
    else
      _ -> nil
    end
  end
end
