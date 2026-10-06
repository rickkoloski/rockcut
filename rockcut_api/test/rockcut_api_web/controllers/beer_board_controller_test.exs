defmodule RockcutApiWeb.BeerBoardControllerTest do
  @moduledoc "D37 §3.3 / §3.4: board routes for people and the Taproom tablet (S5–S17)."
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import Phoenix.ConnTest

  alias RockcutApi.{BeerBoard, StaffCodes}
  alias RockcutApi.StaffCodes.RateLimiter

  setup do
    RateLimiter.reset()
    p = personas(~w(owner barMgr breweryMgr bartender1 bartender2 brewer1 office1 floater))
    {:ok, _} = StaffCodes.set(p["bartender2"], "2468", p["barMgr"])
    {:ok, _} = StaffCodes.set(p["barMgr"], "1357", p["barMgr"])
    {device, token} = taproom_device()
    %{p: p, device: device, token: token}
  end

  defp add(p, who \\ "bartender1", attrs \\ %{}) do
    call(
      p[who],
      :post,
      "/api/beer_board",
      Map.merge(%{recipient_name: "Pat", purchaser_name: "Chris", beers: 3}, attrs)
    )
  end

  defp history(p, who \\ "barMgr", q \\ %{}),
    do: call(p[who], :get, "/api/beer_board/history", q) |> json_response(200)

  describe "people" do
    test "S5: a bartender adds with no code; no History", %{p: p} do
      assert %{"data" => %{"id" => id, "beers_remaining" => 3}} = add(p) |> json_response(201)

      assert [%{"id" => ^id}] =
               call(p["bartender1"], :get, "/api/beer_board")
               |> json_response(200)
               |> Map.get("data")

      assert call(p["bartender1"], :get, "/api/beer_board/history").status == 403
    end

    test "S6: the manager's History names the person", %{p: p} do
      add(p)

      assert [%{"actor_name" => "Sam Pour", "action" => "created", "on_shared_device" => false}] =
               history(p)["data"]
    end

    test "S19: edit, then redeem, then delete", %{p: p} do
      %{"data" => %{"id" => id}} = add(p) |> json_response(201)

      assert %{"data" => %{"beers_remaining" => 5}} =
               call(p["bartender1"], :patch, "/api/beer_board/#{id}", %{beers_remaining: 5})
               |> json_response(200)

      assert %{"data" => %{"beers_remaining" => 3}} =
               call(p["bartender1"], :post, "/api/beer_board/#{id}/redeem", %{count: 2})
               |> json_response(200)

      assert %{"removed" => true, "data" => nil} =
               call(p["bartender1"], :delete, "/api/beer_board/#{id}") |> json_response(200)

      assert Enum.map(history(p)["data"], & &1["action"]) == ~w(deleted redeemed edited created)
    end

    test "S8/S17: the last beer removes the entry; a second try says it's gone", %{p: p} do
      %{"data" => %{"id" => id}} = add(p, "bartender1", %{beers: 1}) |> json_response(201)

      assert %{"removed" => true} =
               call(p["bartender1"], :post, "/api/beer_board/#{id}/redeem") |> json_response(200)

      assert %{"error" => "gone", "message" => "This entry was already removed"} =
               call(p["bartender2"], :post, "/api/beer_board/#{id}/redeem") |> json_response(404)
    end

    test "redeeming more than are left", %{p: p} do
      %{"data" => %{"id" => id}} = add(p, "bartender1", %{beers: 2}) |> json_response(201)

      assert %{"message" => "Only 2 left"} =
               call(p["bartender1"], :post, "/api/beer_board/#{id}/redeem", %{count: 3})
               |> json_response(422)
    end

    test "validation errors come back per field", %{p: p} do
      assert %{"errors" => %{"recipient_name" => _}} =
               add(p, "bartender1", %{recipient_name: ""}) |> json_response(422)
    end

    test "S14/S16: floater and owner have access; owner sees History", %{p: p} do
      assert add(p, "floater").status == 201
      assert add(p, "owner").status == 201
      assert length(history(p, "owner")["data"]) == 2
    end

    test "S15: other departments get 403 everywhere", %{p: p} do
      %{"data" => %{"id" => id}} = add(p) |> json_response(201)

      for who <- ~w(office1 brewer1 breweryMgr) do
        assert call(p[who], :get, "/api/beer_board").status == 403
        assert add(p, who).status == 403
        assert call(p[who], :post, "/api/beer_board/#{id}/redeem").status == 403
        assert call(p[who], :get, "/api/beer_board/history").status == 403
      end
    end

    test "History search matches either name", %{p: p} do
      add(p, "bartender1", %{recipient_name: "Ana", purchaser_name: "Bo"})
      add(p, "bartender1", %{recipient_name: "Chris", purchaser_name: "Dee"})
      assert [%{"recipient_name" => "Ana"}] = history(p, "barMgr", %{q: "bo"})["data"]
      assert %{"total" => 2, "page" => 1, "per_page" => 50} = history(p)
    end
  end

  describe "the Taproom tablet" do
    test "reads the board", %{p: p, token: token} do
      add(p)

      assert [%{"recipient_name" => "Pat"}] =
               call_device(token, :get, "/api/beer_board")
               |> json_response(200)
               |> Map.get("data")
    end

    test "S7: a write with a staff code is the person's, on the shared device", %{
      p: p,
      token: token
    } do
      %{"data" => %{"id" => id}} = add(p) |> json_response(201)

      conn = call_device(token, :post, "/api/beer_board/#{id}/redeem", %{staff_code: "2468"})

      assert %{"data" => %{"beers_remaining" => 2}, "recorded_as" => "Alex Draft"} =
               json_response(conn, 200)

      assert [
               %{"actor_name" => "Alex Draft", "on_shared_device" => true, "action" => "redeemed"}
               | _
             ] =
               history(p)["data"]
    end

    test "S10: no code → 422 staff_code_required, nothing changes", %{p: p, token: token} do
      assert %{"error" => "staff_code_required"} =
               call_device(token, :post, "/api/beer_board", %{
                 recipient_name: "Pat",
                 purchaser_name: "Chris",
                 beers: 1
               })
               |> json_response(422)

      assert BeerBoard.list_entries() == []
      assert history(p)["data"] == []
    end

    test "S9: the 5th wrong code locks the tablet; even a right code waits", %{token: token} do
      body = %{recipient_name: "Pat", purchaser_name: "Chris", beers: 1}

      for _ <- 1..4 do
        assert %{"error" => "staff_code_invalid"} =
                 call_device(token, :post, "/api/beer_board", Map.put(body, :staff_code, "0000"))
                 |> json_response(422)
      end

      assert %{"error" => "staff_code_locked", "retry_after_minutes" => 10} =
               call_device(token, :post, "/api/beer_board", Map.put(body, :staff_code, "0000"))
               |> json_response(429)

      assert %{"error" => "staff_code_locked"} =
               call_device(token, :post, "/api/beer_board", Map.put(body, :staff_code, "2468"))
               |> json_response(429)

      assert BeerBoard.list_entries() == []
    end

    test "a missing code doesn't count toward the lock", %{token: token} do
      body = %{recipient_name: "Pat", purchaser_name: "Chris", beers: 1}
      for _ <- 1..6, do: call_device(token, :post, "/api/beer_board", body)

      assert call_device(token, :post, "/api/beer_board", Map.put(body, :staff_code, "2468")).status ==
               201
    end

    test "S12: a code of someone who left the Taproom is just wrong", %{p: p, token: token} do
      {:ok, _} =
        RockcutApi.Accounts.set_memberships(
          p["bartender2"],
          [%{"department" => "office", "role" => "employee"}],
          p["owner"]
        )

      assert %{"error" => "staff_code_invalid"} =
               call_device(token, :post, "/api/beer_board", %{
                 recipient_name: "P",
                 purchaser_name: "C",
                 beers: 1,
                 staff_code: "2468"
               })
               |> json_response(422)
    end

    test "S11: a manager's code doesn't open History on the tablet", %{token: token} do
      conn = call_device(token, :get, "/api/beer_board/history", %{staff_code: "1357"})
      assert json_response(conn, 403)["error"] == "Not available on a shared device"
    end

    test "a tablet from another department can't read the board" do
      brewery_tablet =
        RockcutApi.AccountsFixtures.device_fixture(%{home: "brewery", name: "Brew tablet"})

      token = RockcutApi.AccountsFixtures.device_token_fixture(brewery_tablet)
      assert call_device(token, :get, "/api/beer_board").status == 403
    end
  end
end
