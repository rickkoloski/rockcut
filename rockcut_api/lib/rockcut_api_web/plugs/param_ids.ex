defmodule RockcutApiWeb.Plugs.ParamIds do
  @moduledoc """
  D55 §2.11: an id in the query or the body (a key `id`, `ids`, `*_id` or
  `*_ids`, at any depth) that is a number past SQLite's range is a 422 on
  that key, before any controller runs. It can't be a row, and the database
  driver refuses it, which was a 500 (shifts, time off, devices, recipes, …).

  Only out-of-range numbers (an integer, or a string of digits) are refused
  here: junk (`"abc"`, `-1`, `0`) keeps whatever answer the route gave it
  (a changeset 422, a 404 for a missing row). `before_id` is left alone: D38's
  rule puts an unknown one at the end of the list.
  """
  import Plug.Conn

  @max 9_223_372_036_854_775_807
  @exempt ~w(before_id)

  def init(opts), do: opts

  def call(conn, _opts) do
    params = [conn.query_params, conn.body_params] |> Enum.filter(&is_map/1)

    case Enum.find_value(params, &first_bad/1) do
      nil ->
        conn

      key ->
        conn
        |> put_resp_content_type("application/json")
        |> send_resp(422, Jason.encode!(%{errors: %{key => ["is out of range"]}}))
        |> halt()
    end
  end

  # The first key holding an out-of-range id, at any depth.
  defp first_bad(map) when is_map(map) and not is_struct(map) do
    Enum.find_value(map, fn {key, value} ->
      key = to_string(key)

      cond do
        id_key?(key) and value |> List.wrap() |> Enum.any?(&out_of_range?/1) -> key
        true -> first_bad(value)
      end
    end)
  end

  defp first_bad(list) when is_list(list), do: Enum.find_value(list, &first_bad/1)
  defp first_bad(_), do: nil

  defp id_key?(key) when key in @exempt, do: false

  defp id_key?(key),
    do:
      key in ["id", "ids"] or String.ends_with?(key, "_id") or
        String.ends_with?(key, "_ids")

  defp out_of_range?(n) when is_integer(n), do: abs(n) > @max

  defp out_of_range?(s) when is_binary(s) do
    case Integer.parse(s) do
      {n, ""} -> abs(n) > @max
      _ -> false
    end
  end

  defp out_of_range?(_), do: false
end
