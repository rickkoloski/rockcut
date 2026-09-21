defmodule RockcutApiWeb.MembershipMeActivityTest do
  @moduledoc "Covers PUT memberships, GET /api/me, and GET /api/owner/activity."
  use RockcutApiWeb.ConnCase

  import RockcutApi.AccountsFixtures

  defp bearer(conn, user) do
    token = Phoenix.Token.sign(@endpoint, "user auth", user.id)
    put_req_header(conn, "authorization", "Bearer #{token}")
  end

  describe "PUT /api/users/:user_id/memberships" do
    test "owner sets memberships declaratively", %{conn: conn} do
      owner = owner_fixture()
      target = user_with_role("employee", "brewery", %{email: "t@rockcut.com"})
      department_fixture("sales")

      body =
        conn
        |> bearer(owner)
        |> put(~p"/api/users/#{target.id}/memberships", %{
          memberships: [%{department: "sales", role: "manager"}]
        })
        |> json_response(200)

      roles = body["data"]["memberships"] |> Map.new(fn m -> {m["department_key"], m["role"]} end)
      assert roles == %{"sales" => "manager"}
    end

    test "manager cannot grant a role outside their department", %{conn: conn} do
      manager = user_with_role("manager", "brewery")
      target = user_with_role("employee", "brewery", %{email: "t@rockcut.com"})
      department_fixture("sales")

      assert conn
             |> bearer(manager)
             |> put(~p"/api/users/#{target.id}/memberships", %{
               memberships: [%{department: "sales", role: "manager"}]
             })
             |> json_response(403)
    end
  end

  describe "GET /api/me" do
    test "returns capabilities scoped to the user's roles", %{conn: conn} do
      manager = user_with_role("manager", "brewery")
      body = conn |> bearer(manager) |> get(~p"/api/me") |> json_response(200)

      assert body["user"]["id"] == manager.id
      assert body["capabilities"]["modules"] == ["brewery"]
      assert body["capabilities"]["manages_departments"] == ["brewery"]
      assert body["capabilities"]["can_manage_users"] == true
    end
  end

  describe "GET /api/owner/activity" do
    test "owner sees an entry after a manager creates a user", %{conn: conn} do
      owner = owner_fixture()
      manager = user_with_role("manager", "brewery")

      # Manager creates a user -> audit "user.created"
      conn
      |> bearer(manager)
      |> post(~p"/api/users", %{
        email: "hire@rockcut.com",
        memberships: [%{department: "brewery", role: "employee"}]
      })
      |> json_response(201)

      actions =
        conn
        |> bearer(owner)
        |> get(~p"/api/owner/activity")
        |> json_response(200)
        |> Map.fetch!("data")
        |> Enum.map(& &1["action"])

      assert "user.created" in actions
    end

    test "non-owner is forbidden", %{conn: conn} do
      manager = user_with_role("manager", "brewery")
      assert conn |> bearer(manager) |> get(~p"/api/owner/activity") |> json_response(403)
    end
  end
end
