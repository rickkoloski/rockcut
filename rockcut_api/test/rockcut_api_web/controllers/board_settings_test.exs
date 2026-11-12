defmodule RockcutApiWeb.BoardSettingsTest do
  @moduledoc """
  D58 §3.1 (S1, S3–S5): task board settings per account on the server.
  `PUT /api/me/board_settings/:board` merges the given settings and answers
  the board's settings with the defaults; `GET /api/me` has the stored map.
  A person saves for any board they can read (All departments: owners); a
  device for its home board only, with no staff code.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import Phoenix.ConnTest

  alias RockcutApi.{AccountsFixtures, Repo}
  alias RockcutApi.Accounts.{BoardSettings, User}

  setup do
    p = personas(~w(owner breweryMgr brewer1 bartender1 ownersAsst))
    %{p: p}
  end

  defp put_settings(user, board, attrs),
    do: call(user, :put, "/api/me/board_settings/#{board}", attrs)

  defp stored(user), do: Repo.get!(User, user.id).board_settings

  describe "a person" do
    test "S1: saves settings, answers the board's full map, and /api/me has them", %{p: p} do
      body =
        put_settings(p["brewer1"], "brewery", %{
          span: 7,
          hide_completed: true,
          first_day: "monday",
          view: "mine"
        })
        |> json_response(200)

      assert body == %{
               "span" => 7,
               "hide_completed" => true,
               "hide_shifts" => false,
               "first_day" => "monday",
               "view" => "mine",
               "phone_view" => "vertical"
             }

      me = call(p["brewer1"], :get, "/api/me") |> json_response(200)

      assert me["board_settings"] == %{
               "brewery" => %{
                 "span" => 7,
                 "hide_completed" => true,
                 "first_day" => "monday",
                 "view" => "mine"
               }
             }
    end

    test "/api/me has an empty map before anything is saved", %{p: p} do
      assert call(p["brewer1"], :get, "/api/me")
             |> json_response(200)
             |> Map.get("board_settings") ==
               %{}
    end

    test "merging keeps the board's other settings and the other boards", %{p: p} do
      put_settings(p["owner"], "brewery", %{span: 7}) |> json_response(200)
      put_settings(p["owner"], "bar", %{hide_shifts: true}) |> json_response(200)

      body = put_settings(p["owner"], "brewery", %{phone_view: "day"}) |> json_response(200)
      assert %{"span" => 7, "phone_view" => "day"} = body

      assert stored(p["owner"]) == %{
               "brewery" => %{"span" => 7, "phone_view" => "day"},
               "bar" => %{"hide_shifts" => true}
             }
    end

    test "an empty body changes nothing and stores no entry", %{p: p} do
      assert put_settings(p["brewer1"], "brewery", %{}) |> json_response(200) ==
               BoardSettings.defaults()

      assert stored(p["brewer1"]) == %{}
    end

    test "S5: an owner saves All departments (All / Unassigned) apart from a board", %{p: p} do
      put_settings(p["owner"], "brewery", %{view: "mine"}) |> json_response(200)

      assert %{"view" => "unassigned", "span" => 7} =
               put_settings(p["owner"], "all", %{view: "unassigned", span: 7})
               |> json_response(200)

      assert stored(p["owner"])["brewery"] == %{"view" => "mine"}
    end

    test "a board the person can read only: another department's is 403", %{p: p} do
      assert put_settings(p["brewer1"], "bar", %{span: 7}) |> json_response(403)
      assert put_settings(p["bartender1"], "brewery", %{span: 7}) |> json_response(403)
      assert stored(p["brewer1"]) == %{}
    end

    test "All departments is owners only", %{p: p} do
      assert put_settings(p["breweryMgr"], "all", %{span: 7}) |> json_response(403)
      assert put_settings(p["brewer1"], "all", %{span: 7}) |> json_response(403)
    end

    test "D59: the Owners board for its members and owners, 403 for anyone else", %{p: p} do
      assert put_settings(p["ownersAsst"], "owners", %{span: 7}) |> json_response(200)
      assert put_settings(p["owner"], "owners", %{span: 7}) |> json_response(200)
      assert put_settings(p["breweryMgr"], "owners", %{span: 7}) |> json_response(403)
    end

    test "an unknown board is 404; so is a department without a board", %{p: p} do
      assert put_settings(p["owner"], "nope", %{span: 7}) |> json_response(404)
      assert put_settings(p["owner"], "other", %{span: 7}) |> json_response(404)
    end

    test "an unknown setting or value is 422 with field errors, and nothing is saved", %{p: p} do
      body =
        put_settings(p["brewer1"], "brewery", %{
          span: 30,
          hide_completed: "maybe",
          first_day: "friday",
          view: "everyone",
          phone_view: "grid",
          colour: "red"
        })
        |> json_response(422)

      assert Map.keys(body["errors"]) |> Enum.sort() ==
               ~w(colour first_day hide_completed phone_view span view)

      assert body["errors"]["colour"] == ["is not a board setting"]
      assert stored(p["brewer1"]) == %{}
    end

    test "one bad setting refuses the good ones beside it", %{p: p} do
      assert put_settings(p["brewer1"], "brewery", %{span: 7, view: "nobody"})
             |> json_response(422)

      assert stored(p["brewer1"]) == %{}
    end

    test "a setting sent as null is refused", %{p: p} do
      assert %{"errors" => %{"span" => [_]}} =
               put_settings(p["brewer1"], "brewery", %{span: nil}) |> json_response(422)
    end

    test "My tasks isn't a view on All departments", %{p: p} do
      assert %{"errors" => %{"view" => [_]}} =
               put_settings(p["owner"], "all", %{view: "mine"}) |> json_response(422)
    end

    test "nothing else on the person changes", %{p: p} do
      before = Repo.get!(User, p["brewer1"].id)
      put_settings(p["brewer1"], "brewery", %{span: 7, name: "X"}) |> json_response(422)
      put_settings(p["brewer1"], "brewery", %{span: 7}) |> json_response(200)
      now = Repo.get!(User, p["brewer1"].id)

      assert Map.drop(now, [:board_settings, :updated_at]) ==
               Map.drop(before, [:board_settings, :updated_at])
    end
  end

  describe "a shared device" do
    setup %{p: p} do
      {device, token} = taproom_device()
      %{device: device, token: token, p: p}
    end

    test "S3: saves its home board's settings without a staff code; a person's stay apart", %{
      device: device,
      token: token,
      p: p
    } do
      put_settings(p["bartender1"], "bar", %{view: "mine"}) |> json_response(200)

      assert %{"view" => "unassigned", "hide_shifts" => true} =
               call_device(token, :put, "/api/me/board_settings/bar", %{
                 view: "unassigned",
                 hide_shifts: true
               })
               |> json_response(200)

      assert call_device(token, :get, "/api/me")
             |> json_response(200)
             |> Map.get("board_settings") ==
               %{"bar" => %{"view" => "unassigned", "hide_shifts" => true}}

      assert stored(device) == %{"bar" => %{"view" => "unassigned", "hide_shifts" => true}}
      assert stored(p["bartender1"]) == %{"bar" => %{"view" => "mine"}}
    end

    # D58 lead decisions 1 (DEV QA gap 3): a device has no tasks of its own.
    test "My tasks isn't a view for a device (422); nothing is saved", %{
      device: device,
      token: token
    } do
      assert %{"errors" => %{"view" => [_]}} =
               call_device(token, :put, "/api/me/board_settings/bar", %{view: "mine", span: 7})
               |> json_response(422)

      assert stored(device) == %{}

      assert %{"view" => "all"} =
               call_device(token, :put, "/api/me/board_settings/bar", %{view: "all"})
               |> json_response(200)
    end

    test "S4: another department's board is 403", %{device: device, token: token} do
      assert call_device(token, :put, "/api/me/board_settings/brewery", %{span: 7})
             |> json_response(403)

      assert stored(device) == %{}
    end

    test "All departments and the Owners board are 403", %{token: token} do
      assert call_device(token, :put, "/api/me/board_settings/all", %{span: 7})
             |> json_response(403)

      assert call_device(token, :put, "/api/me/board_settings/owners", %{span: 7})
             |> json_response(403)
    end

    test "a staff code in the body is just an unknown setting", %{token: token} do
      assert %{"errors" => %{"staff_code" => _}} =
               call_device(token, :put, "/api/me/board_settings/bar", %{
                 span: 7,
                 staff_code: "1111"
               })
               |> json_response(422)
    end

    test "the brewhouse device saves the Brewery board, not the Taproom's", %{p: _p} do
      device = AccountsFixtures.device_fixture(%{home: "brewery", name: "Brewhouse"})
      token = AccountsFixtures.device_token_fixture(device, "Brewhouse Tab")

      assert call_device(token, :put, "/api/me/board_settings/brewery", %{span: 7})
             |> json_response(200)

      assert call_device(token, :put, "/api/me/board_settings/bar", %{span: 7})
             |> json_response(403)
    end
  end
end
