defmodule RockcutApiWeb.BeerBoardAdminControllerTest do
  @moduledoc "D37 §3.6: CSV export and import routes (S11, S20–S27)."
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import Phoenix.ConnTest

  alias RockcutApi.{BeerBoard, StaffCodes}
  alias RockcutApi.StaffCodes.RateLimiter

  @fixtures Path.expand("../../fixtures/beer_board", __DIR__)

  setup do
    RateLimiter.reset()
    p = personas(~w(owner barMgr breweryMgr bartender1))
    {:ok, _} = StaffCodes.set(p["barMgr"], "1357", p["barMgr"])
    {_device, token} = taproom_device()
    %{p: p, token: token}
  end

  defp upload(name),
    do: %Plug.Upload{path: Path.join(@fixtures, name), filename: name, content_type: "text/csv"}

  defp add(p, recipient, purchaser, beers) do
    {:ok, e} =
      BeerBoard.create(
        %{"recipient_name" => recipient, "purchaser_name" => purchaser, "beers" => beers},
        p["bartender1"],
        nil
      )

    e
  end

  defp preview(p, name, mode \\ "add"),
    do:
      call(p["barMgr"], :post, "/api/beer_board/import/preview", %{file: upload(name), mode: mode})
      |> json_response(200)
      |> Map.fetch!("data")

  defp confirm(p, preview, resolutions) do
    call(p["barMgr"], :post, "/api/beer_board/import", %{
      mode: preview["mode"],
      rows: preview["rows"],
      resolutions: resolutions,
      signature: preview["signature"],
      file_name: preview["file_name"]
    })
  end

  test "S20: Export CSV downloads the open entries", %{p: p} do
    add(p, "Smith, Pat", "Chris", 2)
    add(p, "Ana", "Bo", 1)
    conn = call(p["barMgr"], :get, "/api/beer_board/export.csv")

    assert conn.status == 200
    assert get_resp_header(conn, "content-type") == ["text/csv; charset=utf-8"]
    assert [disposition] = get_resp_header(conn, "content-disposition")
    assert disposition =~ ~r/attachment; filename="buy-a-beer-board-\d{4}-\d{2}-\d{2}\.csv"/

    assert [header, ana, pat, ""] = String.split(conn.resp_body, "\r\n")
    assert header == "For,Bought by,Beers,Moved off board,Imported"
    assert ana =~ ~r/^Ana,Bo,1,\d{4}-/
    assert pat =~ ~r/^"Smith, Pat",Chris,2,/
  end

  test "History export: the change log", %{p: p} do
    add(p, "Pat", "Chris", 2)
    conn = call(p["owner"], :get, "/api/beer_board/history/export.csv")
    assert conn.status == 200
    assert [_header, row, ""] = String.split(conn.resp_body, "\r\n")
    assert row =~ ~r/,Sam Pour,no,created,,Pat,Chris,0,2$/
  end

  test "S21/S22: preview groups, then confirm applies the choices", %{p: p} do
    add(p, "Pat", "Chris", 2)
    data = preview(p, "duplicates.csv")

    assert data["errors"] == []
    assert data["file_name"] == "duplicates.csv"
    assert [%{"recipient_name" => "Ana", "row" => 5}] = data["new"]
    assert [pat, sam] = data["groups"]
    assert %{"key" => "pat", "combined_purchaser" => "Chris & Lee", "combinable" => true} = pat
    assert Enum.map(pat["items"], & &1["source"]) == ~w(board file)
    assert length(sam["items"]) == 2
    # The preview changes nothing.
    assert length(BeerBoard.list_entries()) == 1

    assert %{"data" => %{"imported" => 3, "combined" => 1}} =
             confirm(p, data, %{
               "pat" => %{"choice" => "combine", "purchaser_name" => "Chris & Lee"},
               "sam" => %{"choice" => "allow"}
             })
             |> json_response(200)

    assert length(BeerBoard.list_entries()) == 4

    assert %{"data" => [%{"source" => "import"} | _]} =
             call(p["barMgr"], :get, "/api/beer_board/history") |> json_response(200)
  end

  test "S26: row errors come back by row; nothing can be imported", %{p: p} do
    data = preview(p, "errors.csv")
    assert [%{"row" => 3, "message" => "For is blank"} | _] = data["errors"]
    assert data["rows"] == [] and data["signature"] == nil
  end

  test "Excel, quoted and formula fixtures preview cleanly", %{p: p} do
    for name <- ~w(excel.csv quoted.csv formula.csv clean.csv) do
      assert preview(p, name)["errors"] == [], name
    end
  end

  test "S25: Replace preview carries the board summary", %{p: p} do
    add(p, "Pat", "Chris", 2)
    add(p, "Kim", "Lee", 3)
    assert %{"board" => %{"count" => 2, "beers" => 5}} = preview(p, "clean.csv", "replace")
  end

  test "S27: a board change between preview and confirm → 409", %{p: p} do
    data = preview(p, "duplicates.csv")
    add(p, "Pat", "Chris", 2)

    assert %{"error" => "stale", "message" => "The board changed since your preview"} =
             confirm(p, data, %{"sam" => %{"choice" => "allow"}}) |> json_response(409)

    assert length(BeerBoard.list_entries()) == 1
  end

  test "an unresolved group → 422", %{p: p} do
    data = preview(p, "duplicates.csv")

    assert %{"error" => "invalid", "errors" => [%{"group" => "sam"}]} =
             confirm(p, data, %{}) |> json_response(422)
  end

  test "a preview without a file or with a bad mode → 422", %{p: p} do
    assert call(p["barMgr"], :post, "/api/beer_board/import/preview", %{mode: "add"}).status ==
             422

    assert call(p["barMgr"], :post, "/api/beer_board/import/preview", %{
             file: upload("clean.csv"),
             mode: "merge"
           }).status == 422
  end

  describe "who may" do
    test "Taproom staff and other departments' managers get 403", %{p: p} do
      for who <- ~w(bartender1 breweryMgr) do
        assert call(p[who], :get, "/api/beer_board/export.csv").status == 403
        assert call(p[who], :get, "/api/beer_board/history/export.csv").status == 403

        assert call(p[who], :post, "/api/beer_board/import/preview", %{
                 file: upload("clean.csv"),
                 mode: "add"
               }).status == 403

        assert call(p[who], :post, "/api/beer_board/import", %{mode: "add", rows: []}).status ==
                 403
      end
    end

    test "S11: a manager's staff code on the tablet opens none of them", %{token: token} do
      for {verb, path, params} <- [
            {:get, "/api/beer_board/export.csv", %{}},
            {:get, "/api/beer_board/history/export.csv", %{}},
            {:post, "/api/beer_board/import/preview", %{file: upload("clean.csv"), mode: "add"}},
            {:post, "/api/beer_board/import", %{mode: "add", rows: []}}
          ] do
        conn = call_device(token, verb, path, Map.put(params, :staff_code, "1357"))
        assert json_response(conn, 403)["error"] == "Not available on a shared device", path
      end

      assert BeerBoard.list_entries() == []
    end
  end
end
