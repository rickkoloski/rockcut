defmodule RockcutApi.BeerBoard.Import do
  @moduledoc """
  D37 §3.6: import a CSV into the Buy-a-Beer Board.

  Preview and confirm share one pure function, `plan/3`: it splits the file's
  rows into **new** rows and **duplicate groups** (a match on the normalized
  For name alone). `apply/6` re-plans inside its transaction and compares the
  plan's signature with the one the preview returned, so a board that changed
  in between is refused (409) rather than imported over.
  """
  alias RockcutApi.{Accounts, BeerBoard, Repo}
  alias RockcutApi.Accounts.User
  alias RockcutApi.BeerBoard.{Csv, Entry}

  @modes ~w(add replace)

  def modes, do: @modes

  @doc """
  Group the file's `rows` (from `Csv.parse/1` or `Csv.validate_row/1`) with
  the open `board` entries.

  - **add:** board entries and file rows that share a For name form a group;
  - **replace:** only file rows are grouped (the board is cleared first).

  A group needs at least one file row. Returns
  `%{new: rows, groups: groups, board: %{count:, beers:}, signature: hex}`.
  Group items are earliest first (moved-off date; a file row without one
  counts as the import time, so last).
  """
  def plan(rows, board, mode) when mode in @modes do
    file_items = Enum.map(rows, &file_item/1)
    board_items = if mode == "add", do: Enum.map(board, &board_item/1), else: []

    by_key =
      Enum.group_by(board_items ++ file_items, &BeerBoard.normalize_name(&1.recipient_name))

    {groups, new} =
      by_key
      |> Enum.sort_by(fn {key, _} -> key end)
      |> Enum.reduce({[], []}, fn {key, items}, {groups, new} ->
        files = Enum.filter(items, &(&1.source == "file"))

        cond do
          files == [] -> {groups, new}
          length(items) == 1 -> {groups, new ++ [hd(files).row_data]}
          true -> {groups ++ [group(key, items)], new}
        end
      end)

    new = Enum.sort_by(new, & &1.row)

    %{
      new: new,
      groups: groups,
      board: %{count: length(board), beers: Enum.sum(Enum.map(board, & &1.beers_remaining))},
      signature: signature(mode, new, groups, board)
    }
  end

  defp file_item(row) do
    %{
      id: "r:#{row.row}",
      source: "file",
      row: row.row,
      entry_id: nil,
      recipient_name: row.recipient_name,
      purchaser_name: row.purchaser_name,
      beers: row.beers,
      moved_off_board_at: row.moved_off_board_at,
      imported_at: nil,
      row_data: row
    }
  end

  defp board_item(%Entry{} = e) do
    %{
      id: "b:#{e.id}",
      source: "board",
      row: nil,
      entry_id: e.id,
      recipient_name: e.recipient_name,
      purchaser_name: e.purchaser_name,
      beers: e.beers_remaining,
      moved_off_board_at: e.moved_off_board_at,
      imported_at: e.imported_at
    }
  end

  defp group(key, items) do
    items = Enum.sort_by(items, &order/1)
    total = Enum.sum(Enum.map(items, & &1.beers))

    %{
      key: key,
      name: hd(items).recipient_name,
      items: Enum.map(items, &Map.delete(&1, :row_data)),
      total: total,
      combinable: total <= Entry.max_beers(),
      combined_purchaser: join_purchasers(items)
    }
  end

  # Earliest first; undated file rows (the import time) last; board before
  # file on a tie, then entry id / row number.
  defp order(item) do
    date =
      case item.moved_off_board_at do
        nil -> {1, 0}
        dt -> {0, DateTime.to_unix(dt)}
      end

    {date, if(item.source == "board", do: 0, else: 1), item.entry_id || item.row}
  end

  @doc "Q8: the group's purchasers, earliest first, repeats dropped: \"Chris & Lee\"."
  def join_purchasers(items) do
    items
    |> Enum.map(& &1.purchaser_name)
    |> Enum.uniq_by(&BeerBoard.normalize_name/1)
    |> Enum.join(" & ")
  end

  # What must still hold at confirm: the same groups (names, the board entries
  # in each with their counts, the file rows) and the same new rows; in
  # Replace mode, the whole board (ids + counts).
  defp signature(mode, new, groups, board) do
    term = %{
      mode: mode,
      new: Enum.map(new, & &1.row),
      groups: Enum.map(groups, fn g -> {g.key, Enum.map(g.items, &{&1.id, &1.beers})} end),
      board:
        if(mode == "replace",
          do: board |> Enum.map(&{&1.id, &1.beers_remaining}) |> Enum.sort(),
          else: nil
        )
    }

    :crypto.hash(:sha256, :erlang.term_to_binary(term)) |> Base.encode16(case: :lower)
  end

  @doc """
  Apply a previewed import in one transaction.

  - `rows`: the previewed rows, sent back by the client (re-validated here);
  - `resolutions`: group key → `%{"choice" => "allow" | "combine" | "pick",
    "purchaser_name" => text (combine), "keep" => [item ids] (pick)}`;
  - `signature`: the preview's.

  Returns `{:ok, counts}`, `{:error, :stale}` (the board changed since the
  preview), or `{:error, {:invalid, errors}}`.
  """
  def apply(mode, rows, resolutions, signature, %User{} = actor, opts \\ []) do
    with :ok <- check_mode(mode),
         {:ok, rows} <- validate_rows(rows) do
      resolutions = if is_map(resolutions), do: resolutions, else: %{}
      now = DateTime.utc_now() |> DateTime.truncate(:second)

      Repo.transaction(fn ->
        board = BeerBoard.list_entries()
        plan = plan(rows, board, mode)

        if plan.signature != signature, do: Repo.rollback(:stale)

        choices =
          case resolve(plan.groups, resolutions) do
            {:ok, choices} -> choices
            {:error, errors} -> Repo.rollback({:invalid, errors})
          end

        counts = %{imported: 0, combined: 0, deleted: 0, skipped: 0, removed: 0}
        ctx = %{actor: actor, now: now, board: Map.new(board, &{&1.id, &1})}

        counts =
          if mode == "replace" do
            for e <- board, do: delete!(e, ctx, %{})
            %{counts | removed: length(board)}
          else
            counts
          end

        counts =
          Enum.reduce(plan.new, counts, fn row, c -> create!(row, ctx) && bump(c, :imported) end)

        counts =
          Enum.reduce(choices, counts, fn {group, choice}, c ->
            apply_group(group, choice, ctx, c)
          end)

        Accounts.record_audit(actor.id, nil, "beer_board.import", %{
          "mode" => mode,
          "file_name" => opts[:file_name],
          "imported" => counts.imported,
          "combined" => counts.combined,
          "deleted" => counts.deleted,
          "skipped" => counts.skipped,
          "removed" => counts.removed
        })

        counts
      end)
    end
  end

  defp check_mode(mode) when mode in @modes, do: :ok
  defp check_mode(_), do: {:error, {:invalid, [%{row: nil, message: "Choose Add or Replace"}]}}

  defp validate_rows(rows) when is_list(rows) and rows != [] do
    {ok, errors} =
      Enum.reduce(rows, {[], []}, fn raw, {ok, errors} ->
        case if(is_map(raw),
               do: Csv.validate_row(raw),
               else: {:error, [%{row: nil, message: "Bad row"}]}
             ) do
          {:ok, row} -> {[row | ok], errors}
          {:error, e} -> {ok, errors ++ e}
        end
      end)

    numbers = Enum.map(ok, & &1.row)

    cond do
      errors != [] ->
        {:error, {:invalid, errors}}

      Enum.any?(numbers, &(not is_integer(&1))) or length(Enum.uniq(numbers)) != length(numbers) ->
        {:error, {:invalid, [%{row: nil, message: "Rows must have distinct row numbers"}]}}

      length(ok) > Csv.max_rows() ->
        {:error, {:invalid, [%{row: nil, message: "Too many rows"}]}}

      true ->
        {:ok, Enum.reverse(ok)}
    end
  end

  defp validate_rows(_),
    do: {:error, {:invalid, [%{row: nil, message: "There are no rows to import"}]}}

  # Every group needs a valid choice; no defaults (§3.6 step 3).
  defp resolve(groups, resolutions) do
    {choices, errors} =
      Enum.reduce(groups, {[], []}, fn g, {choices, errors} ->
        case check_choice(g, Map.get(resolutions, g.key)) do
          {:ok, choice} -> {choices ++ [{g, choice}], errors}
          {:error, message} -> {choices, errors ++ [%{row: nil, group: g.key, message: message}]}
        end
      end)

    if errors == [], do: {:ok, choices}, else: {:error, errors}
  end

  defp check_choice(_g, %{"choice" => "allow"}), do: {:ok, :allow}

  defp check_choice(g, %{"choice" => "combine"} = res) do
    purchaser =
      (res["purchaser_name"] || g.combined_purchaser)
      |> to_string()
      |> String.trim()
      |> String.replace(~r/\s+/u, " ")

    cond do
      not g.combinable ->
        {:error, "#{g.name}: can't combine, over #{Entry.max_beers()} beers"}

      purchaser == "" ->
        {:error, "#{g.name}: Bought by is blank"}

      String.length(purchaser) > Entry.max_name() ->
        {:error, "#{g.name}: Bought by is longer than #{Entry.max_name()} characters"}

      true ->
        {:ok, {:combine, purchaser}}
    end
  end

  defp check_choice(g, %{"choice" => "pick"} = res) do
    keep = List.wrap(res["keep"])
    ids = Enum.map(g.items, & &1.id)

    if Enum.all?(keep, &(&1 in ids)),
      do: {:ok, {:pick, MapSet.new(keep)}},
      else: {:error, "#{g.name}: Pick names an item that isn't in the group"}
  end

  defp check_choice(g, _), do: {:error, "#{g.name}: choose Allow, Combine or Pick"}

  defp apply_group(g, :allow, ctx, counts) do
    g.items
    |> Enum.filter(&(&1.source == "file"))
    |> Enum.reduce(counts, fn item, c -> create!(item, ctx) && bump(c, :imported) end)
  end

  defp apply_group(g, {:pick, keep}, ctx, counts) do
    Enum.reduce(g.items, counts, fn item, c ->
      case {item.source, MapSet.member?(keep, item.id)} do
        {"board", true} -> c
        {"board", false} -> delete!(ctx.board[item.entry_id], ctx, %{}) && bump(c, :deleted)
        {"file", true} -> create!(item, ctx) && bump(c, :imported)
        {"file", false} -> bump(c, :skipped)
      end
    end)
  end

  defp apply_group(g, {:combine, purchaser}, ctx, counts) do
    moved_off = g.items |> Enum.map(&(&1.moved_off_board_at || ctx.now)) |> Enum.min(DateTime)
    rows = for i <- g.items, i.source == "file", do: i.row
    counts = bump(counts, :combined)

    case Enum.filter(g.items, &(&1.source == "board")) do
      [] ->
        item = hd(g.items)

        create!(
          %{item | purchaser_name: purchaser, beers: g.total, moved_off_board_at: moved_off},
          ctx,
          %{"combined_rows" => rows}
        )

        bump(counts, :imported)

      [keep | others] ->
        entry = ctx.board[keep.entry_id]
        other_ids = Enum.map(others, & &1.entry_id)

        updated =
          entry
          |> Ecto.Changeset.change(
            beers_remaining: g.total,
            purchaser_name: purchaser,
            moved_off_board_at: moved_off
          )
          |> Repo.update!()

        BeerBoard.log!(updated, "edited", ctx.actor, nil, entry.beers_remaining, g.total, %{
          "source" => "import",
          "from" => names(entry),
          "to" => names(updated),
          "combined_from" => other_ids,
          "combined_rows" => rows
        })

        Enum.reduce(others, counts, fn o, c ->
          delete!(ctx.board[o.entry_id], ctx, %{"combined_into" => entry.id}) && bump(c, :deleted)
        end)
    end
  end

  defp create!(item, ctx, detail \\ %{}) do
    entry =
      Repo.insert!(%Entry{
        recipient_name: item.recipient_name,
        purchaser_name: item.purchaser_name,
        beers_remaining: item.beers,
        moved_off_board_at: item.moved_off_board_at || ctx.now,
        imported_at: ctx.now,
        created_by_id: ctx.actor.id
      })

    BeerBoard.log!(
      entry,
      "created",
      ctx.actor,
      nil,
      0,
      entry.beers_remaining,
      Map.put(detail, "source", "import")
    )
  end

  defp delete!(%Entry{} = entry, ctx, detail) do
    BeerBoard.log!(
      entry,
      "deleted",
      ctx.actor,
      nil,
      entry.beers_remaining,
      0,
      Map.put(detail, "source", "import")
    )

    Repo.delete!(entry)
  end

  defp names(e), do: %{"recipient_name" => e.recipient_name, "purchaser_name" => e.purchaser_name}

  defp bump(counts, key), do: Map.update!(counts, key, &(&1 + 1))
end
