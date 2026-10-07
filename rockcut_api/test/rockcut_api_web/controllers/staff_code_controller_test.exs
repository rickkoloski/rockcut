defmodule RockcutApiWeb.StaffCodeControllerTest do
  @moduledoc "D37 §3.2 / §3.4: staff code routes for the user edit dialog (S1–S4, S16)."
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import Phoenix.ConnTest

  alias RockcutApi.StaffCodes

  setup do
    %{p: personas(~w(owner barMgr breweryMgr bartender1 bartender2 brewer1))}
  end

  defp path(user, suffix \\ ""), do: "/api/users/#{user.id}/staff_code#{suffix}"

  test "S1: a Taproom manager sets a code, then reveals it", %{p: p} do
    conn = call(p["barMgr"], :put, path(p["bartender1"]), %{"code" => "4821"})
    assert %{"data" => %{"has_staff_code" => true}} = json_response(conn, 200)

    conn = call(p["barMgr"], :get, path(p["bartender1"]))
    assert json_response(conn, 200) == %{"data" => %{"code" => "4821"}}

    # The users list carries only the flag, never the code.
    body = call(p["barMgr"], :get, "/api/users") |> json_response(200)
    row = Enum.find(body["data"], &(&1["id"] == p["bartender1"].id))
    assert row["has_staff_code"] == true
    refute inspect(body) =~ "4821"
  end

  test "S2: a code in use is refused; suggest offers a free one", %{p: p} do
    {:ok, _} = StaffCodes.set(p["bartender1"], "4821", p["barMgr"])

    conn = call(p["barMgr"], :put, path(p["bartender2"]), %{"code" => "4821"})
    assert %{"errors" => %{"code" => ["That code is already in use"]}} = json_response(conn, 422)

    %{"data" => %{"code" => code}} =
      call(p["barMgr"], :get, "/api/staff_codes/suggest") |> json_response(200)

    assert code =~ ~r/^\d{4}$/
    assert call(p["barMgr"], :put, path(p["bartender2"]), %{"code" => code}).status == 200
  end

  test "S3: someone outside the Taproom can't get a code", %{p: p} do
    conn = call(p["barMgr"], :put, path(p["brewer1"]), %{"code" => "4821"})

    assert %{"errors" => %{"code" => ["Only active Taproom staff can have a staff code"]}} =
             json_response(conn, 422)
  end

  test "malformed codes are refused", %{p: p} do
    for bad <- ["12", "12345", "abcd", nil] do
      conn = call(p["barMgr"], :put, path(p["bartender1"]), %{"code" => bad})
      assert %{"errors" => %{"code" => [_]}} = json_response(conn, 422)
    end
  end

  test "S4: other managers and employees get 403 on every staff-code route", %{p: p} do
    {:ok, _} = StaffCodes.set(p["bartender1"], "4821", p["barMgr"])

    for actor <- [p["breweryMgr"], p["bartender2"]] do
      assert call(actor, :get, path(p["bartender1"])).status == 403
      assert call(actor, :put, path(p["bartender1"]), %{"code" => "1234"}).status == 403
      assert call(actor, :delete, path(p["bartender1"])).status == 403
      assert call(actor, :get, "/api/staff_codes/suggest").status == 403
    end
  end

  test "S16: an owner (no memberships) reveals and removes", %{p: p} do
    {:ok, _} = StaffCodes.set(p["bartender1"], "4821", p["barMgr"])

    assert %{"data" => %{"code" => "4821"}} =
             call(p["owner"], :get, path(p["bartender1"])) |> json_response(200)

    assert %{"data" => %{"has_staff_code" => false}} =
             call(p["owner"], :delete, path(p["bartender1"])) |> json_response(200)

    assert %{"data" => %{"code" => nil}} =
             call(p["owner"], :get, path(p["bartender1"])) |> json_response(200)
  end

  test "/api/me staff_codes: owners and Taproom managers only", %{p: p} do
    flag = fn key -> (call(p[key], :get, "/api/me") |> json_response(200))["staff_codes"] end

    assert flag.("owner") == true
    assert flag.("barMgr") == true
    assert flag.("breweryMgr") == false
    assert flag.("bartender1") == false
  end

  test "unknown user → 404", %{p: p} do
    assert call(p["barMgr"], :get, "/api/users/999999/staff_code").status == 404
  end
end
