defmodule RockcutApiWeb.BeerBoardAdminController do
  @moduledoc """
  Buy-a-Beer Board management (D37 §3.4, §3.6): the change log, CSV export
  and CSV import. Owners and Taproom managers only, signed in as themselves
  (the `:authenticated` scope: a shared device never gets here, whatever
  staff code it holds).
  """
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [beer_board_event: 1]
  alias RockcutApi.{Authz, BeerBoard}
  alias RockcutApi.BeerBoard.{Csv, Import}
  alias RockcutApi.Scheduling.Recurrence

  def history(conn, params) do
    with :ok <- allow(conn, :history) do
      page =
        case Integer.parse(to_string(params["page"] || "1")) do
          {n, ""} when n >= 1 -> n
          _ -> 1
        end

      %{events: events, page: page, total: total} = BeerBoard.list_events(params["q"], page)

      json(conn, %{
        data: Enum.map(events, &beer_board_event/1),
        page: page,
        total: total,
        per_page: 50
      })
    end
  end

  @doc "GET /api/beer_board/export.csv: the open entries."
  def export_csv(conn, _params) do
    with :ok <- allow(conn, :export) do
      csv(conn, "buy-a-beer-board", Csv.entries_csv(BeerBoard.list_entries()))
    end
  end

  @doc "GET /api/beer_board/history/export.csv: the full change log."
  def history_csv(conn, _params) do
    with :ok <- allow(conn, :history) do
      csv(conn, "buy-a-beer-board-history", Csv.events_csv(BeerBoard.all_events()))
    end
  end

  @doc """
  POST /api/beer_board/import/preview: multipart `file` + `mode`. Validates
  and plans; changes nothing. Row errors come back in `errors` (200), and
  block the import. Columns the import doesn't use are listed in
  `ignored_columns`.
  """
  def import_preview(conn, params) do
    with :ok <- allow(conn, :import),
         {:ok, mode} <- mode(conn, params["mode"]),
         {:ok, upload} <- upload(conn, params["file"]) do
      base = %{mode: mode, file_name: upload.filename, board: board_summary()}

      case read_upload(upload) do
        {:ok, rows, ignored} ->
          plan = Import.plan(rows, BeerBoard.list_entries(), mode)

          json(conn, %{
            data:
              Map.merge(base, %{
                errors: [],
                ignored_columns: ignored,
                rows: Enum.map(rows, &row_json/1),
                new: Enum.map(plan.new, &row_json/1),
                groups: Enum.map(plan.groups, &group_json/1),
                board: plan.board,
                signature: plan.signature
              })
          })

        {:error, errors} ->
          json(conn, %{
            data:
              Map.merge(base, %{
                errors: errors,
                ignored_columns: [],
                rows: [],
                new: [],
                groups: [],
                signature: nil
              })
          })
      end
    end
  end

  @doc """
  POST /api/beer_board/import: `mode`, the previewed `rows`, `resolutions`
  (group key → choice), the preview's `signature`, and `file_name`.
  """
  def import(conn, params) do
    with :ok <- allow(conn, :import) do
      case Import.apply(
             params["mode"],
             params["rows"],
             params["resolutions"],
             params["signature"],
             conn.assigns.current_user,
             file_name: params["file_name"]
           ) do
        {:ok, counts} ->
          json(conn, %{data: counts})

        {:error, :stale} ->
          conn
          |> put_status(:conflict)
          |> json(%{error: "stale", message: "The board changed since your preview"})

        {:error, {:invalid, errors}} ->
          conn |> put_status(:unprocessable_entity) |> json(%{error: "invalid", errors: errors})
      end
    end
  end

  defp allow(conn, action) do
    if Authz.can?(conn.assigns.current_user, action, :beer_board) do
      :ok
    else
      conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
    end
  end

  defp mode(_conn, mode) when mode in ["add", "replace"], do: {:ok, mode}
  defp mode(_conn, nil), do: {:ok, "add"}

  defp mode(conn, _),
    do: conn |> put_status(:unprocessable_entity) |> json(%{error: "Choose Add or Replace"})

  defp upload(_conn, %Plug.Upload{} = upload), do: {:ok, upload}

  defp upload(conn, _),
    do: conn |> put_status(:unprocessable_entity) |> json(%{error: "Choose a CSV file"})

  defp read_upload(%Plug.Upload{path: path}) do
    max = Csv.max_bytes()

    case File.stat(path) do
      {:ok, %{size: size}} when size > max ->
        {:error, [%{row: nil, message: "The file is larger than 1 MB"}]}

      {:ok, _} ->
        Csv.parse(File.read!(path))

      {:error, _} ->
        {:error, [%{row: nil, message: "The file couldn't be read"}]}
    end
  end

  defp board_summary do
    entries = BeerBoard.list_entries()
    %{count: length(entries), beers: Enum.sum(Enum.map(entries, & &1.beers_remaining))}
  end

  defp csv(conn, name, body) do
    {today, _} = Recurrence.to_local(DateTime.utc_now())

    conn
    |> put_resp_content_type("text/csv")
    |> put_resp_header("content-disposition", ~s(attachment; filename="#{name}-#{today}.csv"))
    |> send_resp(200, body)
  end

  defp row_json(row),
    do: Map.take(row, ~w(row recipient_name purchaser_name beers moved_off_board_at)a)

  defp group_json(g) do
    g
    |> Map.take(~w(key name total combinable combined_purchaser)a)
    |> Map.put(
      :items,
      Enum.map(
        g.items,
        &Map.take(
          &1,
          ~w(id source row entry_id recipient_name purchaser_name beers moved_off_board_at imported_at)a
        )
      )
    )
  end
end
