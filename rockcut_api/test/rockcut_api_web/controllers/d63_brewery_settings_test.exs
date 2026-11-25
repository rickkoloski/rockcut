defmodule RockcutApiWeb.D63BrewerySettingsTest do
  @moduledoc """
  D63 Stop 3 (spec §6, §7, §12 "Settings"): the brewery's settings at the API.
  The starting values, every limit, the version, who may, and the one row.
  Each rule has a refusal and an allowed case.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures

  alias RockcutApi.{AccountsFixtures, Authz, BrewerySettings, Repo, StaffCodes}
  alias RockcutApi.BrewerySettings.Settings

  @path "/api/brewery_settings"

  # Spec §6.1: {field, starts at, low, high, the next step below low, above high, name}
  @numbers [
    {"boil_temp_f", "202", "180", "212", "179.9", "212.1", "Boil temperature"},
    {"ibu_tolerance", "2", "0", "20", "-0.01", "20.01", "IBU tolerance"},
    {"pellet_factor", "1.1", "1", "1.5", "0.99", "1.51", "Pellet factor"},
    {"hop_stand_temp_f", "170", "100", "212", "99.9", "212.1", "Hop stand temperature"},
    {"hop_stand_cooling_min", "15", "0", "120", "-1", "121", "Hop stand cooling"},
    {"hop_stand_whirl_min", "20", "0", "120", "-1", "121", "Hop stand whirl"},
    {"hop_stand_rest_min", "20", "0", "120", "-1", "121", "Hop stand rest"},
    {"whirlpool_whirl_min", "20", "0", "120", "-1", "121", "Whirlpool whirl"},
    {"whirlpool_rest_min", "20", "0", "120", "-1", "121", "Whirlpool rest"},
    {"evaporation_bbl_per_hr", "0.23", "0", "2", "-0.01", "2.01", "Evaporation"},
    {"kettle_loss_bbl", "0.21", "0", "5", "-0.01", "5.01", "Kettle loss"},
    {"fermenter_loss_bbl", "0.5", "0", "5", "-0.01", "5.01", "Fermenter loss"},
    {"whirlfloc_tablets_per_bbl", "2", "0", "20", "-0.01", "20.01", "Whirlfloc"},
    {"clarity_ferm_ml_per_plato_bbl", "1.3333", "0", "20", "-0.0001", "20.0001", "Clarity Ferm"},
    {"zinc_g_per_bbl", "0.09375", "0", "5", "-0.00001", "5.00001", "Zinc"},
    {"pitch_rate", "1.5", "0.1", "5", "0.09", "5.01", "Pitch rate"},
    {"water_ca_ppm", "20", "0", "2000", "-0.01", "2000.01", "Calcium"},
    {"water_mg_ppm", "3", "0", "2000", "-0.01", "2000.01", "Magnesium"},
    {"water_na_ppm", "4", "0", "2000", "-0.01", "2000.01", "Sodium"},
    {"water_co3_ppm", "0", "0", "2000", "-0.01", "2000.01", "Carbonate"},
    {"water_hco3_ppm", "18", "0", "2000", "-0.01", "2000.01", "Bicarbonate"},
    {"water_so4_ppm", "2", "0", "2000", "-0.01", "2000.01", "Sulfate"},
    {"water_cl_ppm", "3", "0", "2000", "-0.01", "2000.01", "Chloride"}
  ]

  setup do
    p = personas()
    device = AccountsFixtures.device_fixture(%{home: "brewery", name: "Brewhouse"})
    token = AccountsFixtures.device_token_fixture(device, "Brewhouse Tab")
    %{p: p, mgr: p["breweryMgr"], device: device, token: token}
  end

  defp req(user, verb, params \\ %{}) do
    conn = call(user, verb, @path, params)
    {conn.status, Jason.decode!(conn.resp_body)}
  end

  defp read(user) do
    {200, %{"data" => data}} = req(user, :get)
    data
  end

  defp save(user, attrs),
    do: req(user, :put, Map.put_new(attrs, "lock_version", read(user)["lock_version"]))

  describe "the row" do
    test "starts with the spec's values, changed by no one", c do
      data = read(c.mgr)

      for {field, start, _, _, _, _, _} <- @numbers,
          do: assert({field, data[field]} == {field, start})

      assert length(@numbers) == length(Settings.number_fields())
      assert %{"ibu_equation_hold" => "rc_2026", "ibu_equation_print" => "rc_2026"} = data
      assert %{"source_water_name" => "Estes Summer", "lock_version" => 1} = data
      assert data["updated_by"] == nil
    end

    test "missing: the first read makes it again, the same", c do
      before = read(c.mgr)
      {:ok, _} = Repo.delete(BrewerySettings.get())
      assert Map.delete(read(c.mgr), "updated_at") == Map.delete(before, "updated_at")
      assert Repo.aggregate(Settings, :count) == 1
    end

    test "missing: a write makes it first", c do
      {:ok, _} = Repo.delete(BrewerySettings.get())
      assert {200, _} = req(c.mgr, :put, %{"lock_version" => 1, "ibu_tolerance" => "3"})
      assert read(c.mgr)["ibu_tolerance"] == "3"
    end

    test "the database refuses a second row" do
      assert_raise Ecto.ConstraintError, fn -> Repo.insert!(%Settings{id: 2}) end
    end
  end

  describe "limits" do
    test "each number's limits are inclusive, as text or a JSON number", c do
      for {field, _, low, high, _, _, _} <- @numbers, value <- [low, high] do
        assert {200, %{"data" => data}} = save(c.mgr, %{field => value})
        assert {field, data[field]} == {field, value}
        assert {field, read(c.mgr)[field]} == {field, value}
      end

      assert {200, %{"data" => %{"pitch_rate" => "0.1"}}} = save(c.mgr, %{"pitch_rate" => 0.1})
      assert {200, %{"data" => %{"boil_temp_f" => "200"}}} = save(c.mgr, %{"boil_temp_f" => 200})
    end

    test "just outside is refused with the limits, and nothing is written", c do
      before = read(c.mgr)

      for {field, _, low, high, below, above, name} <- @numbers, value <- [below, above] do
        assert {422, %{"errors" => errors}} =
                 save(c.mgr, %{field => value, "water_cl_ppm" => value})

        [sentence] = errors[field]

        assert sentence =~
                 "#{name} must be between #{low} and #{if high == "2000", do: "2,000", else: high}"
      end

      assert read(c.mgr) == before
    end

    test "empty, text, a comma decimal and the rest are refused with the limits", c do
      bad = [
        "",
        "  ",
        nil,
        "hot",
        "1,5",
        "1,000",
        "2e2",
        "1.2.3",
        "NaN",
        "Infinity",
        true,
        [],
        %{}
      ]

      for value <- bad do
        assert {422, %{"errors" => %{"boil_temp_f" => [sentence]}}} =
                 save(c.mgr, %{"boil_temp_f" => value})

        assert sentence == "Boil temperature must be between 180 and 212 °F"
      end
    end

    test "more decimals than the screen keeps are refused, not rounded", c do
      for {field, value, words} <- [
            {"hop_stand_rest_min", "20.5", "Use a whole number"},
            {"boil_temp_f", "202.25", "Use at most 1 decimal"},
            {"ibu_tolerance", "1.555", "Use at most 2 decimals"},
            {"clarity_ferm_ml_per_plato_bbl", "1.33333", "Use at most 4 decimals"},
            {"zinc_g_per_bbl", "0.093751", "Use at most 5 decimals"}
          ] do
        assert {422, %{"errors" => %{^field => [sentence]}}} = save(c.mgr, %{field => value})
        assert sentence =~ words
      end

      assert {200, _} = save(c.mgr, %{"zinc_g_per_bbl" => "0.09376", "boil_temp_f" => "202.5"})
    end

    test "the equations are the three", c do
      for field <- ~w(ibu_equation_hold ibu_equation_print) do
        for value <- ~w(tinseth modified_tinseth rc_2026) do
          assert {200, %{"data" => %{^field => ^value}}} = save(c.mgr, %{field => value})
        end

        for bad <- ["rager", "", nil, 1] do
          assert {422, %{"errors" => %{^field => [sentence]}}} = save(c.mgr, %{field => bad})
          assert sentence == "must be RC 2026 or Tinseth or Modified Tinseth"
        end
      end
    end
  end

  describe "a save" do
    test "zinc and Clarity Ferm keep what's stored when others change or the same is sent", c do
      assert {200, _} = save(c.mgr, %{"boil_temp_f" => "203"})
      data = read(c.mgr)
      assert %{"zinc_g_per_bbl" => "0.09375", "clarity_ferm_ml_per_plato_bbl" => "1.3333"} = data

      same = Map.drop(data, ["lock_version", "updated_at", "updated_by"])
      assert {200, %{"data" => ^data}} = save(c.mgr, same)
    end

    test "says who and when, from the session only; unknown fields do nothing", c do
      assert {200, %{"data" => data}} =
               save(c.mgr, %{
                 "ibu_tolerance" => "1.5",
                 "updated_by_id" => c.p["owner"].id,
                 "updated_by" => %{"id" => c.p["owner"].id},
                 "source_water_name" => "Other",
                 "id" => 9
               })

      assert data["updated_by"] == %{"id" => c.mgr.id, "name" => c.mgr.name}
      assert data["source_water_name"] == "Estes Summer"
      assert data["lock_version"] == 2

      assert {200, %{"data" => data}} = save(c.p["owner"], %{"ibu_tolerance" => "2"})
      assert data["updated_by"]["id"] == c.p["owner"].id
    end

    test "with nothing different isn't a change: the version and who stay", c do
      assert {200, _} = save(c.mgr, %{"ibu_tolerance" => "1.5"})
      before = read(c.mgr)
      assert {200, _} = save(c.p["owner"], %{"ibu_tolerance" => "1.50"})
      assert read(c.mgr) == before
    end
  end

  describe "the version" do
    test "stale: 409 with a sentence and the current values, nothing written", c do
      opened = read(c.mgr)["lock_version"]
      assert {200, _} = save(c.p["owner"], %{"ibu_tolerance" => "1.5"})
      now = read(c.mgr)

      assert {409, body} =
               save(c.mgr, %{
                 "lock_version" => opened,
                 "ibu_tolerance" => "3",
                 "pitch_rate" => "1"
               })

      assert [sentence] = body["errors"]["base"]
      assert sentence =~ "Someone else changed the settings since you opened them."
      assert body["data"] == now
      assert body["can_manage"] == true
      assert read(c.mgr) == now

      # The version it answered saves.
      assert {200, _} =
               save(c.mgr, %{"lock_version" => "#{now["lock_version"]}", "ibu_tolerance" => "3"})
    end

    test "stale wins over a refused value, and over nothing different", c do
      assert {200, _} = save(c.p["owner"], %{"ibu_tolerance" => "1.5"})
      assert {409, _} = save(c.mgr, %{"lock_version" => 1, "boil_temp_f" => "999"})
      assert {409, _} = save(c.mgr, %{"lock_version" => 1})
    end

    test "missing or not a whole number is refused, not taken as current", c do
      before = read(c.mgr)

      assert {422, %{"errors" => %{"lock_version" => ["can't be blank"]}}} =
               req(c.mgr, :put, %{"ibu_tolerance" => "1"})

      for bad <- [nil, "x", "1.0", "", 1.0, true, []] do
        assert {422, %{"errors" => %{"lock_version" => [_]}}} =
                 req(c.mgr, :put, %{"lock_version" => bad, "ibu_tolerance" => "1"})
      end

      assert read(c.mgr) == before
    end
  end

  describe "who (§7)" do
    test "each person", c do
      expected = %{
        "owner" => {200, 200},
        "owner2" => {200, 200},
        "breweryMgr" => {200, 200},
        "brewer1" => {200, 403},
        "floater" => {200, 403},
        "splitRole" => {200, 403},
        "barMgr" => {403, 403},
        "dualMgr" => {403, 403},
        "bartender1" => {403, 403},
        "office1" => {403, 403},
        "sales1" => {403, 403},
        "ownersAsst" => {403, 403},
        "noDept" => {403, 403}
      }

      for {who, {get, put}} <- expected do
        assert {who, status(c.p[who], :get, @path)} == {who, get}
        version = BrewerySettings.get().lock_version

        assert {who,
                status(c.p[who], :put, @path, %{"lock_version" => version, "pitch_rate" => "1"})} ==
                 {who, put}

        # The rule itself, behind the `:brewery` scope too.
        assert {who, Authz.can?(c.p[who], :read, :brewery_settings)} == {who, get == 200}
        assert {who, Authz.can?(c.p[who], :manage, :brewery_settings)} == {who, put == 200}
      end

      assert {200, %{"can_manage" => false}} = req(c.p["brewer1"], :get)
      assert {200, %{"can_manage" => true}} = req(c.mgr, :get)
    end

    test "the brewhouse device reads with no code; its PUT is 403 even with a manager's", c do
      {:ok, _} = StaffCodes.set(c.mgr, "4444", c.p["owner"])
      conn = call_device(c.token, :get, @path)
      assert conn.status == 200

      assert %{"can_manage" => false, "data" => %{"boil_temp_f" => "202"}} =
               Jason.decode!(conn.resp_body)

      refute conn.resp_body =~ "@"

      for extra <- [%{}, %{"staff_code" => "4444"}] do
        conn =
          call_device(
            c.token,
            :put,
            @path,
            Map.merge(%{"lock_version" => 1, "pitch_rate" => "1"}, extra)
          )

        assert conn.status == 403
        assert Jason.decode!(conn.resp_body)["error"] == "Not available on a shared device"
      end

      assert read(c.mgr)["lock_version"] == 1
      device = RockcutApi.Accounts.get_user!(c.device.id)
      assert Authz.can?(device, :read, :brewery_settings)
      refute Authz.can?(device, :manage, :brewery_settings)
    end

    test "every other device is refused both" do
      for home <- ~w(bar office sales) do
        device = AccountsFixtures.device_fixture(%{home: home, name: "#{home} tab"})
        token = AccountsFixtures.device_token_fixture(device, "#{home} tab 1")
        assert call_device(token, :get, @path).status == 403
        assert call_device(token, :put, @path, %{"lock_version" => 1}).status == 403
        device = RockcutApi.Accounts.get_user!(device.id)
        refute Authz.can?(device, :read, :brewery_settings)
        refute Authz.can?(device, :manage, :brewery_settings)
      end
    end

    test "no one signed in: 401" do
      assert Phoenix.ConnTest.dispatch(build_conn(), RockcutApiWeb.Endpoint, :get, @path, %{}).status ==
               401
    end
  end

  describe "the account's ingredient settings (Stop 2 follow-up)" do
    test "saving one leaves the other, both ways", c do
      path = "/api/me/board_settings/ingredients"

      settings = fn ->
        Jason.decode!(call(c.mgr, :get, "/api/me").resp_body)["board_settings"]["ingredients"]
      end

      assert call(c.mgr, :put, path, %{"quantity_display" => "lb"}).status == 200
      assert call(c.mgr, :put, path, %{"hide_used_up_lots" => false}).status == 200
      assert %{"quantity_display" => "lb", "hide_used_up_lots" => false} = settings.()
      assert call(c.mgr, :put, path, %{"quantity_display" => "packs"}).status == 200
      assert %{"quantity_display" => "packs", "hide_used_up_lots" => false} = settings.()
      assert call(c.mgr, :put, path, %{"hide_used_up_lots" => true}).status == 200
      assert %{"quantity_display" => "packs", "hide_used_up_lots" => true} = settings.()
    end
  end
end
