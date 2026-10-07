defmodule RockcutApiWeb.DeviceRouteMatrixTest do
  @moduledoc """
  D33 §3.7: every route in the router × `taproomDevice`. The allowlist passes;
  everything else is refused by `DeviceGate` (403). Generated from the router:
  a new route fails "every route is classified" until someone puts it in one
  of the lists below. Put it in `@device_ok` only together with its
  `Authz.Device` entry and a scope change in the router.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.SchedulingFixtures

  @public [
    {:get, "/api/health"},
    {:post, "/api/session"},
    {:get, "/api/calendar/:token"},
    {:post, "/api/device_tokens"}
  ]

  @device_ok [
    {:get, "/api/session"},
    {:delete, "/api/session"},
    {:get, "/api/me"},
    {:get, "/api/departments"},
    {:get, "/api/positions"},
    {:get, "/api/roster"},
    {:get, "/api/shifts"},
    {:get, "/api/shifts/:id"},
    {:get, "/api/schedule_events"},
    {:get, "/api/channels"},
    {:get, "/api/channels/:key/messages"},
    {:post, "/api/channels/:key/read"},
    {:get, "/api/messages/unread_count"},
    # D37: a Taproom tablet reads the Buy-a-Beer Board.
    {:get, "/api/beer_board"}
  ]

  # D37: device-allowed writes that need a person's staff code. Without one
  # they answer 422 `staff_code_required` (with one: beer_board_controller_test).
  @device_with_code [
    {:post, "/api/beer_board"},
    {:post, "/api/beer_board/:id/redeem"},
    {:patch, "/api/beer_board/:id"},
    {:delete, "/api/beer_board/:id"}
  ]

  @denied [
    {:post, "/api/session/password"},
    {:delete, "/api/sessions/others"},
    {:patch, "/api/departments/:id"},
    {:post, "/api/roster/order"},
    {:get, "/api/users"},
    {:post, "/api/users"},
    {:patch, "/api/users/:id"},
    {:put, "/api/users/:id"},
    {:put, "/api/users/:user_id/memberships"},
    {:post, "/api/users/:id/reset_password"},
    {:get, "/api/beer_board/history"},
    {:get, "/api/beer_board/history/export.csv"},
    {:get, "/api/beer_board/export.csv"},
    {:post, "/api/beer_board/import/preview"},
    {:post, "/api/beer_board/import"},
    {:get, "/api/users/:id/staff_code"},
    {:put, "/api/users/:id/staff_code"},
    {:delete, "/api/users/:id/staff_code"},
    {:get, "/api/staff_codes/suggest"},
    {:get, "/api/devices"},
    {:post, "/api/devices"},
    {:patch, "/api/devices/:id"},
    {:delete, "/api/devices/:id"},
    {:post, "/api/devices/:id/pairing_code"},
    {:delete, "/api/device_tokens/:id"},
    {:get, "/api/owner/activity"},
    {:post, "/api/owner/activity/seen"},
    {:post, "/api/positions"},
    {:patch, "/api/positions/:id"},
    {:put, "/api/positions/:id"},
    {:delete, "/api/positions/:id"},
    {:post, "/api/shifts"},
    {:post, "/api/shifts/publish"},
    {:patch, "/api/shifts/:id"},
    {:delete, "/api/shifts/:id"},
    {:post, "/api/shifts/:id/publish"},
    {:post, "/api/shifts/:id/unpublish"},
    {:post, "/api/shifts/:id/claim"},
    {:post, "/api/schedule_events"},
    {:post, "/api/schedule_events/publish"},
    {:get, "/api/schedule_events/:id"},
    {:patch, "/api/schedule_events/:id"},
    {:delete, "/api/schedule_events/:id"},
    {:post, "/api/schedule_events/:id/publish"},
    {:post, "/api/schedule_events/:id/unpublish"},
    {:post, "/api/schedule_event_series/:id/extend"},
    {:get, "/api/shift_templates"},
    {:post, "/api/shift_templates"},
    {:patch, "/api/shift_templates/:id"},
    {:put, "/api/shift_templates/:id"},
    {:delete, "/api/shift_templates/:id"},
    {:get, "/api/schedule_templates"},
    {:post, "/api/schedule_templates"},
    {:delete, "/api/schedule_templates/:id"},
    {:get, "/api/time_off"},
    {:post, "/api/time_off"},
    {:post, "/api/time_off/:id/review"},
    {:post, "/api/time_off/:id/cancel"},
    {:get, "/api/availability"},
    {:post, "/api/availability"},
    {:delete, "/api/availability/:id"},
    {:get, "/api/calendar_feeds"},
    {:post, "/api/calendar_feeds/rotate"},
    {:get, "/api/notifications"},
    {:get, "/api/notifications/unread_count"},
    {:post, "/api/notifications/read_all"},
    {:post, "/api/notifications/:id/read"},
    {:get, "/api/notification_preferences"},
    {:put, "/api/notification_preferences"},
    {:get, "/api/push/public_key"},
    {:post, "/api/push/subscriptions"},
    {:delete, "/api/push/subscriptions"},
    {:post, "/api/channels/:key/messages"},
    {:get, "/api/ingredient_categories"},
    {:get, "/api/ingredient_categories/:id"},
    {:post, "/api/ingredient_categories"},
    {:patch, "/api/ingredient_categories/:id"},
    {:put, "/api/ingredient_categories/:id"},
    {:delete, "/api/ingredient_categories/:id"},
    {:get, "/api/category_field_definitions"},
    {:get, "/api/category_field_definitions/:id"},
    {:post, "/api/category_field_definitions"},
    {:patch, "/api/category_field_definitions/:id"},
    {:put, "/api/category_field_definitions/:id"},
    {:delete, "/api/category_field_definitions/:id"},
    {:get, "/api/ingredients"},
    {:get, "/api/ingredients/:id"},
    {:post, "/api/ingredients"},
    {:patch, "/api/ingredients/:id"},
    {:put, "/api/ingredients/:id"},
    {:delete, "/api/ingredients/:id"},
    {:get, "/api/ingredient_lots"},
    {:get, "/api/ingredient_lots/:id"},
    {:post, "/api/ingredient_lots"},
    {:patch, "/api/ingredient_lots/:id"},
    {:put, "/api/ingredient_lots/:id"},
    {:delete, "/api/ingredient_lots/:id"},
    {:get, "/api/brands"},
    {:get, "/api/brands/:id"},
    {:post, "/api/brands"},
    {:patch, "/api/brands/:id"},
    {:put, "/api/brands/:id"},
    {:delete, "/api/brands/:id"},
    {:get, "/api/recipes"},
    {:get, "/api/recipes/:id"},
    {:post, "/api/recipes"},
    {:patch, "/api/recipes/:id"},
    {:put, "/api/recipes/:id"},
    {:delete, "/api/recipes/:id"},
    {:get, "/api/recipe_ingredients"},
    {:get, "/api/recipe_ingredients/:id"},
    {:post, "/api/recipe_ingredients"},
    {:patch, "/api/recipe_ingredients/:id"},
    {:put, "/api/recipe_ingredients/:id"},
    {:delete, "/api/recipe_ingredients/:id"},
    {:get, "/api/mash_steps"},
    {:get, "/api/mash_steps/:id"},
    {:post, "/api/mash_steps"},
    {:patch, "/api/mash_steps/:id"},
    {:put, "/api/mash_steps/:id"},
    {:delete, "/api/mash_steps/:id"},
    {:get, "/api/recipe_process_steps"},
    {:get, "/api/recipe_process_steps/:id"},
    {:post, "/api/recipe_process_steps"},
    {:patch, "/api/recipe_process_steps/:id"},
    {:put, "/api/recipe_process_steps/:id"},
    {:delete, "/api/recipe_process_steps/:id"},
    {:get, "/api/water_profiles"},
    {:get, "/api/water_profiles/:id"},
    {:post, "/api/water_profiles"},
    {:patch, "/api/water_profiles/:id"},
    {:put, "/api/water_profiles/:id"},
    {:delete, "/api/water_profiles/:id"},
    {:get, "/api/batches"},
    {:get, "/api/batches/:id"},
    {:post, "/api/batches"},
    {:patch, "/api/batches/:id"},
    {:put, "/api/batches/:id"},
    {:delete, "/api/batches/:id"},
    {:get, "/api/brew_turns"},
    {:get, "/api/brew_turns/:id"},
    {:post, "/api/brew_turns"},
    {:patch, "/api/brew_turns/:id"},
    {:put, "/api/brew_turns/:id"},
    {:delete, "/api/brew_turns/:id"},
    {:get, "/api/batch_log_entries"},
    {:get, "/api/batch_log_entries/:id"},
    {:post, "/api/batch_log_entries"},
    {:patch, "/api/batch_log_entries/:id"},
    {:put, "/api/batch_log_entries/:id"},
    {:delete, "/api/batch_log_entries/:id"},
    {:get, "/api/formulas/catalog"},
    {:post, "/api/formulas/execute"}
  ]

  defp app_routes do
    RockcutApiWeb.Router.__routes__()
    |> Enum.reject(&String.starts_with?(&1.path, "/dev"))
    |> Enum.map(&{&1.verb, &1.path})
  end

  test "every route is classified exactly once" do
    routes = app_routes()
    assert length(routes) == length(Enum.uniq(routes)), "a path+verb is declared twice"

    classified = @public ++ @device_ok ++ @device_with_code ++ @denied
    assert length(classified) == length(Enum.uniq(classified))

    unclassified = routes -- classified
    stale = classified -- routes

    assert unclassified == [],
           "Classify these routes for shared devices (D33) in device_route_matrix_test.exs: " <>
             inspect(unclassified)

    assert stale == [], "Routes listed here but no longer in the router: #{inspect(stale)}"
  end

  describe "as taproomDevice" do
    setup do
      {device, token} = taproom_device()
      shift = shift_fixture(%{status: "published"})
      %{device: device, token: token, shift: shift}
    end

    test "every denied route is refused by the router gate (403)", %{token: token} do
      failures =
        for {verb, path} <- @denied,
            conn = call_device(token, verb, fill(path)),
            conn.status != 403 or
              Jason.decode!(conn.resp_body)["error"] != "Not available on a shared device" do
          {verb, path, conn.status}
        end

      assert failures == []
    end

    test "board writes without a staff code answer 422 staff_code_required (D37)", %{
      token: token
    } do
      failures =
        for {verb, path} <- @device_with_code,
            conn = call_device(token, verb, fill(path)),
            conn.status != 422 or
              Jason.decode!(conn.resp_body)["error"] != "staff_code_required" do
          {verb, path, conn.status}
        end

      assert failures == []
    end

    test "every allowlisted route answers 2xx", %{device: device, shift: shift} do
      failures =
        for {verb, path} <- @device_ok,
            # A fresh token per call: DELETE /api/session revokes the one it uses.
            token = RockcutApi.AccountsFixtures.device_token_fixture(device, "matrix"),
            conn = call_device(token, verb, fill(path, shift)),
            conn.status not in 200..299 do
          {verb, path, conn.status}
        end

      assert failures == []
    end
  end

  describe "no staff email or other personal fields (DEV G8, Q6)" do
    setup do
      p = personas(~w(owner barMgr bartender1))
      {device, token} = taproom_device()
      bar = departments()["bar"]

      shift =
        shift_fixture(%{
          status: "published",
          department: bar,
          assignee_id: p["bartender1"].id,
          created_by_id: p["barMgr"].id
        })

      RockcutApi.SchedulingFixtures.event_fixture(%{
        status: "published",
        department: bar,
        created_by_id: p["barMgr"].id
      })

      for key <- ["all", "dept:bar"],
          do: call(p["bartender1"], :post, "/api/channels/#{key}/messages", %{body: "hi #{key}"})

      %{device: device, token: token, shift: shift, p: p}
    end

    test "every allowlisted route answers without an email anywhere", %{
      device: device,
      shift: shift
    } do
      bodies =
        for {verb, path} <- @device_ok, {verb, path} != {:delete, "/api/session"} do
          token = RockcutApi.AccountsFixtures.device_token_fixture(device, "privacy")
          conn = call_device(token, verb, fill(path, shift))
          assert conn.status in 200..299, "#{verb} #{path}"
          {path, if(conn.resp_body == "", do: nil, else: Jason.decode!(conn.resp_body))}
        end

      leaks =
        for {path, body} <- bodies,
            key_paths(body, "email") != [],
            do: {path, key_paths(body, "email")}

      assert leaks == []

      # The data is there, just without emails: names still show.
      shifts = Map.new(bodies)["/api/shifts"]["data"]
      assert Enum.any?(shifts, &(&1["assignee"]["name"] == "Sam Pour"))
      [msg | _] = Map.new(bodies)["/api/channels/:key/messages"]["data"]
      assert msg["user"]["name"] == "Sam Pour"
    end

    test "people still get emails where they had them", %{shift: shift, p: p} do
      body = call(p["barMgr"], :get, "/api/shifts/#{shift.id}").resp_body |> Jason.decode!()
      assert body["data"]["assignee"]["email"] == "bartender1@rockcut-test.com"
    end
  end

  defp key_paths(value, key, at \\ [])

  defp key_paths(map, key, at) when is_map(map) do
    Enum.flat_map(map, fn {k, v} ->
      here = if k == key, do: [Enum.reverse([k | at])], else: []
      here ++ key_paths(v, key, [k | at])
    end)
  end

  defp key_paths(list, key, at) when is_list(list),
    do: list |> Enum.with_index() |> Enum.flat_map(fn {v, i} -> key_paths(v, key, [i | at]) end)

  defp key_paths(_, _, _), do: []

  test "the allowlisted routes still work for people", %{} do
    p = personas(~w(bartender1))["bartender1"]
    shift = shift_fixture(%{status: "published"})

    for {verb, path} <- @device_ok, {verb, path} != {:delete, "/api/session"} do
      assert call(p, verb, fill(path, shift)).status in 200..299, "#{verb} #{path}"
    end
  end

  defp fill(path, shift \\ nil) do
    path
    |> String.replace(":key", "all")
    |> String.replace(":id", to_string((shift && shift.id) || 1))
    |> String.replace(~r/:[a-z_]+/, "1")
  end
end
