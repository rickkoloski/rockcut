defmodule RockcutApiWeb.Plugs.PathIds do
  @moduledoc """
  D55 §2.11: every URL param that names a row (`id`, or ending in `_id`)
  must be a usable id (`RockcutApi.Ids.parse/1`), else 404 before any
  controller runs. A number past SQLite's range used to reach the driver
  and answer 500.

  Keys that aren't row ids (`:dept`, `:board`, `:key`, `:token`, `:on_date`,
  the vessel `:index`) are left alone. No `*_id` param is an exception today;
  one that is legitimately not a number goes in `@not_ids`, with why.

  At the end of the signed-in pipelines (after AuthPlug, PasswordResetGate
  and DeviceGate), so 401 and a tablet's 403 come first. D53's own `Ids`
  checks in the Boards and task boards stay as a second line.
  """
  import Plug.Conn

  # URL params named like ids that aren't (none today), each with why.
  @not_ids MapSet.new([])

  def init(opts), do: opts

  def call(%Plug.Conn{path_params: params} = conn, _opts) do
    if Enum.all?(params, &usable?/1) do
      conn
    else
      conn
      |> put_resp_content_type("application/json")
      |> send_resp(404, Jason.encode!(%{errors: %{detail: "Not found"}}))
      |> halt()
    end
  end

  defp usable?({name, value}),
    do: not id_param?(name) or RockcutApi.Ids.parse(value) != nil

  @doc false
  def id_param?(name),
    do: not MapSet.member?(@not_ids, name) and (name == "id" or String.ends_with?(name, "_id"))
end
