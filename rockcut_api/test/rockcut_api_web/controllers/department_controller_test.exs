defmodule RockcutApiWeb.DepartmentControllerTest do
  use RockcutApiWeb.ConnCase

  import RockcutApi.AccountsFixtures

  defp bearer(conn, user) do
    token = Phoenix.Token.sign(@endpoint, "user auth", user.id)
    put_req_header(conn, "authorization", "Bearer #{token}")
  end

  describe "PATCH /api/departments/:id" do
    test "owner sets a department color", %{conn: conn} do
      owner = owner_fixture()
      bar = department_fixture("bar")

      body =
        conn
        |> bearer(owner)
        |> patch(~p"/api/departments/#{bar.id}", %{color: "#2E6DB4"})
        |> json_response(200)

      assert body["data"]["color"] == "#2E6DB4"
    end

    test "a manager cannot change department colors", %{conn: conn} do
      manager = user_with_role("manager", "bar")
      bar = department_fixture("bar")

      assert conn
             |> bearer(manager)
             |> patch(~p"/api/departments/#{bar.id}", %{color: "#000000"})
             |> json_response(403)
    end

    test "rejects an invalid color", %{conn: conn} do
      owner = owner_fixture()
      bar = department_fixture("bar")

      assert conn
             |> bearer(owner)
             |> patch(~p"/api/departments/#{bar.id}", %{color: "nope"})
             |> json_response(422)
    end
  end
end
