defmodule RockcutApiWeb.HealthController do
  use RockcutApiWeb, :controller

  def index(conn, _params) do
    json(conn, %{status: "ok", app: "rockcut_api"})
  end
end
