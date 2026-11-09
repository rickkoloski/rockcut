defmodule RockcutApiWeb.Parsers do
  @moduledoc """
  D55 §2.3 (task 4985): `Plug.Parsers`, but its own errors (malformed JSON
  400, oversize body 413, …) are answered here, as JSON, with the response
  headers already set (CORS among them), so the browser shows the error
  instead of "Failed to fetch".

  Answered, not raised: Phoenix renders an endpoint error from the conn the
  endpoint was called with (no CORS headers), and in dev `debug_errors`
  (`Plug.Debugger`) catches any raise first and answers its HTML page (D55
  lead decisions 5, T7). The body is what `ErrorJSON` renders for the status
  everywhere else (`{"errors": {"detail": "Bad Request"}}`), in every env.
  """
  @behaviour Plug

  import Plug.Conn

  @impl true
  def init(opts), do: Plug.Parsers.init(opts)

  @impl true
  def call(conn, opts) do
    Plug.Parsers.call(conn, opts)
  rescue
    # The parser's own errors only; anything else is raised as it was.
    e in [
      Plug.Parsers.ParseError,
      Plug.Parsers.RequestTooLargeError,
      Plug.Parsers.UnsupportedMediaTypeError,
      Plug.Parsers.BadEncodingError,
      Plug.BadRequestError,
      Plug.TimeoutError
    ] ->
      status = Plug.Exception.status(e)
      body = RockcutApiWeb.ErrorJSON.render("#{status}.json", %{})

      conn
      |> put_resp_content_type("application/json")
      |> send_resp(status, Jason.encode!(body))
      |> halt()
  end
end
