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
end
