defmodule RockcutApiWeb.AuthPlugDeviceTest do
  @moduledoc "D33 §3.2: AuthPlug and tablet tokens (S11, S12)."
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.AccountsFixtures

  alias RockcutApi.Devices

  setup do
    {device, token} = taproom_device()
    %{device: device, token: token, owner: owner_fixture()}
  end

  test "a valid dev_ token authenticates as the device", %{token: t, device: d} do
    body = call_device(t, :get, "/api/me") |> json_response(200)
    assert body["user"]["id"] == d.id
    assert body["user"]["kind"] == "device"
  end

  test "an unknown dev_ token is 401" do
    assert call_device("dev_unknown", :get, "/api/me").status == 401
  end

  test "revoking one tablet signs out only that tablet (S11)", %{device: d, token: t1, owner: o} do
    t2 = device_token_fixture(d, "Taproom iPad 2")
    {:ok, _, row1} = Devices.authenticate_token(t1)
    {:ok, _} = Devices.revoke_token(row1, o)

    assert call_device(t1, :get, "/api/me").status == 401
    assert call_device(t2, :get, "/api/me").status == 200
  end

  test "deactivating the account signs out every tablet (S12)", %{device: d, token: t1, owner: o} do
    t2 = device_token_fixture(d, "Taproom iPad 2")
    {:ok, _} = Devices.update_device(d, %{"active" => false}, o)

    assert call_device(t1, :get, "/api/me").status == 401
    assert call_device(t2, :get, "/api/me").status == 401
  end

  test "a signed session token for a device user is refused (lead decision 2)", %{device: d} do
    token = Phoenix.Token.sign(RockcutApiWeb.Endpoint, "user auth", d.id)
    conn = build_conn() |> put_req_header("authorization", "Bearer #{token}") |> get("/api/me")
    assert conn.status == 401
  end

  test "signing out on the tablet revokes its token", %{token: t} do
    assert call_device(t, :delete, "/api/session").status == 200
    assert call_device(t, :get, "/api/me").status == 401
  end

  test "a person's sign-out still leaves the session token working (unchanged)" do
    p = user_fixture()
    assert call(p, :delete, "/api/session").status == 200
    assert call(p, :get, "/api/me").status == 200
  end
end
