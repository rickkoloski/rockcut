defmodule RockcutApiWeb.HealthController do
  use RockcutApiWeb, :controller

  # D51 (task 4669): `env` is the deploy environment and `sha` the commit the
  # release was built from ("unknown" when the build didn't pass GIT_SHA), so
  # "what's on DEV/prod?" is answered by asking the server.
  def index(conn, _params) do
    json(conn, %{
      status: "ok",
      app: "rockcut_api",
      env: RockcutApi.Seeds.Guard.deploy_env(),
      sha: git_sha()
    })
  end

  defp git_sha do
    case Application.get_env(:rockcut_api, :git_sha) do
      sha when is_binary(sha) and sha != "" -> sha
      _ -> "unknown"
    end
  end
end
