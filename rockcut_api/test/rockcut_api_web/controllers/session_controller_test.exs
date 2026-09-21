defmodule RockcutApiWeb.SessionControllerTest do
  use RockcutApiWeb.ConnCase

  import RockcutApi.AccountsFixtures

  defp bearer(conn, user) do
    token = Phoenix.Token.sign(@endpoint, "user auth", user.id)
    put_req_header(conn, "authorization", "Bearer #{token}")
  end

  describe "POST /api/session" do
    test "returns a token and user on valid credentials", %{conn: conn} do
      user_fixture(%{email: "matt@rockcut.com", password: "rockcut2026"})

      conn = post(conn, ~p"/api/session", %{email: "matt@rockcut.com", password: "rockcut2026"})

      assert %{"token" => token, "user" => %{"email" => "matt@rockcut.com"}} =
               json_response(conn, 200)

      assert is_binary(token)
    end

    test "401 on wrong password", %{conn: conn} do
      user_fixture(%{email: "matt@rockcut.com", password: "rockcut2026"})
      conn = post(conn, ~p"/api/session", %{email: "matt@rockcut.com", password: "nope"})
      assert json_response(conn, 401)["error"] == "Invalid credentials"
    end

    test "401 for a disabled account", %{conn: conn} do
      user_fixture(%{email: "gone@rockcut.com", password: "rockcut2026", active: false})
      conn = post(conn, ~p"/api/session", %{email: "gone@rockcut.com", password: "rockcut2026"})
      assert json_response(conn, 401)["error"] == "Account disabled"
    end
  end

  describe "GET /api/session" do
    test "returns the current user with a valid token", %{conn: conn} do
      user = user_with_role("manager", "brewery")
      conn = conn |> bearer(user) |> get(~p"/api/session")
      body = json_response(conn, 200)
      assert body["user"]["id"] == user.id
      assert [%{"role" => "manager", "department_key" => "brewery"}] = body["user"]["memberships"]
    end

    test "401 without a token", %{conn: conn} do
      assert conn |> get(~p"/api/session") |> json_response(401)
    end

    test "401 once the user is deactivated (soft revocation)", %{conn: conn} do
      user = user_fixture()
      RockcutApi.Repo.update!(Ecto.Changeset.change(user, active: false))
      assert conn |> bearer(user) |> get(~p"/api/session") |> json_response(401)
    end
  end
end
