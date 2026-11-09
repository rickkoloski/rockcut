defmodule RockcutApiWeb.ParserCorsTest do
  @moduledoc """
  D55 §2.3 (task 4985): answers from the body parsers (malformed JSON 400,
  oversize body 413) carry the same CORS headers as every other answer, so the
  browser shows the error instead of "Failed to fetch". Origins allowed are
  unchanged. Lead decisions 5 (T7): the answer is the JSON error in every env,
  dev's `debug_errors` included (`Plug.Debugger`, below).
  """
  use RockcutApiWeb.ConnCase, async: true

  @allowed "http://localhost:5174"
  @other "https://evil.example"

  defp send_body(conn, origin, body) do
    conn
    |> put_req_header("origin", origin)
    |> put_req_header("content-type", "application/json")
    |> post("/api/session", body)
  end

  defp acao(conn), do: get_resp_header(conn, "access-control-allow-origin")

  test "malformed JSON from an allowed origin: 400 JSON with CORS headers", %{conn: conn} do
    conn = send_body(conn, @allowed, "{not json")
    assert json_response(conn, 400) == %{"errors" => %{"detail" => "Bad Request"}}
    assert acao(conn) == [@allowed]
  end

  test "oversize body from an allowed origin: 413 JSON with CORS headers", %{conn: conn} do
    body = ~s({"x":") <> String.duplicate("a", 8_100_000) <> ~s("})
    conn = send_body(conn, @allowed, body)
    assert json_response(conn, 413) == %{"errors" => %{"detail" => "Request Entity Too Large"}}
    assert acao(conn) == [@allowed]
  end

  test "a disallowed origin still gets no allow-origin header", %{conn: conn} do
    conn = send_body(conn, @other, "{not json")
    assert conn.status == 400
    assert acao(conn) == []
  end

  # What `debug_errors: true` (config/dev.exs) puts around the endpoint: a
  # raise from the parsers would be its HTML page. The test env has no
  # debugger, so this pipeline stands in for dev, with the endpoint's own
  # CORSPlug and parsers options.
  defmodule DevLike do
    use Plug.Builder
    use Plug.Debugger, otp_app: :rockcut_api

    plug CORSPlug, origin: &RockcutApiWeb.Endpoint.cors_origins/0, credentials: true

    plug RockcutApiWeb.Parsers,
      parsers: [:urlencoded, :multipart, :json],
      pass: ["*/*"],
      json_decoder: Phoenix.json_library()

    plug :reached

    def reached(conn, _), do: conn |> send_resp(200, "reached") |> halt()
  end

  test "with dev's debugger in front: still the 400 JSON with CORS, not the HTML page" do
    conn =
      Plug.Test.conn(:post, "/api/session", "{not json")
      |> put_req_header("origin", @allowed)
      |> put_req_header("content-type", "application/json")
      |> put_req_header("accept", "text/html")
      |> DevLike.call([])

    assert conn.status == 400
    assert [ct | _] = get_resp_header(conn, "content-type")
    assert ct =~ "application/json"
    assert Jason.decode!(conn.resp_body) == %{"errors" => %{"detail" => "Bad Request"}}
    assert acao(conn) == [@allowed]
  end
end
