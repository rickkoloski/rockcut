defmodule RockcutApiWeb.PasswordResetGateTest do
  @moduledoc "D42 §2.1 (task 4117): only the reset flow while a password reset is required."
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures, except: [status: 3, status: 4]
  alias RockcutApi.Repo

  @range "from=2026-10-12&to=2026-10-18"

  setup do
    %{p: personas(~w(owner barMgr bartender1 newhire))}
  end

  defp refused?(conn), do: json_response(conn, 403) == %{"error" => "password_reset_required"}

  defp sign_in(email, password) do
    build_conn()
    |> post("/api/session", %{email: email, password: password})
    |> json_response(200)
    |> Map.fetch!("token")
  end

  # Read and write routes across areas, and both authenticated pipelines.
  @refused [
    {:get, "/api/boards/bar/tasks?#{@range}"},
    {:post, "/api/boards/bar/tasks"},
    {:get, "/api/boards/bar/daily_items"},
    {:get, "/api/boards/all/tasks?#{@range}"},
    {:get, "/api/beer_board"},
    {:post, "/api/beer_board"},
    {:get, "/api/beer_board/history"},
    {:get, "/api/shifts"},
    {:post, "/api/shifts"},
    {:get, "/api/departments"},
    {:get, "/api/roster"},
    {:post, "/api/time_off"},
    {:get, "/api/users"},
    {:post, "/api/users"},
    {:get, "/api/notifications"},
    {:get, "/api/channels"},
    {:post, "/api/channels/all/messages"},
    {:delete, "/api/sessions/others"},
    {:get, "/api/ingredients"}
  ]

  for {method, path} <- @refused do
    test "S121 newhire: #{method} #{path} is refused", %{p: p} do
      assert refused?(call(p["newhire"], unquote(method), unquote(path)))
    end
  end

  test "S121 the reset flow stays open", %{p: p} do
    assert call(p["newhire"], :get, "/api/me") |> json_response(200)
    assert call(p["newhire"], :get, "/api/session") |> json_response(200)

    # Reaches the controller: a wrong current password is its 422, not the gate's 403.
    p["newhire"]
    |> RockcutApi.Accounts.User.password_changeset(%{"password" => "temporary-pw"})
    |> Repo.update!()

    conn =
      call(p["newhire"], :post, "/api/session/password", %{
        current_password: "wrong",
        new_password: "a-new-password"
      })

    assert json_response(conn, 422)["error"] == "Current password is incorrect"
    assert call(p["newhire"], :delete, "/api/session") |> json_response(200)
  end

  test "someone without the flag isn't affected", %{p: p} do
    assert call(p["bartender1"], :get, "/api/boards/bar/tasks?#{@range}") |> json_response(200)
    assert call(p["bartender1"], :get, "/api/beer_board") |> json_response(200)
  end

  test "a shared device isn't affected" do
    {_device, token} = taproom_device()
    assert call_device(token, :get, "/api/me") |> json_response(200)
    assert call_device(token, :get, "/api/beer_board") |> json_response(200)
  end

  test "a person created with a temporary password: refused until they set one", %{p: p} do
    conn =
      call(p["barMgr"], :post, "/api/users", %{
        email: "temp-person@rockcut-test.com",
        name: "[TEST-TEMP] New person",
        password: "temporary-pw",
        memberships: [%{department: "bar", role: "employee"}]
      })

    assert json_response(conn, 201)["data"]["must_reset_password"]
    token = sign_in("temp-person@rockcut-test.com", "temporary-pw")

    assert refused?(call_device(token, :get, "/api/boards/bar/tasks?#{@range}"))
    assert call_device(token, :get, "/api/me") |> json_response(200)

    call_device(token, :post, "/api/session/password", %{
      current_password: "temporary-pw",
      new_password: "my-own-password"
    })
    |> json_response(200)

    assert call_device(token, :get, "/api/boards/bar/tasks?#{@range}") |> json_response(200)
  end

  test "S122 a person whose password an owner reset: 403, set a new one, then 200", %{p: p} do
    target = p["bartender1"]

    temp =
      call(p["owner"], :post, "/api/users/#{target.id}/reset_password")
      |> json_response(200)
      |> Map.fetch!("temp_password")

    assert Repo.reload!(target).must_reset_password
    token = sign_in(target.email, temp)
    write = %{"title" => "[TEST-TEMP] after reset", "due_on" => Date.to_iso8601(Date.utc_today())}

    assert refused?(call_device(token, :post, "/api/boards/bar/tasks", write))

    call_device(token, :post, "/api/session/password", %{
      current_password: temp,
      new_password: "my-own-password"
    })
    |> json_response(200)

    assert call_device(token, :post, "/api/boards/bar/tasks", write) |> json_response(201)
  end
end
