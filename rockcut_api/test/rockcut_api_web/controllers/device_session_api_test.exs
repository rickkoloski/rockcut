defmodule RockcutApiWeb.DeviceSessionApiTest do
  @moduledoc "D33 scenarios S6–S9 at the API level, as `taproomDevice`."
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.SchedulingFixtures

  setup do
    p = personas(~w(owner barMgr breweryMgr bartender1))
    {device, token} = taproom_device()
    %{p: p, device: device, token: token, depts: departments()}
  end

  test "S6 /api/me: device kind, home module, no management", %{token: t} do
    body = call_device(t, :get, "/api/me") |> json_response(200)
    assert body["user"]["kind"] == "device"
    assert body["capabilities"]["kind"] == "device"
    assert Enum.sort(body["capabilities"]["modules"]) == ["bar", "schedule"]
    assert body["capabilities"]["manages_departments"] == []
    assert body["shared_devices"] == false
  end

  test "S7 published shifts only; claiming is 403", %{token: t, depts: depts} do
    pub = shift_fixture(%{status: "published", department: depts["bar"]})
    draft = shift_fixture(%{status: "draft", department: depts["bar"]})

    ids = call_device(t, :get, "/api/shifts") |> data_ids()
    assert pub.id in ids
    refute draft.id in ids

    assert call_device(t, :get, "/api/shifts/#{pub.id}").status == 200
    assert call_device(t, :get, "/api/shifts/#{draft.id}").status == 403
    assert call_device(t, :post, "/api/shifts/#{pub.id}/claim").status == 403
  end

  test "S7 published events only", %{token: t, depts: depts} do
    pub = event_fixture(%{status: "published", department: depts["bar"]})
    draft = event_fixture(%{status: "draft", department: depts["bar"]})
    ids = call_device(t, :get, "/api/schedule_events") |> data_ids()
    assert pub.id in ids
    refute draft.id in ids
  end

  test "S8 channels: All-staff + Taproom, read-only; Managers 403", %{token: t, p: p} do
    call(p["bartender1"], :post, "/api/channels/all/messages", %{body: "Hi all"})
    call(p["bartender1"], :post, "/api/channels/dept:bar/messages", %{body: "Hi bar"})

    channels = call_device(t, :get, "/api/channels") |> json_response(200) |> Map.fetch!("data")
    assert Enum.map(channels, & &1["key"]) == ["all", "dept:bar"]
    assert Enum.all?(channels, &(&1["can_post"] == false))

    for key <- ["all", "dept:bar"] do
      [msg] =
        call_device(t, :get, "/api/channels/#{key}/messages")
        |> json_response(200)
        |> Map.fetch!("data")

      assert msg["body"] =~ "Hi"
      assert call_device(t, :post, "/api/channels/#{key}/read").status in 200..299
    end

    assert call_device(t, :get, "/api/channels/managers/messages").status == 403
    assert call_device(t, :get, "/api/channels/dept:brewery/messages").status == 403
    assert call_device(t, :post, "/api/channels/all/messages", %{body: "anon"}).status == 403
    assert call_device(t, :get, "/api/messages/unread_count").status == 200
  end

  test "people's channel lists say they can post", %{p: p} do
    channels =
      call(p["bartender1"], :get, "/api/channels") |> json_response(200) |> Map.fetch!("data")

    assert Enum.all?(channels, &(&1["can_post"] == true))
  end

  test "S9 the API behind blocked pages is 403", %{token: t} do
    for path <- ~w(/api/time_off /api/availability /api/users /api/brands /api/shift_templates
                   /api/notifications /api/calendar_feeds /api/devices) do
      assert call_device(t, :get, path).status == 403, path
    end
  end

  test "shared_devices on /api/me for people (lead decision 8)", %{p: p} do
    me = fn who ->
      call(p[who], :get, "/api/me") |> json_response(200) |> Map.fetch!("shared_devices")
    end

    assert me.("owner")
    assert me.("barMgr")
    refute me.("breweryMgr")
    refute me.("bartender1")
  end
end
