defmodule RockcutApiWeb.ColorModeTest do
  @moduledoc "D43: `users.color_mode` — the person's theme and a shared tablet's (S143–S149)."
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Accounts, Devices, Repo, Sessions}
  alias RockcutApi.Accounts.{AuditEntry, User}
  alias RockcutApi.AccountsFixtures

  setup do
    p = personas(~w(owner breweryMgr barMgr brewer1 bartender1))
    device = AccountsFixtures.device_fixture(%{name: "Brewhouse tablet", home: "brewery"})
    token = AccountsFixtures.device_token_fixture(device, "Brewhouse tablet 1")
    %{p: p, device: device, token: token}
  end

  defp me(conn), do: conn |> json_response(200) |> Map.fetch!("color_mode")
  defp stored(%User{id: id}), do: Repo.get!(User, id).color_mode

  describe "users.color_mode" do
    test "defaults to light, for people and devices (S143)", %{p: p, device: device} do
      assert stored(p["brewer1"]) == "light"
      assert stored(device) == "light"
      assert call(p["brewer1"], :get, "/api/me") |> me() == "light"
    end

    test "only light, dark or device" do
      for mode <- ~w(light dark device) do
        assert User.color_mode_changeset(%User{}, %{color_mode: mode}).valid?
      end

      for bad <- ["Dark", "auto", "", nil] do
        refute User.color_mode_changeset(%User{}, %{color_mode: bad}).valid?, inspect(bad)
      end
    end
  end

  describe "PUT /api/me/color_mode" do
    test "a person sets their own and /api/me returns it (S144, S145)", %{p: p} do
      body = call(p["brewer1"], :put, "/api/me/color_mode", %{color_mode: "dark"})
      assert json_response(body, 200) == %{"color_mode" => "dark"}
      assert stored(p["brewer1"]) == "dark"
      # A new sign-in (another browser) gets it too.
      assert call(p["brewer1"], :get, "/api/me") |> me() == "dark"

      assert call(p["brewer1"], :put, "/api/me/color_mode", %{color_mode: "device"})
             |> json_response(200) == %{"color_mode" => "device"}
    end

    test "an invalid value is 422 and changes nothing", %{p: p} do
      for params <- [%{color_mode: "blue"}, %{color_mode: nil}, %{}] do
        conn = call(p["brewer1"], :put, "/api/me/color_mode", params)
        assert %{"errors" => %{"color_mode" => [_ | _]}} = json_response(conn, 422)
      end

      assert stored(p["brewer1"]) == "light"
    end

    test "writes no change-log entry", %{p: p} do
      before = Repo.aggregate(AuditEntry, :count)
      call(p["brewer1"], :put, "/api/me/color_mode", %{color_mode: "dark"})
      assert Repo.aggregate(AuditEntry, :count) == before
    end

    test "a device token is refused", %{token: t, device: device} do
      assert call_device(t, :put, "/api/me/color_mode", %{color_mode: "dark"}).status == 403
      assert stored(device) == "light"
    end

    test "unauthenticated is 401" do
      assert put(build_conn(), "/api/me/color_mode", %{color_mode: "dark"}).status == 401
    end

    test "a Sign in as me session sets its person's, not the tablet's",
         %{p: p, token: t, device: device} do
      {ses, _} = Sessions.create(p["brewer1"], device_token: Devices.live_token(t))
      assert call_device(ses, :put, "/api/me/color_mode", %{color_mode: "dark"}).status == 200
      assert stored(p["brewer1"]) == "dark"
      assert stored(device) == "light"
    end
  end

  describe "PATCH /api/devices/:id color_mode (S147, S149)" do
    test "the home department's manager sets it; the tablet's /api/me follows",
         %{p: p, device: device, token: t} do
      body =
        call(p["breweryMgr"], :patch, "/api/devices/#{device.id}", %{color_mode: "dark"})
        |> json_response(200)

      assert body["data"]["color_mode"] == "dark"
      assert stored(device) == "dark"
      assert call_device(t, :get, "/api/me") |> me() == "dark"

      [row] =
        call(p["breweryMgr"], :get, "/api/devices")
        |> json_response(200)
        |> Map.fetch!("data")
        |> Enum.filter(&(&1["id"] == device.id))

      assert row["color_mode"] == "dark"
    end

    test "a theme-only change writes no change-log entry; other edits still do",
         %{p: p, device: device} do
      count = fn ->
        Repo.aggregate(from(a in AuditEntry, where: a.target_id == ^device.id), :count)
      end

      before = count.()
      call(p["owner"], :patch, "/api/devices/#{device.id}", %{color_mode: "dark"})
      assert count.() == before

      call(p["owner"], :patch, "/api/devices/#{device.id}", %{name: "Brewhouse"})
      assert count.() == before + 1
    end

    test "an invalid value is 422", %{p: p, device: device} do
      for bad <- ["neon", ""] do
        conn = call(p["owner"], :patch, "/api/devices/#{device.id}", %{color_mode: bad})
        assert %{"errors" => %{"color_mode" => _}} = json_response(conn, 422)
      end

      assert stored(device) == "light"
    end

    test "a manager may set only the theme, and only on their department's devices",
         %{p: p, device: device} do
      assert status(p["breweryMgr"], :patch, "/api/devices/#{device.id}", %{
               color_mode: "dark",
               name: "Renamed"
             }) == 403

      assert status(p["barMgr"], :patch, "/api/devices/#{device.id}", %{color_mode: "dark"}) ==
               403

      assert %{name: "Brewhouse tablet", color_mode: "light"} = Repo.get!(User, device.id)
    end

    test "a bartender is 403", %{p: p, device: device} do
      assert status(p["bartender1"], :patch, "/api/devices/#{device.id}", %{color_mode: "dark"}) ==
               403

      assert stored(device) == "light"
    end
  end

  describe "/api/me color_mode" do
    test "a person's own; a device's own", %{p: p, device: device, token: t} do
      Accounts.set_color_mode(p["brewer1"], "device")
      Accounts.set_color_mode(device, "dark")

      assert call(p["brewer1"], :get, "/api/me") |> me() == "device"
      assert call_device(t, :get, "/api/me") |> me() == "dark"
    end

    test "Sign in as me on a tablet returns the tablet's (S148)",
         %{p: p, device: device, token: t} do
      {:ok, _} = Accounts.set_color_mode(device, "dark")
      # brewer1 is Light everywhere else.
      {ses, _} = Sessions.create(p["brewer1"], device_token: Devices.live_token(t))

      body = call_device(ses, :get, "/api/me") |> json_response(200)
      assert body["user"]["email"] == p["brewer1"].email
      assert body["color_mode"] == "dark"
      assert call(p["brewer1"], :get, "/api/me") |> me() == "light"
    end
  end
end
