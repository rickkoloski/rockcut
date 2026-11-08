defmodule RockcutApiWeb.WrongTypeIdsSweepTest do
  @moduledoc """
  D55 lead decisions 6, gap 11: a parent id of the wrong type (`"abc"`, `1.5`,
  `true`, `[]`, `{}`) is 422 on that field, never 500, and never ignored.
  DEV QA saw 500s on shift `position_id` and time off / availability `user_id`
  (read by the controller before any changeset), and `user_id: "abc"` created
  the request for the caller.

  The sweep is built from the router and the schemas: every signed-in write
  route, with every `belongs_to` key of every schema (plus `user_id`, `id`,
  `ids`) in the body, is 422 "is invalid" for each shape, as the owner and as
  `taproomDevice`; and each key alone is 422 on that key. A new route or a
  new parent field is swept the day it's added.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures

  alias RockcutApi.Repo

  @shapes ["abc", 1.5, true, [], %{}]

  @keys %{
    "dept" => "bar",
    "board" => "bar",
    "key" => "all",
    "token" => "not-a-token",
    "on_date" => "2026-11-10",
    "index" => "0"
  }

  setup do
    p = personas(~w(owner barMgr))
    {_device, token} = taproom_device()
    %{owner: p["owner"], mgr: p["barMgr"], token: token}
  end

  defp req(conn, verb, path, body) do
    conn =
      conn
      |> put_req_header("content-type", "application/json")
      |> dispatch(@endpoint, verb, path, Jason.encode!(body))

    {conn.status, if(conn.resp_body in ["", nil], do: nil, else: Jason.decode!(conn.resp_body))}
  end

  defp write_routes do
    RockcutApiWeb.Router.__routes__()
    |> Enum.filter(&(&1.verb in [:post, :put, :patch, :delete]))
    |> Enum.filter(fn r ->
      info = Phoenix.Router.route_info(RockcutApiWeb.Router, verb(r), fill(r.path), nil)
      Enum.any?(info.pipe_through, &(&1 in [:authenticated, :device_allowed]))
    end)
  end

  defp verb(r), do: r.verb |> Atom.to_string() |> String.upcase()

  defp fill(path) do
    Regex.replace(~r/:([a-z_]+)/, path, fn _, p ->
      if RockcutApiWeb.Plugs.PathIds.id_param?(p), do: "1", else: Map.fetch!(@keys, p)
    end)
  end

  defp parent_keys do
    {:ok, mods} = :application.get_key(:rockcut_api, :modules)

    from_schemas =
      for m <- mods,
          Code.ensure_loaded?(m),
          function_exported?(m, :__schema__, 1),
          m.__schema__(:source),
          name <- m.__schema__(:associations),
          %Ecto.Association.BelongsTo{owner_key: key} <- [m.__schema__(:association, name)],
          do: Atom.to_string(key)

    Enum.uniq(from_schemas ++ ["user_id", "id", "ids"])
  end

  test "the sweep has routes and keys (not empty by mistake)" do
    assert length(write_routes()) >= 150
    assert length(parent_keys()) >= 30
  end

  defp bad_body(keys, shape) do
    # An empty list is a list of no ids, fine under `ids`/`*_ids`.
    for k <- keys, not (shape == [] and String.ends_with?(k, "ids")), into: %{}, do: {k, shape}
  end

  defp invalid?({422, %{"errors" => errors}}, keys),
    do:
      match?([{k, ["is invalid"]}] when is_binary(k), Map.to_list(errors)) and
        Enum.all?(Map.keys(errors), &(&1 in keys))

  defp invalid?(_, _), do: false

  test "every write route, every wrong shape: 422 \"is invalid\" (owner and taproomDevice)", c do
    keys = parent_keys()
    owner_token = RockcutApi.AccountsFixtures.session_token_fixture(c.owner)

    failures =
      for {who, token} <- [{"owner", owner_token}, {"taproomDevice", c.token}],
          r <- write_routes(),
          shape <- @shapes,
          result = req(as_token(token), r.verb, fill(r.path), bad_body(keys, shape)),
          # DeviceGate answers a route the tablet can't reach before the id check.
          not (who == "taproomDevice" and elem(result, 0) == 403),
          not invalid?(result, keys),
          do: "#{who} #{r.verb} #{r.path} #{inspect(shape)} → #{inspect(result)}"

    assert failures == [], "Not 422 \"is invalid\":\n" <> Enum.join(Enum.take(failures, 40), "\n")
  end

  test "every parent key, every wrong shape: 422 \"is invalid\" on that key", c do
    token = RockcutApi.AccountsFixtures.session_token_fixture(c.owner)

    failures =
      for key <- parent_keys(),
          shape <- @shapes,
          not (shape == [] and String.ends_with?(key, "ids")),
          result =
            req(as_token(token), :post, "/api/recipes", %{key => shape, "batch_size" => 15}),
          result != {422, %{"errors" => %{key => ["is invalid"]}}},
          do: "#{key}=#{inspect(shape)} → #{inspect(result)}"

    assert failures == [], Enum.join(failures, "\n")
  end

  @shift %{starts_at: "2026-12-01T15:00:00Z", ends_at: "2026-12-01T20:00:00Z"}
  @time_off %{type: "pto", all_day: true, starts_at: "2026-12-01", ends_at: "2026-12-01"}
  @availability %{weekday: 1, kind: "unavailable", all_day: true}

  defp counts do
    for s <- [
          RockcutApi.Scheduling.Shift,
          RockcutApi.TimeOff.Request,
          RockcutApi.Availability.Slot
        ],
        do: Repo.aggregate(s, :count)
  end

  test "QA's cases: shift position_id, time off and availability user_id; nothing saved",
       %{mgr: mgr} do
    before = counts()

    for {path, body, key} <- [
          {"/api/shifts", @shift, "position_id"},
          {"/api/time_off", @time_off, "user_id"},
          {"/api/availability", @availability, "user_id"}
        ],
        shape <- ["abc", "12abc" | @shapes] do
      assert {422, %{"errors" => %{^key => ["is invalid"]}}} =
               req(as(mgr), :post, path, Map.put(body, key, shape)),
             "#{path} #{key}=#{inspect(shape)}"
    end

    assert counts() == before
  end
end
