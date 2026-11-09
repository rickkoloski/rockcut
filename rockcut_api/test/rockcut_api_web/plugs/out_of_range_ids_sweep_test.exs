defmodule RockcutApiWeb.OutOfRangeIdsSweepTest do
  @moduledoc """
  D55 §2.11, T13: every route in the router with an `id` or `*_id` URL param,
  called with `99999999999999999999` there, is 404, never 500: as the owner,
  and as `taproomDevice` (a route the tablet can't reach is DeviceGate's 403
  first; one it can reach must be 404). Built from the router, so a new route
  is swept the day it's added. Keys keep usable values (a real department,
  board and channel key).
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures

  alias RockcutApiWeb.Plugs.PathIds

  @huge "99999999999999999999"

  # Usable values for the params that aren't ids.
  @keys %{
    "dept" => "bar",
    "board" => "bar",
    "key" => "all",
    "token" => "not-a-token",
    "on_date" => "2026-11-10",
    "index" => "0"
  }

  @gate %{"error" => "Not available on a shared device"}
  # 14 at D55 (of 178 id routes): shifts, production steps and CIPs, the
  # Boards' card reads, the task board's tablet routes.
  @device_reachable 14

  defp id_routes do
    RockcutApiWeb.Router.__routes__()
    |> Enum.reject(&String.starts_with?(&1.path, "/dev"))
    |> Enum.filter(fn r -> r.path |> params() |> Enum.any?(&PathIds.id_param?/1) end)
  end

  defp params(path), do: for([_, p] <- Regex.scan(~r/:([a-z_]+)/, path), do: p)

  defp fill(path) do
    Regex.replace(~r/:([a-z_]+)/, path, fn _, p ->
      if PathIds.id_param?(p), do: @huge, else: Map.fetch!(@keys, p)
    end)
  end

  defp send(conn, verb, path) do
    conn
    |> put_req_header("content-type", "application/json")
    |> dispatch(@endpoint, verb, path, "{}")
  end

  setup do
    p = personas(~w(owner))
    {_device, token} = taproom_device()
    %{owner: p["owner"], token: token}
  end

  test "the router has id routes to sweep (the list isn't empty by mistake)" do
    assert length(id_routes()) >= 178
  end

  test "T13: an out-of-range URL id is 404 on every route, as the owner", %{owner: owner} do
    failures =
      for r <- id_routes(),
          path = fill(r.path),
          status = send(as(owner), r.verb, path).status,
          status != 404,
          do: "#{r.verb} #{r.path} → #{status}"

    assert failures == [], "Not 404:\n" <> Enum.join(failures, "\n")
  end

  test "T13: as taproomDevice, 404 on every route it can reach (others are DeviceGate's 403)",
       %{token: token} do
    results =
      for r <- id_routes() do
        conn = send(as_token(token), r.verb, fill(r.path))
        gate? = conn.status == 403 and Jason.decode!(conn.resp_body) == @gate
        {"#{r.verb} #{r.path} → #{conn.status}", conn.status == 404, gate?}
      end

    failures = for {line, false, false} <- results, do: line
    assert failures == [], "Neither 404 nor the gate's 403:\n" <> Enum.join(failures, "\n")

    # The tablet's own id routes (shifts, steps, CIPs, Boards, its task board) were reached.
    assert Enum.count(results, &elem(&1, 1)) >= @device_reachable
  end
end
