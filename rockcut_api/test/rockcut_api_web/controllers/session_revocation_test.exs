defmodule RockcutApiWeb.SessionRevocationTest do
  @moduledoc "D34 scenarios at the API level (spec §4)."
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.AccountsFixtures
  import RockcutApi.PersonaFixtures, except: [status: 3, status: 4]
  alias RockcutApi.{Devices, Repo, Sessions}
  alias RockcutApi.Sessions.UserSession

  @password "rockcut2026"

  setup do
    p = personas(~w(owner barMgr bartender1))
    {device, tablet_token} = taproom_device()
    %{p: p, device: device, tablet_token: tablet_token}
  end

  defp sign_in(user, headers \\ []) do
    # Personas have the secret seed password; give this one a known test password.
    set_password(user, @password)

    conn =
      Enum.reduce(headers, build_conn(), fn {k, v}, c -> put_req_header(c, k, v) end)
      |> post("/api/session", %{email: user.email, password: @password})

    json_response(conn, 200)["token"]
  end

  defp post_session(email, password, headers) do
    Enum.reduce(headers, build_conn(), fn {k, v}, c -> put_req_header(c, k, v) end)
    |> post("/api/session", %{email: email, password: password})
  end

  defp set_password(user, password) do
    user
    |> RockcutApi.Accounts.User.password_changeset(%{"password" => password})
    |> Repo.update!()
  end

  defp code(token, method \\ :get, path \\ "/api/me"),
    do: call_device(token, method, path).status

  defp tablet_row(token), do: Devices.live_token(token)

  test "S1 sign-in returns a ses_ token that works", %{p: p} do
    token = sign_in(p["bartender1"])
    assert "ses_" <> _ = token
    assert code(token) == 200
  end

  test "S2 sign-out: the old token gets 401", %{p: p} do
    token = sign_in(p["bartender1"])
    assert call_device(token, :delete, "/api/session") |> json_response(200) == %{"ok" => true}
    assert code(token) == 401
    # Signing out again is a harmless 401.
    assert code(token, :delete, "/api/session") == 401
  end

  test "S3 signing out in one browser leaves the other signed in", %{p: p} do
    a = sign_in(p["bartender1"])
    b = sign_in(p["bartender1"])
    call_device(a, :delete, "/api/session")
    assert code(a) == 401
    assert code(b) == 200
  end

  describe "no personal logins on a paired tablet (D54 S246–S248)" do
    @refusal "This device is already set as a shared device. Personal logins not accepted."

    test "S246 a live device header: 403 for the right and a wrong password, no session",
         %{p: p, tablet_token: t} do
      set_password(p["bartender1"], @password)
      before = Repo.aggregate(UserSession, :count)

      for password <- [@password, "wrong-password"] do
        conn = post_session(p["bartender1"].email, password, [{"x-rockcut-device", t}])
        assert json_response(conn, 403) == %{"error" => @refusal}
      end

      assert Repo.aggregate(UserSession, :count) == before
      # The tablet itself is untouched.
      assert code(t) == 200
    end

    test "S246 refused before the password: an unknown email gets the same 403",
         %{tablet_token: t} do
      conn = post_session("nobody@rockcut-test.com", "x", [{"x-rockcut-device", t}])
      assert json_response(conn, 403) == %{"error" => @refusal}
    end

    test "S247 no device header: a normal 30-day sign-in", %{p: p} do
      token = sign_in(p["bartender1"])
      row = Repo.get_by!(UserSession, token_hash: RockcutApi.Tokens.hash(token))
      assert DateTime.diff(row.expires_at, row.inserted_at) == 30 * 24 * 3600
    end

    test "S248 a revoked, made-up or person token in the header: a normal sign-in",
         %{p: p} = c do
      revoked = c.tablet_token
      {:ok, _} = Devices.revoke_token(tablet_row(revoked), p["owner"])
      person_token = sign_in(p["barMgr"])

      for header <- [revoked, "dev_made-up", person_token, "garbage"] do
        token = sign_in(p["bartender1"], [{"x-rockcut-device", header}])
        assert code(token) == 200, "header #{inspect(header)} refused a sign-in"
      end
    end

    test "a made-up ses_ token gets 401" do
      assert code("ses_made-up") == 401
    end
  end

  describe "passwords (S8, S9)" do
    test "S8 changing your password signs out your other sessions", %{p: p} do
      here = sign_in(p["bartender1"])
      there = sign_in(p["bartender1"])

      body =
        call_device(here, :post, "/api/session/password", %{
          current_password: @password,
          new_password: "a-new-password"
        })
        |> json_response(200)

      assert body["revoked"] == 1
      assert code(here) == 200
      assert code(there) == 401
    end

    test "G3 the current password can't be the new one", %{p: p} do
      here = sign_in(p["bartender1"])
      there = sign_in(p["bartender1"])

      conn =
        call_device(here, :post, "/api/session/password", %{
          current_password: @password,
          new_password: @password
        })

      assert json_response(conn, 422)["error"] == "The new password must be different"
      assert code(there) == 200
    end

    test "S8 a wrong current password changes nothing", %{p: p} do
      here = sign_in(p["bartender1"])
      there = sign_in(p["bartender1"])

      conn =
        call_device(here, :post, "/api/session/password", %{
          current_password: "wrong",
          new_password: "a-new-password"
        })

      assert json_response(conn, 422)["error"] == "Current password is incorrect"
      assert code(there) == 200
    end

    test "S9 an owner's reset signs the person out everywhere", %{p: p} do
      a = sign_in(p["bartender1"])
      b = sign_in(p["bartender1"])

      assert call(p["owner"], :post, "/api/users/#{p["bartender1"].id}/reset_password").status ==
               200

      assert code(a) == 401
      assert code(b) == 401
    end
  end

  describe "pre-D34 tokens (D51, task 4058)" do
    test "a correctly signed old-style token gets 401", %{p: p} do
      old = Phoenix.Token.sign(RockcutApiWeb.Endpoint, "user auth", p["bartender1"].id)
      assert code(old) == 401
    end

    test "a correctly signed old synthetic-persona token gets 401 here too", %{p: p} do
      old = Phoenix.Token.sign(RockcutApiWeb.Endpoint, "synthetic auth", p["bartender1"].id)
      assert code(old) == 401
    end
  end

  describe "DELETE /api/sessions/others (S14, S16)" do
    test "S14 revokes every other session, keeps this one, and is audited", %{p: p} do
      phone = sign_in(p["bartender1"])
      laptop = sign_in(p["bartender1"])
      desktop = sign_in(p["bartender1"])

      assert call_device(phone, :delete, "/api/sessions/others") |> json_response(200) ==
               %{"revoked" => 2}

      assert code(phone) == 200
      assert code(laptop) == 401
      assert code(desktop) == 401

      assert Repo.get_by(RockcutApi.Accounts.AuditEntry,
               action: "user.signed_out_everywhere",
               target_id: p["bartender1"].id
             )
    end

    test "S16 a tablet gets 403", %{tablet_token: t} do
      assert code(t, :delete, "/api/sessions/others") == 403
    end
  end

  test "S10 deactivation is unchanged: every session gets 401", %{p: p} do
    token = sign_in(p["bartender1"])
    Repo.update!(Ecto.Changeset.change(p["bartender1"], active: false))
    assert code(token) == 401
  end

  test "a device account can't sign in with a session row", %{device: device} do
    assert code(session_token_fixture(device)) == 401
  end

  test "Sessions rows aren't readable as tokens", %{p: p} do
    token = sign_in(p["bartender1"])
    row = Repo.get_by!(UserSession, token_hash: RockcutApi.Tokens.hash(token))
    refute inspect(row) =~ token
    assert {:ok, _, _} = Sessions.authenticate(token)
  end
end
