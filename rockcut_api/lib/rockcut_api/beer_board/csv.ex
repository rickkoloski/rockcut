defmodule RockcutApi.BeerBoard.Csv do
  @moduledoc """
  D37 §3.6: the Buy-a-Beer Board's CSV files.

  - `parse/1` reads an import file into validated rows, or row-numbered
    errors. Row numbers are spreadsheet rows: the header is row 1. Columns
    it doesn't know are ignored and listed.
  - `entries_csv/1` and `events_csv/1` write the board and the change log.

  Spreadsheet-formula safety: a written value that starts with `= + - @`, a
  tab or a carriage return gets a leading `'`; `parse/1` strips one such `'`.
  """
  alias NimbleCSV.RFC4180, as: CSV
  alias RockcutApi.BeerBoard.Entry
  alias RockcutApi.Scheduling.Recurrence

  @max_bytes 1_048_576
  @max_rows 1_000
  @formula_starts ["=", "+", "-", "@", "\t", "\r"]

  # Normalized header → field. `Date added` is an alias of `Moved off board`;
  # `Imported` is accepted and ignored (an export writes it for reference).
  @headers %{
    "for" => :recipient_name,
    "bought by" => :purchaser_name,
    "beers" => :beers,
    "moved off board" => :moved_off_board_at,
    "date added" => :moved_off_board_at,
    "imported" => :ignore
  }

  @required [{:recipient_name, "For"}, {:purchaser_name, "Bought by"}, {:beers, "Beers"}]

  def max_bytes, do: @max_bytes
  def max_rows, do: @max_rows

  ## Parse

  @doc """
  Parse an import file. Returns `{:ok, rows, ignored_columns}` or
  `{:error, errors}`, where a row is
  `%{row:, recipient_name:, purchaser_name:, beers:, moved_off_board_at:}`
  (`moved_off_board_at` a `DateTime` or nil), `ignored_columns` are the
  headers of columns the import doesn't use (e.g. `["Notes"]`), and an error
  is `%{row: n | nil, message: text}`.
  """
  def parse(binary) when is_binary(binary) do
    with :ok <- check_size(binary),
         {:ok, text} <- decode(binary),
         {:ok, [header | lines]} <- split(text),
         {:ok, columns, ignored} <- map_header(header),
         {:ok, rows} <-
           lines
           |> Enum.with_index(2)
           |> Enum.reject(fn {cells, _} -> Enum.all?(cells, &(String.trim(&1) == "")) end)
           |> check_rows(columns) do
      {:ok, rows, ignored}
    end
  end

  defp check_size(binary) when byte_size(binary) > @max_bytes,
    do: {:error, [%{row: nil, message: "The file is larger than 1 MB"}]}

  defp check_size(_), do: :ok

  defp decode(binary) do
    text = String.replace_prefix(binary, "﻿", "")

    if String.valid?(text),
      do: {:ok, text},
      else: {:error, [%{row: nil, message: "The file isn't UTF-8 text. Save it as CSV UTF-8."}]}
  end

  defp split(text) do
    case CSV.parse_string(text, skip_headers: false) do
      [] -> {:error, [%{row: nil, message: "The file is empty"}]}
      lines -> {:ok, lines}
    end
  rescue
    e in NimbleCSV.ParseError ->
      {:error, [%{row: nil, message: "The file isn't valid CSV: #{Exception.message(e)}"}]}
  end

  # Column index → field, plus the headers of the columns it doesn't know
  # (ignored: hand-kept sheets often have a Notes column). Blank header cells
  # (a spreadsheet's trailing empty columns) are skipped.
  defp map_header(header) do
    named =
      header
      |> Enum.with_index()
      |> Enum.map(fn {name, i} -> {unguard(name) |> String.trim(), i} end)
      |> Enum.reject(fn {name, _} -> name == "" end)

    ignored =
      for {name, _} <- named, not Map.has_key?(@headers, normalize_header(name)), do: name

    fields =
      for {name, i} <- named,
          Map.has_key?(@headers, normalize_header(name)),
          do: {@headers[normalize_header(name)], i, name}

    repeated =
      fields
      |> Enum.reject(fn {field, _, _} -> field == :ignore end)
      |> Enum.group_by(fn {field, _, _} -> field end)
      |> Enum.filter(fn {_, list} -> length(list) > 1 end)
      |> Enum.map(fn {_, list} ->
        names = list |> Enum.map(fn {_, _, n} -> ~s("#{n}") end) |> Enum.join(" and ")
        %{row: 1, message: "Columns #{names} are the same column"}
      end)

    missing =
      for {field, label} <- @required, not Enum.any?(fields, &(elem(&1, 0) == field)) do
        %{row: 1, message: ~s(Missing column "#{label}")}
      end

    case repeated ++ missing do
      [] ->
        columns = for {field, i, _} <- fields, field != :ignore, into: %{}, do: {field, i}
        {:ok, columns, ignored}

      errors ->
        {:error, errors}
    end
  end

  defp normalize_header(name), do: name |> String.replace(~r/\s+/u, " ") |> String.downcase()

  defp check_rows(lines, _columns) when length(lines) > @max_rows,
    do:
      {:error,
       [%{row: nil, message: "The file has #{length(lines)} rows; the limit is #{@max_rows}"}]}

  defp check_rows(lines, columns) do
    {rows, errors} =
      Enum.reduce(lines, {[], []}, fn {cells, n}, {rows, errors} ->
        raw = for {field, i} <- columns, into: %{}, do: {field, unguard(Enum.at(cells, i) || "")}

        case validate_row(Map.put(raw, :row, n)) do
          {:ok, row} -> {[row | rows], errors}
          {:error, row_errors} -> {rows, errors ++ row_errors}
        end
      end)

    cond do
      errors != [] -> {:error, errors}
      rows == [] -> {:error, [%{row: nil, message: "The file has no rows to import"}]}
      true -> {:ok, Enum.reverse(rows)}
    end
  end

  @doc """
  Validate one row (from a file, or sent back by the client at confirm).
  Accepts atom or string keys; `beers` may be an integer or text, and
  `moved_off_board_at` a `DateTime`, an ISO 8601 date-time, `YYYY-MM-DD` or
  `M/D/YYYY` (midnight in Colorado), blank or nil.
  """
  def validate_row(raw) do
    get = fn key -> Map.get(raw, key, Map.get(raw, Atom.to_string(key))) end
    n = get.(:row)

    {recipient, e1} = name(get.(:recipient_name), "For", n)
    {purchaser, e2} = name(get.(:purchaser_name), "Bought by", n)
    {beers, e3} = beers(get.(:beers), n)
    {date, e4} = date(get.(:moved_off_board_at), n)

    case e1 ++ e2 ++ e3 ++ e4 do
      [] ->
        {:ok,
         %{
           row: n,
           recipient_name: recipient,
           purchaser_name: purchaser,
           beers: beers,
           moved_off_board_at: date
         }}

      errors ->
        {:error, errors}
    end
  end

  defp name(value, label, n) do
    value = if is_binary(value), do: value |> String.trim() |> String.replace(~r/\s+/u, " ")

    cond do
      value in [nil, ""] ->
        {nil, [%{row: n, message: "#{label} is blank"}]}

      String.length(value) > Entry.max_name() ->
        {nil, [%{row: n, message: "#{label} is longer than #{Entry.max_name()} characters"}]}

      true ->
        {value, []}
    end
  end

  defp beers(value, _n) when is_integer(value) and value >= 1 and value <= 99, do: {value, []}

  defp beers(value, n) when is_binary(value) do
    case Integer.parse(String.trim(value)) do
      {i, ""} -> beers(i, n)
      _ -> beers(:bad, n)
    end
  end

  defp beers(_, n), do: {nil, [%{row: n, message: "Beers must be a whole number from 1 to 99"}]}

  defp date(%DateTime{} = dt, _n), do: {DateTime.truncate(dt, :second), []}
  defp date(nil, _n), do: {nil, []}

  defp date(value, n) when is_binary(value) do
    value = String.trim(value)

    cond do
      value == "" ->
        {nil, []}

      match?({:ok, _, _}, DateTime.from_iso8601(value)) ->
        {:ok, dt, _} = DateTime.from_iso8601(value)
        {DateTime.truncate(dt, :second), []}

      match?({:ok, _}, Date.from_iso8601(value)) ->
        {Recurrence.local_to_utc(Date.from_iso8601!(value), ~T[00:00:00]), []}

      match?({:ok, _}, us_date(value)) ->
        {:ok, d} = us_date(value)
        {Recurrence.local_to_utc(d, ~T[00:00:00]), []}

      true ->
        {nil,
         [
           %{
             row: n,
             message: ~s(Moved off board "#{value}" isn't a date; use YYYY-MM-DD or M/D/YYYY)
           }
         ]}
    end
  end

  defp date(_, n),
    do: {nil, [%{row: n, message: "Moved off board isn't a date; use YYYY-MM-DD or M/D/YYYY"}]}

  # US order, as Excel re-saves a date: 9/1/2026 or 09/01/2026 (decision 1).
  defp us_date(value) do
    case Regex.run(~r"^(\d{1,2})/(\d{1,2})/(\d{4})$", value, capture: :all_but_first) do
      [m, d, y] -> Date.new(String.to_integer(y), String.to_integer(m), String.to_integer(d))
      nil -> :error
    end
  end

  @doc "Strip one leading `'` the formula guard added."
  def unguard("'" <> rest = value) do
    if String.starts_with?(rest, @formula_starts), do: rest, else: value
  end

  def unguard(value), do: value

  ## Write

  @doc "The open entries: For, Bought by, Beers, Moved off board, Imported."
  def entries_csv(entries) do
    rows =
      for e <- entries do
        [
          e.recipient_name,
          e.purchaser_name,
          e.beers_remaining,
          e.moved_off_board_at,
          e.imported_at
        ]
      end

    write(["For", "Bought by", "Beers", "Moved off board", "Imported"], rows)
  end

  @doc "The change log (events with `actor` preloaded), as given."
  def events_csv(events) do
    rows =
      for ev <- events do
        [
          ev.inserted_at,
          ev.actor && ev.actor.name,
          if(ev.device_id, do: "yes", else: "no"),
          ev.action,
          Map.get(ev.detail || %{}, "source"),
          ev.recipient_name,
          ev.purchaser_name,
          ev.beers_before,
          ev.beers_after
        ]
      end

    write(
      ["When", "Who", "Shared device", "Action", "Source", "For", "Bought by", "Before", "After"],
      rows
    )
  end

  defp write(header, rows) do
    [header | Enum.map(rows, fn row -> Enum.map(row, &cell/1) end)]
    |> CSV.dump_to_iodata()
    |> IO.iodata_to_binary()
  end

  defp cell(nil), do: ""
  defp cell(%DateTime{} = dt), do: DateTime.to_iso8601(dt)
  defp cell(n) when is_integer(n), do: Integer.to_string(n)
  defp cell(s) when is_binary(s), do: guard(s)

  @doc "Prefix `'` to a value a spreadsheet would run as a formula."
  def guard(s) when is_binary(s) do
    if String.starts_with?(s, @formula_starts), do: "'" <> s, else: s
  end
end
