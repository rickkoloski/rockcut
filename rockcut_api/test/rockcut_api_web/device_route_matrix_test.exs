defmodule RockcutApiWeb.DeviceRouteMatrixTest do
  @moduledoc """
  D33 §3.7: every route in the router × `taproomDevice`. The allowlist passes;
  everything else is refused by `DeviceGate` (403). D40: the tablet's home
  board (bar here) is on the allowlist; another board is `Authz.Device`'s
  403 (task_board_device_test). Generated from the router:
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
    {:get, "/api/beer_board"},
    # D40: a tablet reads its home department's board (`:dept` = bar here).
    {:get, "/api/boards/:dept/tasks"},
    {:get, "/api/boards/:dept/tasks/:id/series"},
    {:get, "/api/boards/:dept/daily_items"}
  ]

  # D37: device-allowed writes that need a person's staff code. Without one
  # they answer 422 `staff_code_required` (with one: beer_board_controller_test).
  @device_with_code [
    {:post, "/api/beer_board"},
    {:post, "/api/beer_board/:id/redeem"},
    {:patch, "/api/beer_board/:id"},
    {:delete, "/api/beer_board/:id"},
    # D40: writes on the tablet's home board (task_board_device_test with a code).
    {:post, "/api/boards/:dept/tasks"},
    {:post, "/api/boards/:dept/tasks/move_overdue_to_today"},
    {:patch, "/api/boards/:dept/tasks/:id"},
    {:delete, "/api/boards/:dept/tasks/:id"},
    {:post, "/api/boards/:dept/tasks/:id/move"},
    {:post, "/api/boards/:dept/tasks/:id/complete"},
    {:post, "/api/boards/:dept/tasks/:id/uncomplete"},
    {:post, "/api/boards/:dept/tasks/:id/stop_repeating"},
    {:put, "/api/boards/:dept/daily_checks/:on_date/:daily_item_id"},
    {:delete, "/api/boards/:dept/daily_checks/:on_date/:daily_item_id"}
  ]

  @denied [
    {:post, "/api/session/password"},
    {:delete, "/api/sessions/others"},
    {:put, "/api/me/color_mode"},
    {:put, "/api/me/show_planned_batches"},
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
    {:post, "/api/formulas/execute"},
    # D41 §3.6: the All departments view, owners only. D40: a board's History
    # and its Daily items changes stay people-only.
    {:get, "/api/boards/all/tasks"},
    {:get, "/api/boards/:dept/tasks/history"},
    {:post, "/api/boards/:dept/daily_items"},
    {:put, "/api/boards/:dept/daily_items/order"},
    {:patch, "/api/boards/:dept/daily_items/:id"},
    {:post, "/api/boards/:dept/daily_items/:id/restore"},
    {:delete, "/api/boards/:dept/daily_items/:id"},
    # D46: production setup, people only until D49 brings the brewhouse tablet.
    {:get, "/api/production/tanks"},
    {:post, "/api/production/tanks"},
    {:post, "/api/production/tanks/reorder"},
    {:patch, "/api/production/tanks/:id"},
    {:delete, "/api/production/tanks/:id"},
    {:post, "/api/production/tanks/:id/restore"},
    {:post, "/api/production/tanks/:id/outages"},
    {:patch, "/api/production/outages/:id"},
    {:delete, "/api/production/outages/:id"},
    {:post, "/api/production/outages/:id/end_today"},
    {:get, "/api/production/phases"},
    {:post, "/api/production/phases"},
    {:post, "/api/production/phases/reorder"},
    {:patch, "/api/production/phases/:id"},
    {:delete, "/api/production/phases/:id"},
    {:post, "/api/production/phases/:id/restore"},
    {:get, "/api/production/step_types"},
    {:post, "/api/production/step_types"},
    {:post, "/api/production/step_types/reorder"},
    {:patch, "/api/production/step_types/:id"},
    {:delete, "/api/production/step_types/:id"},
    {:post, "/api/production/step_types/:id/restore"},
    {:get, "/api/production/templates"},
    {:post, "/api/production/templates"},
    {:post, "/api/production/templates/reorder"},
    {:get, "/api/production/templates/:id"},
    {:patch, "/api/production/templates/:id"},
    {:delete, "/api/production/templates/:id"},
    {:post, "/api/production/templates/:id/restore"},
    {:post, "/api/production/templates/:id/duplicate"},
    {:post, "/api/production/templates/:id/steps"},
    {:patch, "/api/production/templates/:id/steps/:step_id"},
    {:delete, "/api/production/templates/:id/steps/:step_id"},
    {:post, "/api/production/templates/:id/links"},
    {:patch, "/api/production/templates/:id/links/:link_id"},
    {:delete, "/api/production/templates/:id/links/:link_id"},
    {:post, "/api/production/templates/:id/ramp"},
    # D47: the schedule, batches and steps; people only until D49.
    {:get, "/api/production/schedule"},
    {:post, "/api/production/batches"},
    {:patch, "/api/production/batches/:id"},
    {:delete, "/api/production/batches/:id"},
    {:post, "/api/production/batches/:id/shift"},
    {:patch, "/api/production/batches/:id/vessels/:index"},
    # D49: pencilled batches, people only.
    {:post, "/api/production/batches/:id/schedule"},
    {:post, "/api/production/batches/:id/pencil"},
    # D48: changing a batch, people only like D47's.
    {:post, "/api/production/batches/:id/steps"},
    {:post, "/api/production/batches/:id/ramp"},
    {:post, "/api/production/batches/:id/transfers"},
    {:delete, "/api/production/batches/:id/transfers/:step_id"},
    {:delete, "/api/production/steps/:id"},
    {:post, "/api/production/steps/:id/ramp"},
    {:post, "/api/production/batches/:id/split"},
    {:delete, "/api/production/batches/:id/split"},
    {:post, "/api/production/tanks/:id/condition"},
    {:delete, "/api/production/condition_marks/:id"},
    {:post, "/api/production/steps/move"},
    {:post, "/api/production/steps/assign"},
    {:post, "/api/production/steps/:id/complete"},
    {:post, "/api/production/steps/:id/uncomplete"},
    {:patch, "/api/production/steps/:id"},
    {:post, "/api/production/cips"},
    {:patch, "/api/production/cips/:id"},
    {:delete, "/api/production/cips/:id"},
    {:post, "/api/production/cips/:id/complete"},
    {:post, "/api/production/cips/:id/uncomplete"},
    {:post, "/api/production/flags/signoff"},
    {:delete, "/api/production/flags/signoff/:key"},
    {:post, "/api/production/undo/:token"}
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
      # The staff-code limiter is keyed by token id, and the test DB reuses
      # ids after a rollback: a lock another test left would answer 429 here.
      RockcutApi.StaffCodes.RateLimiter.reset()
      {device, token} = taproom_device()
      shift = shift_fixture(%{status: "published"})
      %{device: device, token: token, shift: shift, task: repeating_task()}
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

    test "every allowlisted route answers 2xx", %{device: device, shift: shift, task: task} do
      failures =
        for {verb, path} <- @device_ok,
            # A fresh token per call: DELETE /api/session revokes the one it uses.
            token = RockcutApi.AccountsFixtures.device_token_fixture(device, "matrix"),
            conn = call_device(token, verb, fill(path, shift, task), query(path)),
            conn.status not in 200..299 do
          {verb, path, conn.status}
        end

      assert failures == []
    end
  end

  # D49 decision 8: on its home board, a tablet's writes to a task made from
  # a production step are refused before any staff code (until D50); the
  # series read is `linked_task` for anyone.
  describe "as breweryDevice, on a linked task (D49)" do
    setup do
      RockcutApi.StaffCodes.RateLimiter.reset()
      p = personas(~w(breweryMgr brewer1))
      {:ok, _} = RockcutApi.StaffCodes.set(p["brewer1"], "1111", p["breweryMgr"])
      device = RockcutApi.AccountsFixtures.device_fixture(%{home: "brewery", name: "Brewhouse"})
      token = RockcutApi.AccountsFixtures.device_token_fixture(device, "Brewhouse Tab")

      batch =
        RockcutApi.ProductionFixtures.plan!(
          RockcutApi.ProductionFixtures.brand!("Matrix"),
          RockcutApi.ProductionFixtures.ale_template!(),
          RockcutApi.Tasks.today()
        )

      RockcutApi.Production.TaskLink.sync!()
      fdh = RockcutApi.ProductionFixtures.named(batch, "FDH")
      task = RockcutApi.Repo.get_by!(RockcutApi.Tasks.Task, production_step_id: fdh.id)
      %{token: token, task: task}
    end

    test "every write on it is 403 linked_task_device, with a code or without", %{
      token: token,
      task: task
    } do
      routes = Enum.filter(@device_with_code, fn {_, path} -> path =~ "/tasks/:id" end)
      # update, delete, move, complete, uncomplete, stop_repeating
      assert length(routes) == 6

      failures =
        for {verb, path} <- routes,
            code <- [nil, "1111"],
            params = if(code, do: %{staff_code: code}, else: %{}),
            conn = call_device(token, verb, fill_linked(path, task), params),
            conn.status != 403 or
              Jason.decode!(conn.resp_body)["error"] != "linked_task_device" do
          {verb, path, code, conn.status}
        end

      assert failures == []
    end

    test "the board reads it; its series is linked_task", %{token: token, task: task} do
      today = Date.to_iso8601(RockcutApi.Tasks.today())

      assert call_device(token, :get, "/api/boards/brewery/tasks", %{from: today, to: today}).status ==
               200

      conn = call_device(token, :get, "/api/boards/brewery/tasks/#{task.id}/series")
      assert conn.status == 422
      assert Jason.decode!(conn.resp_body)["error"] == "linked_task"
    end
  end

  defp fill_linked(path, task),
    do:
      path
      |> String.replace(":dept", "brewery")
      |> String.replace(":id", to_string(task.id))

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

      %{device: device, token: token, shift: shift, p: p, task: repeating_task(p["bartender1"])}
    end

    test "every allowlisted route answers without an email anywhere", %{
      device: device,
      shift: shift,
      task: task
    } do
      bodies =
        for {verb, path} <- @device_ok, {verb, path} != {:delete, "/api/session"} do
          token = RockcutApi.AccountsFixtures.device_token_fixture(device, "privacy")
          conn = call_device(token, verb, fill(path, shift, task), query(path))
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
    task = repeating_task(p)

    for {verb, path} <- @device_ok, {verb, path} != {:delete, "/api/session"} do
      assert call(p, verb, fill(path, shift, task), query(path)).status in 200..299,
             "#{verb} #{path}"
    end
  end

  # A repeating task on the Taproom board (taproomDevice's home), for the
  # series read.
  defp repeating_task(person \\ nil) do
    person = person || personas(~w(bartender1))["bartender1"]
    today = RockcutApi.Tasks.today()

    {:ok, task} =
      RockcutApi.Tasks.create(
        RockcutApi.TaskFixtures.task_board("bar"),
        %{
          "title" => "Matrix weekly",
          "due_on" => Date.to_iso8601(today),
          "repeat" => "weekly",
          "repeat_weekdays" => [Date.day_of_week(today)]
        },
        person
      )

    task
  end

  defp query("/api/boards/:dept/tasks") do
    today = Date.to_iso8601(RockcutApi.Tasks.today())
    %{from: today, to: today}
  end

  defp query(_path), do: %{}

  # `:dept` is the device's home (bar): another board is 403 for a device.
  defp fill(path, shift \\ nil, task \\ nil) do
    path
    |> String.replace(":key", "all")
    |> String.replace(":dept", "bar")
    |> String.replace("/tasks/:id", "/tasks/#{(task && task.id) || 1}")
    |> String.replace(":id", to_string((shift && shift.id) || 1))
    |> String.replace(~r/:[a-z_]+/, "1")
  end
end
