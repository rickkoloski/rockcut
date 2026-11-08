defmodule RockcutApiWeb.ParserCorsTest do
  @moduledoc """
  D55 §2.3 (task 4985): answers from `Plug.Parsers` (malformed JSON 400, oversize
  body 413) carry the same CORS headers as every other answer, so the browser shows
  the error instead of "Failed to fetch". Origins allowed are unchanged.
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

  defp acao({_status, headers, _body}),
    do: for({"access-control-allow-origin", v} <- headers, do: v)

  test "malformed JSON from an allowed origin: 400 with CORS headers", %{conn: conn} do
    sent = assert_error_sent 400, fn -> send_body(conn, @allowed, "{not json") end
    assert acao(sent) == [@allowed]
  end

  test "oversize body from an allowed origin: 413 with CORS headers", %{conn: conn} do
    body = ~s({"x":") <> String.duplicate("a", 8_100_000) <> ~s("})
    sent = assert_error_sent 413, fn -> send_body(conn, @allowed, body) end
    assert acao(sent) == [@allowed]
  end

  test "a disallowed origin still gets no allow-origin header", %{conn: conn} do
    sent = assert_error_sent 400, fn -> send_body(conn, @other, "{not json") end
    assert acao(sent) == []
  end
end
