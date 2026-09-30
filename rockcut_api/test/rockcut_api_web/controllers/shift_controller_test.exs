defmodule RockcutApiWeb.ShiftControllerTest do
  use RockcutApiWeb.ConnCase

  import RockcutApi.AccountsFixtures
  import RockcutApi.SchedulingFixtures

  defp bearer(conn, user) do
    token = Phoenix.Token.sign(@endpoint, "user auth", user.id)
    put_req_header(conn, "authorization", "Bearer #{token}")
  end

  defp iso(hours_from_now) do
    DateTime.utc_now()
    |> DateTime.add(hours_from_now * 3600, :second)
    |> DateTime.truncate(:second)
    |> DateTime.to_iso8601()
  end

  describe "GET /api/shifts (global read + draft visibility)" do
    test "an employee of another department sees published shifts but not drafts", %{conn: conn} do
      bar = department_fixture("bar")
      sales_emp = user_with_role("employee", "sales")
      published = shift_fixture(%{department: bar, status: "published"})
      draft = shift_fixture(%{department: bar, status: "draft"})

      ids =
        conn
        |> bearer(sales_emp)
        |> get(~p"/api/shifts")
        |> json_response(200)
        |> Map.fetch!("data")
        |> Enum.map(& &1["id"])

      assert published.id in ids
      refute draft.id in ids
    end

    # D32 §3.8 (S19): weeks are Colorado days. Sun Nov 8, 2026, 6 pm MST is
    # 01:00 UTC on Monday the 9th; before D32 it dropped out of its week.
    test "a week range holds the shifts that start on its Colorado days", %{conn: conn} do
      bar = department_fixture("bar")
      emp = user_with_role("employee", "bar")

      at = fn date, time ->
        DateTime.new!(Date.from_iso8601!(date), Time.from_iso8601!(time), "Etc/UTC")
      end

      sunday_close =
        shift_fixture(%{
          department: bar,
          status: "published",
          starts_at: at.("2026-11-09", "01:00:00"),
          ends_at: at.("2026-11-09", "08:00:00")
        })

      # Sun Nov 1, 11 pm MST (06:00 UTC Monday the 2nd) belongs to the week before.
      prior_sunday =
        shift_fixture(%{
          department: bar,
          status: "published",
          starts_at: at.("2026-11-02", "06:00:00"),
          ends_at: at.("2026-11-02", "07:00:00")
        })

      ids = fn from, to ->
        conn
        |> bearer(emp)
        |> get(~p"/api/shifts?from=#{from}&to=#{to}")
        |> json_response(200)
        |> Map.fetch!("data")
        |> Enum.map(& &1["id"])
      end

      week = ids.("2026-11-02", "2026-11-08")
      assert sunday_close.id in week
      refute prior_sunday.id in week
      refute sunday_close.id in ids.("2026-11-09", "2026-11-15")
      assert prior_sunday.id in ids.("2026-10-26", "2026-11-01")
    end
  end

  describe "POST /api/shifts" do
    test "a department manager creates a draft shift", %{conn: conn} do
      bar = department_fixture("bar")
      manager = user_with_role("manager", "bar")
      pos = position_fixture()

      body =
        conn
        |> bearer(manager)
        |> post(~p"/api/shifts", %{
          department_id: bar.id,
          position_id: pos.id,
          starts_at: iso(24),
          ends_at: iso(30)
        })
        |> json_response(201)

      assert body["data"]["status"] == "draft"
      assert body["data"]["department_id"] == bar.id
    end

    test "an employee cannot create a shift", %{conn: conn} do
      bar = department_fixture("bar")
      employee = user_with_role("employee", "bar")
      pos = position_fixture()

      assert conn
             |> bearer(employee)
             |> post(~p"/api/shifts", %{
               department_id: bar.id,
               position_id: pos.id,
               starts_at: iso(24),
               ends_at: iso(30)
             })
             |> json_response(403)
    end
  end

  describe "POST /api/shifts/:id/publish" do
    test "manager publishes a draft", %{conn: conn} do
      bar = department_fixture("bar")
      manager = user_with_role("manager", "bar")
      shift = shift_fixture(%{department: bar, status: "draft"})

      body =
        conn |> bearer(manager) |> post(~p"/api/shifts/#{shift.id}/publish") |> json_response(200)

      assert body["data"]["status"] == "published"
    end
  end

  describe "POST /api/shifts/:id/unpublish" do
    test "manager unpublishes a published shift back to draft", %{conn: conn} do
      bar = department_fixture("bar")
      manager = user_with_role("manager", "bar")
      shift = shift_fixture(%{department: bar, status: "published"})

      body =
        conn
        |> bearer(manager)
        |> post(~p"/api/shifts/#{shift.id}/unpublish")
        |> json_response(200)

      assert body["data"]["status"] == "draft"
    end

    test "an employee cannot unpublish", %{conn: conn} do
      bar = department_fixture("bar")
      employee = user_with_role("employee", "bar")
      shift = shift_fixture(%{department: bar, status: "published"})

      assert conn
             |> bearer(employee)
             |> post(~p"/api/shifts/#{shift.id}/unpublish")
             |> json_response(403)
    end
  end

  describe "POST /api/shifts/:id/claim" do
    test "a department employee claims an open published shift", %{conn: conn} do
      bar = department_fixture("bar")
      employee = user_with_role("employee", "bar")
      shift = shift_fixture(%{department: bar, status: "published"})

      body =
        conn |> bearer(employee) |> post(~p"/api/shifts/#{shift.id}/claim") |> json_response(200)

      assert body["data"]["assignee_id"] == employee.id
    end

    test "an employee of another department cannot claim", %{conn: conn} do
      bar = department_fixture("bar")
      sales_emp = user_with_role("employee", "sales")
      shift = shift_fixture(%{department: bar, status: "published"})

      assert conn
             |> bearer(sales_emp)
             |> post(~p"/api/shifts/#{shift.id}/claim")
             |> json_response(403)
    end
  end
end
