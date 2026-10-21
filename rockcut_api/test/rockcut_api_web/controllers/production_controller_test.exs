defmodule RockcutApiWeb.ProductionControllerTest do
  @moduledoc "D46: the `/api/production` setup routes, as `brewer1` (and a tablet's 403)."
  use RockcutApiWeb.ConnCase

  import RockcutApi.PersonaFixtures

  alias RockcutApi.Production

  setup do
    %{brewer: personas(~w(brewer1))["brewer1"]}
  end

  defp body(conn), do: Jason.decode!(conn.resp_body)

  defp type_id(name), do: Enum.find(Production.list_step_types(), &(&1.name == name)).id

  describe "tanks" do
    test "add, list, the duplicate name, reorder, retire and restore (P1–P5)", %{brewer: b} do
      fv8 =
        call(b, :post, "/api/production/tanks", %{
          name: "FV8",
          kind: "unitank",
          capacity_bbl: 30,
          location: "brewhouse"
        })

      assert fv8.status == 201
      fv8 = body(fv8)["data"]
      assert fv8["capacity_bbl"] == 30.0
      assert fv8["outages"] == []

      fv1 = call(b, :post, "/api/production/tanks", %{name: "FV1", capacity_bbl: 20}) |> body()

      dup = call(b, :post, "/api/production/tanks", %{name: "fv1", capacity_bbl: 20})
      assert dup.status == 422
      assert body(dup)["errors"]["name"] == ["A tank named FV1 already exists."]

      reordered =
        call(b, :post, "/api/production/tanks/reorder", %{ids: [fv1["data"]["id"], fv8["id"]]})
        |> body()

      assert Enum.map(reordered["data"], & &1["name"]) == ["FV1", "FV8"]
      assert reordered["today"]

      retired = call(b, :delete, "/api/production/tanks/#{fv8["id"]}") |> body()
      assert retired["data"]["retired_at"]

      restored = call(b, :post, "/api/production/tanks/#{fv8["id"]}/restore") |> body()
      assert is_nil(restored["data"]["retired_at"])

      assert call(b, :patch, "/api/production/tanks/999999", %{name: "X"}).status == 404
    end

    test "out-of-service periods: add, overlap (P9), change, end today, delete", %{brewer: b} do
      tank =
        call(b, :post, "/api/production/tanks", %{name: "Serving 2", capacity_bbl: 30}) |> body()

      id = tank["data"]["id"]

      added =
        call(b, :post, "/api/production/tanks/#{id}/outages", %{
          starts_on: "2026-10-27",
          ends_on: "2026-11-02",
          reason: "Replace door gasket"
        })

      assert added.status == 201
      %{"data" => outage, "tank" => with_outage} = body(added)
      assert outage["label"] == "Tue Oct 27 – Mon Nov 2"
      assert [%{"reason" => "Replace door gasket"}] = with_outage["outages"]

      overlap =
        call(b, :post, "/api/production/tanks/#{id}/outages", %{
          starts_on: "2026-11-01",
          ends_on: "2026-11-05"
        })

      assert overlap.status == 422

      assert body(overlap) == %{
               "error" => "outage_overlap",
               "message" =>
                 "That overlaps another period (Tue Oct 27 – Mon Nov 2). Change that one instead.",
               "other_id" => outage["id"]
             }

      changed =
        call(b, :patch, "/api/production/outages/#{outage["id"]}", %{ends_on: nil}) |> body()

      assert changed["data"]["label"] == "Tue Oct 27 – until further notice"

      # Not current (it starts later than today in Colorado).
      today = RockcutApi.Tasks.today()

      if Date.compare(~D[2026-10-27], today) == :gt do
        assert body(call(b, :post, "/api/production/outages/#{outage["id"]}/end_today"))["error"] ==
                 "outage_not_current"
      end

      now =
        call(b, :post, "/api/production/tanks/#{id}/outages", %{
          starts_on: Date.to_iso8601(Date.add(today, -3)),
          ends_on: Date.to_iso8601(Date.add(today, 2))
        })
        |> body()

      assert now["data"]["state"] == "now"
      ended = call(b, :post, "/api/production/outages/#{now["data"]["id"]}/end_today") |> body()
      past = Enum.find(ended["data"]["outages"], &(&1["id"] == now["data"]["id"]))
      assert past["state"] == "past"
      assert past["ends_on"] == Date.to_iso8601(Date.add(today, -1))

      gone = call(b, :delete, "/api/production/outages/#{outage["id"]}") |> body()
      refute Enum.any?(gone["data"]["outages"], &(&1["id"] == outage["id"]))
    end
  end

  describe "phases and step types" do
    test "lists with the palette; add, retire; built-in refuses retire (P11–P13)", %{brewer: b} do
      phases = call(b, :get, "/api/production/phases") |> body()
      assert length(phases["colors"]) == 12
      assert hd(phases["data"])["name"] == "Brew day"

      added = call(b, :post, "/api/production/step_types", %{name: "Hop stand check"}) |> body()
      assert added["data"]["behavior"] == "plain"
      refute added["data"]["built_in"]

      retired = call(b, :delete, "/api/production/step_types/#{added["data"]["id"]}") |> body()
      assert retired["data"]["retired_at"]

      refused = call(b, :delete, "/api/production/step_types/#{type_id("Transfer")}")
      assert refused.status == 422
      assert body(refused)["error"] == "built_in"

      renamed =
        call(b, :patch, "/api/production/step_types/#{type_id("Transfer")}", %{name: "Rack"})
        |> body()

      assert renamed["data"]["name"] == "Rack"

      types = call(b, :get, "/api/production/step_types") |> body()
      assert List.last(types["data"])["name"] == "Hop stand check"
    end
  end

  describe "templates" do
    test "create, add steps and a ramp, link errors, duplicate (P14–P18)", %{brewer: b} do
      created = call(b, :post, "/api/production/templates", %{name: "Lager with transfer"})
      assert created.status == 201
      t = body(created)["data"]
      [brew] = t["steps"]
      assert brew["name"] == "Brew day"
      assert [%{"code" => "vessel_has_no_exit"}] = t["issues"]

      base = "/api/production/templates/#{t["id"]}"

      dt =
        call(b, :post, base <> "/steps", %{
          step_type_id: type_id("Diacetyl test"),
          day_offset: 15,
          notes: "Forced test",
          comes_after_id: brew["id"]
        })
        |> body()

      dt_step = Enum.find(dt["data"]["steps"], &(&1["name"] == "Diacetyl test"))
      assert dt_step["notes"] == "Forced test"

      xfer =
        call(b, :post, base <> "/steps", %{
          step_type_id: type_id("Transfer"),
          day_offset: 35,
          vessel_index: 1
        })
        |> body()

      assert Enum.map(xfer["data"]["steps"], &{&1["name"], &1["day_offset"], &1["vessel_index"]}) ==
               [
                 {"Brew day", 0, 0},
                 {"Diacetyl test", 15, 0},
                 {"Transfer", 35, 1},
                 {"CIP & Sanitize", 35, 0}
               ]

      # QA M1: a second transfer into the tank it's already in.
      again =
        call(b, :post, base <> "/steps", %{
          step_type_id: type_id("Filter"),
          day_offset: 39,
          vessel_index: 1
        })

      assert again.status == 422

      assert body(again) == %{
               "error" => "transfer_not_new_tank",
               "message" => "A transfer moves the beer into a new tank."
             }

      nowhere =
        call(b, :post, base <> "/steps", %{
          step_type_id: type_id("Carb"),
          day_offset: 40,
          vessel_index: 4
        })

      assert body(nowhere)["error"] == "no_such_tank"

      ramp =
        call(b, :post, base <> "/ramp", %{
          start: 58,
          target: 32,
          change_per_day: 10,
          first_day: 18,
          comes_after_id: dt_step["id"]
        })

      assert ramp.status == 201

      names =
        body(ramp)["data"]["steps"]
        |> Enum.filter(& &1["ramp_group"])
        |> Enum.map(& &1["name"])

      assert names == ["Set temp - 58°", "Set temp - 48°", "Set temp - 38°", "Set temp - 32°"]

      cycle =
        call(b, :post, base <> "/links", %{from_step_id: dt_step["id"], to_step_id: brew["id"]})

      assert cycle.status == 422
      assert body(cycle)["error"] == "link_cycle"

      bad = call(b, :post, base <> "/steps", %{step_type_id: type_id("Set temp"), day_offset: 3})
      assert bad.status == 422
      assert body(bad)["errors"]["temperature"] == ["Enter the temperature."]

      fixed = call(b, :delete, base <> "/steps/#{brew["id"]}")
      assert body(fixed)["error"] == "brew_day_fixed"

      [link | _] = body(ramp)["data"]["links"]

      changed =
        call(b, :patch, base <> "/links/#{link["id"]}", %{default_answer: "move_only"}) |> body()

      assert Enum.find(changed["data"]["links"], &(&1["id"] == link["id"]))["default_answer"] ==
               "move_only"

      copy = call(b, :post, base <> "/duplicate")
      assert copy.status == 201
      assert body(copy)["data"]["name"] == "Copy of Lager with transfer"

      list = call(b, :get, "/api/production/templates") |> body()

      assert Enum.map(list["data"], & &1["name"]) == [
               "Lager with transfer",
               "Copy of Lager with transfer"
             ]

      assert hd(list["data"])["step_count"] == 8
      refute Map.has_key?(hd(list["data"]), "steps")

      other = call(b, :post, "/api/production/templates", %{name: "Other"}) |> body()
      assert call(b, :delete, base <> "/steps/#{hd(other["data"]["steps"])["id"]}").status == 404
    end
  end

  test "a shared tablet gets 403 on the production routes (D49 brings it)" do
    {_device, token} = taproom_device()

    for path <- ~w(/api/production/tanks /api/production/templates) do
      conn = call_device(token, :get, path)
      assert conn.status == 403
    end
  end
end
