defmodule RockcutApiWeb.Plugs.ParamIds do
  @moduledoc """
  D55 §2.11: an id in the query or the body (a key `id`, `ids`, `*_id` or
  `*_ids`, at any depth) that can't be an id is a 422, before any controller
  runs:

    * a number past SQLite's range (an integer, or a string of digits):
      "is out of range". The database driver refuses it, which was a 500
      (shifts, time off, devices, recipes, …).
    * the wrong type (lead decisions 6, gap 11): `"abc"`, `"12abc"`, `1.5`,
      `true`, a list or a map (or, under `ids`/`*_ids`, anything but a list
      of ids): "is invalid". Controllers read some ids before any changeset
      (a shift's `position_id`, time off and availability `user_id`), which
      was a 500 or, for a string, silently ignored.

  An id at the top level is reported on its key; one nested inside another
  value is reported on that top-level key (`memberships`, gap 7), like the
  other malformed shapes there.

  `nil`, `""` and any in-range integer (`0`, `-1`, a missing row) are left to
  the route (a changeset 422 "does not exist", a 404). `before_id` is left
  alone: D38's rule puts an unknown one at the end of the list.
  """
  import Plug.Conn

  @max 9_223_372_036_854_775_807
  @exempt ~w(before_id)

  def init(opts), do: opts

  def call(conn, _opts) do
    params = [conn.query_params, conn.body_params] |> Enum.filter(&is_map/1)

    case Enum.find_value(params, &first_bad_top/1) do
      nil ->
        conn

      {key, message} ->
        conn
        |> put_resp_content_type("application/json")
        |> send_resp(422, Jason.encode!(%{errors: %{key => [message]}}))
        |> halt()
    end
  end

  # {top-level key, message} for the first bad id, at any depth.
  defp first_bad_top(params) when is_map(params) and not is_struct(params) do
    Enum.find_value(params, fn {key, value} ->
      key = to_string(key)

      case if(id_key?(key), do: check(key, value), else: first_bad(value)) do
        nil -> nil
        message -> {key, message}
      end
    end)
  end

  defp first_bad_top(_), do: nil

  # The message for the first bad id inside `value`, or nil.
  defp first_bad(map) when is_map(map) and not is_struct(map) do
    Enum.find_value(map, fn {key, value} ->
      key = to_string(key)
      if id_key?(key), do: check(key, value), else: first_bad(value)
    end)
  end

  defp first_bad(list) when is_list(list), do: Enum.find_value(list, &first_bad/1)
  defp first_bad(_), do: nil

  defp check(key, value) do
    if many?(key) do
      if is_list(value), do: Enum.find_value(value, &problem/1), else: problem_many(value)
    else
      problem(value)
    end
  end

  defp problem_many(value) when value in [nil, ""], do: nil
  defp problem_many(_), do: "is invalid"

  # nil if `value` could be an id (or is no id at all), else the message.
  defp problem(value) when value in [nil, ""], do: nil
  defp problem(n) when is_integer(n), do: if(abs(n) > @max, do: "is out of range")

  defp problem(s) when is_binary(s) do
    case Integer.parse(s) do
      {n, ""} -> problem(n)
      _ -> "is invalid"
    end
  end

  defp problem(_), do: "is invalid"

  defp many?(key), do: key == "ids" or String.ends_with?(key, "_ids")

  defp id_key?(key) when key in @exempt, do: false

  defp id_key?(key),
    do:
      key in ["id", "ids"] or String.ends_with?(key, "_id") or
        String.ends_with?(key, "_ids")
end
