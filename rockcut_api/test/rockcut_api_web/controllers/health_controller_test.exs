defmodule RockcutApiWeb.HealthControllerTest do
  # Changes application env, so not async.
  use RockcutApiWeb.ConnCase, async: false

  setup do
    previous = Application.get_env(:rockcut_api, :git_sha)
    on_exit(fn -> Application.put_env(:rockcut_api, :git_sha, previous) end)
  end

  test "reports the build commit and the deploy env (4669)", %{conn: conn} do
    sha = "4a5921c0123456789abcdef0123456789abcdef0"
    Application.put_env(:rockcut_api, :git_sha, sha)

    assert conn |> get(~p"/api/health") |> json_response(200) == %{
             "status" => "ok",
             "app" => "rockcut_api",
             "env" => "test",
             "sha" => sha
           }
  end

  test "sha is \"unknown\" when the build didn't pass one", %{conn: conn} do
    for unset <- ["", nil] do
      Application.put_env(:rockcut_api, :git_sha, unset)
      assert json_response(get(conn, ~p"/api/health"), 200)["sha"] == "unknown"
    end
  end
end
