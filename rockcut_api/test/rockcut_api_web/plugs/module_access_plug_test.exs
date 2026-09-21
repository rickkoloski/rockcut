defmodule RockcutApiWeb.ModuleAccessPlugTest do
  @moduledoc "Exercises Brewery module gating via a real brewing route."
  use RockcutApiWeb.ConnCase

  import RockcutApi.AccountsFixtures

  defp bearer(conn, user) do
    token = Phoenix.Token.sign(@endpoint, "user auth", user.id)
    put_req_header(conn, "authorization", "Bearer #{token}")
  end

  test "owner may reach a brewing route", %{conn: conn} do
    owner = owner_fixture()
    assert conn |> bearer(owner) |> get(~p"/api/ingredients") |> json_response(200)
  end

  test "brewery member may reach a brewing route", %{conn: conn} do
    member = user_with_role("employee", "brewery")
    assert conn |> bearer(member) |> get(~p"/api/ingredients") |> json_response(200)
  end

  test "non-brewery user is forbidden", %{conn: conn} do
    outsider = user_with_role("manager", "sales")
    conn = conn |> bearer(outsider) |> get(~p"/api/ingredients")
    assert json_response(conn, 403)["error"] == "Forbidden"
  end

  test "unauthenticated request is unauthorized", %{conn: conn} do
    assert conn |> get(~p"/api/ingredients") |> json_response(401)
  end
end
