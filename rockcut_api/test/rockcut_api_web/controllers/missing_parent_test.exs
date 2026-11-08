defmodule RockcutApiWeb.MissingParentTest do
  @moduledoc """
  D55 §2.12, T14 through the API: a write naming a parent that doesn't exist
  (`12345`, `0`, `-1`) is 422 on that field ("does not exist"), or the 404 a
  route already gives when it looks the parent up first. Never a 500; nothing
  is saved.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures

  alias RockcutApi.{Brewing, Repo}

  setup do
    p = personas(~w(owner))
    {:ok, brand} = Brewing.create_brand(%{name: "[TEST] Parents"})
    {:ok, recipe} = Brewing.create_recipe(%{brand_id: brand.id, batch_size: 15})
    {:ok, cat} = Brewing.create_ingredient_category(%{name: "Parents"})
    {:ok, ing} = Brewing.create_ingredient(%{name: "Pils", category_id: cat.id})
    {:ok, lot} = Brewing.create_ingredient_lot(%{ingredient_id: ing.id, lot_number: "P-1"})
    pos = RockcutApi.SchedulingFixtures.position_fixture()
    %{owner: p["owner"], recipe: recipe, lot: lot, cat: cat, ing: ing, pos: pos}
  end

  defp req(user, verb, path, body) do
    conn =
      as(user)
      |> put_req_header("content-type", "application/json")
      |> dispatch(@endpoint, verb, path, Jason.encode!(body))

    {conn.status, Jason.decode!(conn.resp_body)}
  end

  defp cases(c, v) do
    [
      {"/api/recipes", %{brand_id: v, batch_size: 15}, "brand_id", RockcutApi.Brewing.Recipe},
      {"/api/ingredients", %{name: "X#{v}", category_id: v}, "category_id",
       RockcutApi.Brewing.Ingredient},
      {"/api/ingredient_lots", %{ingredient_id: v, lot_number: "L"}, "ingredient_id",
       RockcutApi.Brewing.IngredientLot},
      {"/api/recipe_ingredients", %{recipe_id: c.recipe.id, lot_id: v, amount: 1, unit: "lb"},
       "lot_id", RockcutApi.Brewing.RecipeIngredient},
      {"/api/mash_steps",
       %{
         recipe_id: v,
         name: "Mash",
         step_number: 1,
         type: "infusion",
         temperature: 150,
         duration: 60
       }, "recipe_id", RockcutApi.Brewing.MashStep},
      {"/api/category_field_definitions", %{category_id: v, field_name: "F", field_type: "text"},
       "category_id", RockcutApi.Brewing.CategoryFieldDefinition},
      {"/api/batches", %{brand_id: v}, "brand_id", RockcutApi.Brewing.Batch},
      {"/api/positions", %{name: "P#{v}", department_id: v}, "department_id",
       RockcutApi.Scheduling.Position},
      {"/api/shift_templates",
       %{position_id: v, name: "T", start_time: "09:00:00", end_time: "17:00:00"}, "position_id",
       RockcutApi.Scheduling.ShiftTemplate},
      {"/api/shifts",
       %{
         position_id: c.pos.id,
         assignee_id: v,
         starts_at: "2026-11-10T15:00:00Z",
         ends_at: "2026-11-10T20:00:00Z"
       }, "assignee_id", RockcutApi.Scheduling.Shift},
      {"/api/devices", %{name: "Tab", home_department_id: v}, "home_department_id",
       RockcutApi.Accounts.User},
      {"/api/time_off",
       %{
         user_id: v,
         type: "pto",
         all_day: true,
         starts_at: "2026-11-10T07:00:00Z",
         ends_at: "2026-11-11T07:00:00Z"
       }, "user_id", RockcutApi.TimeOff.Request},
      {"/api/schedule_events",
       %{
         department_id: v,
         title: "E",
         starts_at: "2026-11-10T15:00:00Z",
         ends_at: "2026-11-10T16:00:00Z"
       }, "department_id", RockcutApi.Scheduling.ScheduleEvent},
      {"/api/availability", %{user_id: v, weekday: 1, kind: "unavailable", all_day: true},
       "user_id", RockcutApi.Availability.Slot}
    ]
  end

  test "T14 via the API: 422 \"does not exist\" on the field, nothing saved", c do
    for v <- [12_345, 0, -1], {path, body, field, schema} <- cases(c, v) do
      before = Repo.aggregate(schema, :count)

      assert {422, %{"errors" => %{^field => ["does not exist"]}}} =
               req(c.owner, :post, path, body),
             "#{path} #{field}=#{v}"

      assert Repo.aggregate(schema, :count) == before, "#{path} saved a row"
    end
  end

  test "a route that looks the parent up first keeps its answer (shift position: 403)", c do
    before = Repo.aggregate(RockcutApi.Scheduling.Shift, :count)

    assert {403, _} =
             req(c.owner, :post, "/api/shifts", %{
               position_id: 12_345,
               starts_at: "2026-11-10T15:00:00Z",
               ends_at: "2026-11-10T20:00:00Z"
             })

    assert Repo.aggregate(RockcutApi.Scheduling.Shift, :count) == before
  end
end
