defmodule RockcutApiWeb.UserControllerTest do
  use RockcutApiWeb.ConnCase

  import RockcutApi.AccountsFixtures

  defp bearer(conn, user) do
    token = Phoenix.Token.sign(@endpoint, "user auth", user.id)
    put_req_header(conn, "authorization", "Bearer #{token}")
  end

  describe "GET /api/users" do
    test "employee is forbidden", %{conn: conn} do
      employee = user_with_role("employee", "brewery")
      assert conn |> bearer(employee) |> get(~p"/api/users") |> json_response(403)
    end

    test "manager sees only their department's members", %{conn: conn} do
      manager = user_with_role("manager", "brewery")
      _brewery_emp = user_with_role("employee", "brewery", %{email: "b@rockcut.com"})
      _sales_emp = user_with_role("employee", "sales", %{email: "s@rockcut.com"})

      emails =
        conn
        |> bearer(manager)
        |> get(~p"/api/users")
        |> json_response(200)
        |> Map.fetch!("data")
        |> Enum.map(& &1["email"])

      assert "b@rockcut.com" in emails
      refute "s@rockcut.com" in emails
    end

    test "owner sees everyone", %{conn: conn} do
      owner = owner_fixture()
      _a = user_with_role("employee", "sales", %{email: "a@rockcut.com"})

      emails =
        conn
        |> bearer(owner)
        |> get(~p"/api/users")
        |> json_response(200)
        |> Map.fetch!("data")
        |> Enum.map(& &1["email"])

      assert "a@rockcut.com" in emails
    end
  end

  describe "POST /api/users" do
    test "manager creates a user in their department and gets a temp password", %{conn: conn} do
      manager = user_with_role("manager", "brewery")

      body =
        conn
        |> bearer(manager)
        |> post(~p"/api/users", %{
          email: "hire@rockcut.com",
          name: "Hire",
          memberships: [%{department: "brewery", role: "employee"}]
        })
        |> json_response(201)

      assert body["data"]["email"] == "hire@rockcut.com"
      assert is_binary(body["temp_password"])

      assert [%{"role" => "employee", "department_key" => "brewery"}] =
               body["data"]["memberships"]
    end

    test "manager cannot assign a role in another department", %{conn: conn} do
      manager = user_with_role("manager", "brewery")
      department_fixture("sales")

      assert conn
             |> bearer(manager)
             |> post(~p"/api/users", %{
               email: "x@rockcut.com",
               memberships: [%{department: "sales", role: "employee"}]
             })
             |> json_response(403)
    end

    test "employee cannot create users", %{conn: conn} do
      employee = user_with_role("employee", "brewery")

      assert conn
             |> bearer(employee)
             |> post(~p"/api/users", %{email: "x@rockcut.com"})
             |> json_response(403)
    end
  end

  describe "PATCH /api/users/:id" do
    test "owner cannot deactivate the last owner", %{conn: conn} do
      owner = owner_fixture()

      assert conn
             |> bearer(owner)
             |> patch(~p"/api/users/#{owner.id}", %{active: false})
             |> json_response(422)
    end

    test "manager deactivates a user in their department", %{conn: conn} do
      manager = user_with_role("manager", "brewery")
      target = user_with_role("employee", "brewery", %{email: "t@rockcut.com"})

      body =
        conn
        |> bearer(manager)
        |> patch(~p"/api/users/#{target.id}", %{active: false})
        |> json_response(200)

      refute body["data"]["active"]
    end

    test "manager cannot touch a user outside their department", %{conn: conn} do
      manager = user_with_role("manager", "brewery")
      outsider = user_with_role("employee", "sales", %{email: "o@rockcut.com"})

      assert conn
             |> bearer(manager)
             |> patch(~p"/api/users/#{outsider.id}", %{active: false})
             |> json_response(403)
    end
  end

  describe "POST /api/users/:id/reset_password" do
    test "manager resets a department member's password", %{conn: conn} do
      manager = user_with_role("manager", "brewery")
      target = user_with_role("employee", "brewery", %{email: "t@rockcut.com"})

      body =
        conn
        |> bearer(manager)
        |> post(~p"/api/users/#{target.id}/reset_password")
        |> json_response(200)

      assert is_binary(body["temp_password"])
    end
  end
end
