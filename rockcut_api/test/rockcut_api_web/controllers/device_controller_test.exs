defmodule RockcutApiWeb.DeviceControllerTest do
  @moduledoc "D33: Shared devices API (S1, S2, S3, S4, S11)."
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Devices, Repo}
  alias RockcutApi.Accounts.AuditEntry
  alias RockcutApi.Devices.PairingRateLimiter

  setup do
    PairingRateLimiter.reset()
    p = personas(~w(owner barMgr breweryMgr bartender1 dualMgr))
    {device, token} = taproom_device()
    %{p: p, device: device, token: token}
  end

  defp exchange(code, name, ip \\ "10.9.9.9") do
    build_conn()
    |> put_req_header("fly-client-ip", ip)
    |> post("/api/device_tokens", %{code: code, name: name})
  end

  describe "device accounts" do
    test "owner creates, renames, deactivates and deletes (S1)", %{p: p} do
      bar = departments()["bar"]

      body =
        call(p["owner"], :post, "/api/devices", %{
          name: "Taproom tablets 2",
          home_department_id: bar.id
        })
        |> json_response(201)

      id = body["data"]["id"]
      assert body["data"]["home_department"]["key"] == "bar"

      assert call(p["owner"], :patch, "/api/devices/#{id}", %{name: "Front bar"})
             |> json_response(200)
             |> get_in(["data", "name"]) == "Front bar"

      refute call(p["owner"], :patch, "/api/devices/#{id}", %{active: false})
             |> json_response(200)
             |> get_in(["data", "active"])

      # Not in Users & Roles or the roster.
      refute id in data_ids(call(p["owner"], :get, "/api/users"))
      refute id in data_ids(call(p["owner"], :get, "/api/roster"))

      assert call(p["owner"], :delete, "/api/devices/#{id}").status == 204
      assert call(p["owner"], :get, "/api/devices") |> data_ids() |> Enum.member?(id) == false
    end

    test "any assignable department can be home (lead decision 6)", %{p: p} do
      brewery = departments()["brewery"]

      assert call(p["owner"], :post, "/api/devices", %{
               name: "Cellar tablet",
               home_department_id: brewery.id
             }).status ==
               201
    end

    test "managers can't create, rename or delete devices", %{p: p, device: d} do
      bar = departments()["bar"]

      assert call(p["barMgr"], :post, "/api/devices", %{name: "x", home_department_id: bar.id}).status ==
               403

      assert call(p["barMgr"], :patch, "/api/devices/#{d.id}", %{name: "y"}).status == 403
      assert call(p["barMgr"], :delete, "/api/devices/#{d.id}").status == 403
    end

    test "who sees which devices (lead decision 8)", %{p: p, device: d} do
      assert d.id in data_ids(call(p["owner"], :get, "/api/devices"))
      assert d.id in data_ids(call(p["barMgr"], :get, "/api/devices"))
      assert d.id in data_ids(call(p["dualMgr"], :get, "/api/devices"))
      assert data_ids(call(p["breweryMgr"], :get, "/api/devices")) == []
      assert data_ids(call(p["bartender1"], :get, "/api/devices")) == []
    end

    test "a person's id is not a device", %{p: p} do
      assert call(p["owner"], :patch, "/api/devices/#{p["bartender1"].id}", %{name: "x"}).status ==
               404
    end
  end

  describe "pairing (S2, S3, S4)" do
    test "barMgr pairs a tablet; it signs in and is listed with last seen (S2)", %{
      p: p,
      device: d
    } do
      %{"code" => code} =
        call(p["barMgr"], :post, "/api/devices/#{d.id}/pairing_code") |> json_response(201)

      body = exchange(code, "Taproom iPad 9") |> json_response(201)
      assert "dev_" <> _ = body["token"]
      assert body["user"]["kind"] == "device"

      assert call_device(body["token"], :get, "/api/me").status == 200

      [dev] = call(p["barMgr"], :get, "/api/devices") |> json_response(200) |> Map.fetch!("data")
      tablet = Enum.find(dev["tokens"], &(&1["name"] == "Taproom iPad 9"))
      assert tablet["paired_by"]["id"] == p["barMgr"].id
      assert tablet["last_seen_at"]
    end

    test "breweryMgr can't pair or revoke taproom tablets (S3)", %{p: p, device: d} do
      assert call(p["breweryMgr"], :post, "/api/devices/#{d.id}/pairing_code").status == 404
      [row] = Repo.all(RockcutApi.Devices.DeviceToken)
      assert call(p["breweryMgr"], :delete, "/api/device_tokens/#{row.id}").status == 404
      assert call(p["bartender1"], :post, "/api/devices/#{d.id}/pairing_code").status == 404
    end

    test "used, expired and wrong codes get one message; 6th wrong is 429 (S4)", %{
      p: p,
      device: d
    } do
      %{"code" => code} =
        call(p["owner"], :post, "/api/devices/#{d.id}/pairing_code") |> json_response(201)

      assert exchange(code, "iPad A").status == 201
      used = exchange(code, "iPad B") |> json_response(422)
      assert used["error"] =~ "invalid or has expired"

      ip = "10.1.2.3"
      for _ <- 1..4, do: assert(exchange("WRONG-CODE", "x", ip).status == 422)
      # 5 wrong now (the used-code attempt was another IP) → one more wrong, then limited.
      assert exchange("WRONG-CODE", "x", ip).status == 422
      assert exchange("WRONG-CODE", "x", ip) |> json_response(429)
    end

    test "a deactivated device can't get a code", %{p: p, device: d} do
      {:ok, _} = Devices.update_device(d, %{"active" => false}, p["owner"])
      assert call(p["owner"], :post, "/api/devices/#{d.id}/pairing_code").status == 422
    end
  end

  describe "revoke (S11)" do
    test "barMgr revokes one tablet; the other keeps working", %{p: p, device: d, token: t1} do
      t2 = RockcutApi.AccountsFixtures.device_token_fixture(d, "Taproom iPad 2")
      {:ok, _, row1} = Devices.authenticate_token(t1)

      assert call(p["barMgr"], :delete, "/api/device_tokens/#{row1.id}").status == 204
      assert call_device(t1, :get, "/api/me").status == 401
      assert call_device(t2, :get, "/api/me").status == 200

      assert Repo.exists?(
               from(a in AuditEntry, where: a.action == "device.revoked" and a.target_id == ^d.id)
             )
    end
  end
end
