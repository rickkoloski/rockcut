defmodule RockcutApi.AuthzParity.TimeOffTest do
  @moduledoc """
  D31 parity — D29 Appendix A rows 16, 18–22 (time off). Row 17
  (`TimeOff.can_view?/2`) has no callers today, so it has no entry point to
  test (like row 42).
  """
  use RockcutApiWeb.ConnCase

  import RockcutApi.PersonaFixtures

  alias RockcutApi.TimeOff

  @requesters ~w(bartender1 brewer1 floater office1 splitRole barMgr noDept)

  setup do
    p = personas()

    reqs =
      Map.new(@requesters, fn who ->
        {:ok, r} = TimeOff.create(base(), p[who])
        {who, r}
      end)

    %{p: p, reqs: reqs}
  end

  defp base,
    do: %{
      "type" => "pto",
      "all_day" => true,
      "starts_at" => "2026-10-01T16:00:00Z",
      "ends_at" => "2026-10-03T00:00:00Z"
    }

  defp requester_keys(conn, p) do
    by_id = Map.new(p, fn {k, u} -> {u.id, k} end)

    conn.resp_body
    |> Jason.decode!()
    |> Map.fetch!("data")
    |> Enum.map(&by_id[&1["user_id"]])
    |> MapSet.new()
  end

  describe "list" do
    for {who, sees} <- [
          {"owner", ~w(bartender1 brewer1 floater office1 splitRole barMgr noDept)},
          {"barMgr", ~w(barMgr bartender1 floater splitRole)},
          {"dualMgr", ~w(bartender1 floater splitRole barMgr office1)},
          {"breweryMgr", ~w(brewer1 floater splitRole)},
          {"splitRole", ~w(splitRole bartender1 floater barMgr)},
          {"bartender1", ~w(bartender1)},
          {"floater", ~w(floater)},
          {"noDept", ~w(noDept)},
          {"sales1", []}
        ] do
      test "#16 #{who} lists time off → requests from #{Enum.join(sees, ", ")}", %{p: p} do
        conn = call(p[unquote(who)], :get, "/api/time_off")
        assert conn.status == 200
        assert requester_keys(conn, p) == MapSet.new(unquote(sees))
      end
    end
  end

  describe "request for self" do
    for who <- ~w(noDept bartender1 barMgr owner) do
      test "#18 #{who} requests time off for themselves → 201 pending", %{p: p} do
        conn = call(p[unquote(who)], :post, "/api/time_off", base())
        assert conn.status == 201
        data = Jason.decode!(conn.resp_body)["data"]
        assert data["status"] == "pending"
        assert data["user_id"] == p[unquote(who)].id
      end
    end
  end

  describe "request on behalf" do
    for {who, target, code} <- [
          {"owner", "noDept", 201},
          {"owner2", "brewer1", 201},
          {"barMgr", "bartender1", 201},
          {"barMgr", "floater", 201},
          {"barMgr", "brewer1", 403},
          {"dualMgr", "office1", 201},
          {"dualMgr", "brewer1", 403},
          {"breweryMgr", "floater", 201},
          {"breweryMgr", "splitRole", 201},
          {"splitRole", "bartender1", 201},
          {"splitRole", "brewer1", 403},
          {"bartender1", "bartender2", 403},
          {"barMgr", "noDept", 403}
        ] do
      test "#19 #{who} enters time off for #{target} → #{code}", %{p: p} do
        conn =
          call(
            p[unquote(who)],
            :post,
            "/api/time_off",
            Map.put(base(), "user_id", p[unquote(target)].id)
          )

        assert conn.status == unquote(code)

        if unquote(code) == 201 do
          assert Jason.decode!(conn.resp_body)["data"]["status"] == "approved"
        end
      end
    end
  end

  describe "review" do
    for {who, requester, code} <- [
          {"owner", "bartender1", 200},
          {"owner2", "noDept", 200},
          {"barMgr", "bartender1", 200},
          {"barMgr", "floater", 200},
          {"barMgr", "splitRole", 200},
          {"barMgr", "brewer1", 403},
          {"barMgr", "noDept", 403},
          {"breweryMgr", "floater", 200},
          {"breweryMgr", "splitRole", 200},
          {"breweryMgr", "bartender1", 403},
          {"dualMgr", "office1", 200},
          {"dualMgr", "brewer1", 403},
          {"splitRole", "bartender1", 200},
          {"splitRole", "brewer1", 403},
          {"bartender1", "floater", 403},
          {"floater", "brewer1", 403}
        ] do
      test "#20 #{who} approves #{requester}'s request → #{code}", %{p: p, reqs: reqs} do
        assert status(
                 p[unquote(who)],
                 :post,
                 "/api/time_off/#{reqs[unquote(requester)].id}/review",
                 %{
                   status: "approved"
                 }
               ) == unquote(code)
      end
    end
  end

  describe "self-review" do
    for {who, code} <- [
          {"barMgr", 200},
          {"splitRole", 200},
          {"bartender1", 403},
          {"floater", 403},
          {"noDept", 403}
        ] do
      test "#21 #{who} approves their own request → #{code}", %{p: p, reqs: reqs} do
        assert status(p[unquote(who)], :post, "/api/time_off/#{reqs[unquote(who)].id}/review", %{
                 status: "approved"
               }) == unquote(code)
      end
    end

    test "#21 owner approves their own request → 200", %{p: p} do
      {:ok, r} = TimeOff.create(base(), p["owner"])

      assert status(p["owner"], :post, "/api/time_off/#{r.id}/review", %{status: "approved"}) ==
               200
    end
  end

  describe "cancel" do
    test "#22 the requester cancels their pending request → 200", %{p: p, reqs: reqs} do
      assert status(p["bartender1"], :post, "/api/time_off/#{reqs["bartender1"].id}/cancel") ==
               200
    end

    test "#22 the requester cancels their approved request → 200", %{p: p, reqs: reqs} do
      {:ok, _} = TimeOff.review(reqs["bartender1"], p["barMgr"], "approved", nil)

      assert status(p["bartender1"], :post, "/api/time_off/#{reqs["bartender1"].id}/cancel") ==
               200
    end

    test "#22 the requester can't cancel a denied request → 422", %{p: p, reqs: reqs} do
      {:ok, _} = TimeOff.review(reqs["bartender1"], p["barMgr"], "denied", nil)

      assert status(p["bartender1"], :post, "/api/time_off/#{reqs["bartender1"].id}/cancel") ==
               422
    end

    for who <- ~w(barMgr owner owner2 bartender2) do
      test "#22 #{who} cancels bartender1's request → 403 (requester only, owners included)",
           %{p: p, reqs: reqs} do
        assert status(p[unquote(who)], :post, "/api/time_off/#{reqs["bartender1"].id}/cancel") ==
                 403
      end
    end
  end
end
