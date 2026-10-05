defmodule RockcutApiWeb.LiveSocketTest do
  @moduledoc "D36-A (task 3997): no LiveView socket outside dev (test runs without :dev_routes, like prod)."
  use RockcutApiWeb.ConnCase, async: true

  test "dev routes are off here, as on prod" do
    refute Application.get_env(:rockcut_api, :dev_routes)
  end

  for path <- ~w(/live/websocket /live/longpoll) do
    test "#{path} is not mounted", %{conn: conn} do
      assert get(conn, unquote(path)).status == 404
    end
  end
end
