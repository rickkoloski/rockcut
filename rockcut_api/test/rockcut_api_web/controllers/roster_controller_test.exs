defmodule RockcutApiWeb.RosterControllerTest do
  use RockcutApiWeb.ConnCase

  import RockcutApi.AccountsFixtures

  defp bearer(conn, user) do
    token = Phoenix.Token.sign(@endpoint, "user auth", user.id)
    put_req_header(conn, "authorization", "Bearer #{token}")
  end

  test "any authenticated user gets the staff roster (no email/role leaked)", %{conn: conn} do
    viewer = user_with_role("employee", "bar")

    _teammate =
      user_with_role("employee", "brewery", %{email: "brewer@rockcut.com", name: "Bree"})

    entries =
      conn |> bearer(viewer) |> get(~p"/api/roster") |> json_response(200) |> Map.fetch!("data")

    entry = Enum.find(entries, &(&1["name"] == "Bree"))
    assert entry
    assert entry["departments"] == ["brewery"]
    refute Map.has_key?(entry, "email")
    refute Map.has_key?(entry, "role")
  end

  test "a non-schedulable user is excluded from the roster", %{conn: conn} do
    viewer = user_with_role("employee", "bar")
    _hidden = user_fixture(%{name: "Hidden Admin", schedulable: false})

    names =
      conn
      |> bearer(viewer)
      |> get(~p"/api/roster")
      |> json_response(200)
      |> Map.fetch!("data")
      |> Enum.map(& &1["name"])

    refute "Hidden Admin" in names
  end

  describe "POST /api/roster/order" do
    test "a manager saves the display order", %{conn: conn} do
      manager = user_with_role("manager", "bar")
      a = user_fixture(%{name: "Zed"})
      b = user_fixture(%{name: "Amy"})

      ordered =
        conn
        |> bearer(manager)
        |> post(~p"/api/roster/order", %{user_ids: [a.id, b.id]})
        |> json_response(200)
        |> Map.fetch!("data")
        |> Enum.map(& &1["id"])

      assert Enum.find_index(ordered, &(&1 == a.id)) < Enum.find_index(ordered, &(&1 == b.id))
    end

    test "an employee cannot reorder", %{conn: conn} do
      employee = user_with_role("employee", "bar")

      assert conn
             |> bearer(employee)
             |> post(~p"/api/roster/order", %{user_ids: []})
             |> json_response(403)
    end
  end
end
