defmodule RockcutApiWeb.Parsers do
  @moduledoc """
  D55 §2.3 (task 4985): `Plug.Parsers`, but its errors (malformed JSON 400,
  oversize body 413, …) keep the response headers already set, CORS among them.

  Phoenix renders an endpoint error from the conn the endpoint was called with
  unless the error comes wrapped with a later conn, so a bare `Plug.Parsers`
  after `CORSPlug` would still answer without CORS headers.
  """
  @behaviour Plug

  @impl true
  def init(opts), do: Plug.Parsers.init(opts)

  @impl true
  def call(conn, opts) do
    Plug.Parsers.call(conn, opts)
  rescue
    e -> Plug.Conn.WrapperError.reraise(conn, :error, e, __STACKTRACE__)
  end
end
