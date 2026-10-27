defmodule RockcutApi.Production.Undo do
  @moduledoc """
  D47 plan decision 5: server-side Undo for every schedule write.

  `track/4` runs a write inside a transaction and records, for each row it
  changed, the row as it was (`before`, nil for a row it inserted) and a
  hash of the row as it left it (`after`, nil for a row it deleted). Rows
  are read whole and raw from the tracked tables, within a **scope**: the
  batches (with their vessels, steps and links, and their split parts:
  D48), standalone steps, out-of-service periods, sign-offs and clean /
  dirty marks the write may touch. Batches a write inserts or deletes are
  put back or removed like any other row.

  `undo/2` puts every row back in one transaction, if each still matches
  its after-hash (`:undo_stale` otherwise: "Something changed since. Nothing
  was undone."; `updated_at` doesn't count). What it marks done or not done
  follows the order rules first, with the rule's own refusal (D49 BB2). Tokens last 2 minutes (`:undo_expired`), belong to the
  person who made the change (anyone else gets `:not_found`) and are pruned
  on every write.

  **Vessels** (D48 DEV QA R1): a write that changed a batch's vessels also
  records that batch's whole vessel list as it left it, and on a split (or
  one it undid) every vessel list in the tree (fix cycle 4, X1). Its Undo is
  stale when any of them changed since, not only the rows it changed, and
  what it puts back must pass `BatchChanges.no_tree_twice!/3` (`:same_tank`).
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.Repo
  alias RockcutApi.Accounts.User
  alias RockcutApi.Brewing.Batch
  alias RockcutApi.Production.{BatchChanges, Steps, UndoRecord}

  @ttl_seconds 120

  # Parents before children (inserts and updates); deletes go the other way.
  @order ~w(batches batch_vessels production_steps production_step_links tank_outages flag_signoffs tank_condition_marks)

  @doc """
  Run `fun` (returning `{:ok, result}` or an error) as `user`, tracking the
  rows in `scope` (`%{batches: ids, steps: ids, outages: ids, signoffs:
  keys, marks: ids}`) plus `after_scope.(result)` (rows the write created).
  `{:ok, {result, token}}` (token nil when nothing changed), or `fun`'s error.
  """
  def track(%User{} = user, scope, fun, after_scope \\ fn _ -> %{} end) do
    Repo.transaction(fn ->
      prune()
      before = rows(scope)

      case fun.() do
        {:ok, result} ->
          after_ = rows(merge(scope, after_scope.(result)))
          entries = entries(before, after_)

          {result,
           if(entries == [], do: nil, else: save!(user, entries, vessels(entries, after_)))}

        other ->
          Repo.rollback({__MODULE__, other})
      end
    end)
    |> case do
      {:error, {__MODULE__, other}} -> other
      result -> result
    end
  end

  @doc """
  Undo `token` for `user`: `{:ok, %{batch_ids}}` (the batches it touched),
  or `{:error, :not_found | :undo_expired | :undo_stale}`.
  """
  def undo(%User{id: user_id}, token, now \\ DateTime.utc_now()) do
    case is_binary(token) && Repo.get_by(UndoRecord, token: token) do
      %UndoRecord{user_id: ^user_id} = record ->
        if DateTime.compare(record.expires_at, now) == :lt,
          do: {:error, :undo_expired},
          else: restore(record)

      _ ->
        {:error, :not_found}
    end
  end

  defp restore(record) do
    entries = record.entries["rows"]
    vessels = Map.get(record.entries, "vessels", %{})

    Repo.transaction(fn ->
      # D49 BB2: the order rules come first, so a refusal says what to clear
      # and the same Undo works once it's cleared; the stale check follows.
      stale? =
        Enum.any?(entries, &(hash(row(&1["table"], &1["id"])) != &1["after"])) or
          Enum.any?(vessels, fn {id, h} -> vessels_hash(String.to_integer(id)) != h end)

      try do
        put_back!(entries)
      rescue
        # Putting rows back over changed ones can fail on a key; that's stale.
        e in Exqlite.Error ->
          if stale?, do: Repo.rollback(:undo_stale), else: reraise(e, __STACKTRACE__)
      end

      if stale?, do: Repo.rollback(:undo_stale)

      # What it puts back follows the N1 rule, over a split's whole tree, as
      # any other change does (fix cycle 4).
      roots =
        for id <- touched(entries, vessels),
            batch = Repo.get(Batch, id),
            uniq: true,
            do: batch.split_parent_id || batch.id

      for id <- roots, do: BatchChanges.no_tree_twice!(%Batch{id: id})

      Repo.delete!(record)

      %{
        batch_ids:
          entries
          |> Enum.flat_map(fn e ->
            row = e["before"] || %{}

            cond do
              e["table"] == "batches" -> [e["id"]]
              is_integer(row["batch_id"]) -> [row["batch_id"]]
              true -> []
            end
          end)
          |> Enum.uniq()
      }
    end)
  end

  # Put every row back, then check the order rules on the result.
  defp put_back!(entries) do
    {gone, back} = Enum.split_with(entries, &is_nil(&1["before"]))

    # Children before parents, and within a table the later rows first (a
    # split's parts before their parent); put back the other way (D48 QA M2).
    for e <- Enum.sort_by(gone, &{-rank(&1["table"]), -&1["id"]}),
        do: Repo.query!("DELETE FROM #{e["table"]} WHERE id = ?", [e["id"]])

    # A step whose done state the write didn't change keeps how it is now
    # (D49 BB2: a late Split's carried dates). Only what the write marked
    # done or not done flips, against how it is now (a step it puts back
    # counts as not done now); if anything else changed, it's stale.
    {back, flips} =
      back
      |> Enum.map(fn e ->
        now = if e["table"] == "production_steps", do: row(e["table"], e["id"])

        cond do
          now == nil -> {e, []}
          done?(e["before"]) == Map.get(e, "done", done?(now)) -> {keep_done(e, now), []}
          done?(now) != done?(e["before"]) -> {e, [{e["id"], done?(e["before"])}]}
          true -> {e, []}
        end
      end)
      |> Enum.unzip()

    flips = List.flatten(flips)

    for e <- Enum.sort_by(back, &{rank(&1["table"]), &1["id"]}),
        do: put_row!(e["table"], e["before"])

    # D48 DEV QA AA1: and those follow the order rules a check-off or an
    # un-check does (brew day, then the Split, then a part's exits).
    Steps.order_after_undo!(
      for({id, true} <- flips, do: id),
      for({id, false} <- flips, do: id)
    )
  end

  ## Rows

  defp rows(scope) do
    # D48: a batch's split parts always come with it (a split inserts them,
    # Undo split deletes them, the Split's check-off changes them), and a
    # part brings its parent and the other parts (its Undo's stale check and
    # tree rule cover the whole split; fix cycle 4).
    batch_ids = with_parts(Map.get(scope, :batches, []))
    step_ids = Map.get(scope, :steps, [])

    batch_steps =
      if batch_ids == [],
        do: [],
        else: select("production_steps", "batch_id", batch_ids)

    steps = batch_steps ++ select("production_steps", "id", step_ids)
    all_step_ids = Enum.map(steps, & &1["id"])

    [
      {"batches", select("batches", "id", batch_ids)},
      {"batch_vessels", select("batch_vessels", "batch_id", batch_ids)},
      {"production_steps", steps},
      {"production_step_links",
       select("production_step_links", "from_step_id", all_step_ids) ++
         select("production_step_links", "to_step_id", all_step_ids)},
      {"tank_outages", select("tank_outages", "id", Map.get(scope, :outages, []))},
      {"flag_signoffs", select("flag_signoffs", "flag_key", Map.get(scope, :signoffs, []))},
      {"tank_condition_marks", select("tank_condition_marks", "id", Map.get(scope, :marks, []))}
    ]
    |> Enum.flat_map(fn {table, list} -> Enum.map(list, &{{table, &1["id"]}, &1}) end)
    |> Map.new()
  end

  defp with_parts([]), do: []

  defp with_parts(ids) do
    parents =
      for b <- select("batches", "id", ids), b["split_parent_id"], do: b["split_parent_id"]

    roots = Enum.uniq(ids ++ parents)
    parts = select("batches", "split_parent_id", roots) |> Enum.map(& &1["id"])
    Enum.uniq(roots ++ parts)
  end

  defp select(_table, _column, []), do: []

  defp select(table, column, values) do
    values = Enum.uniq(values)
    marks = Enum.map_join(values, ", ", fn _ -> "?" end)
    to_maps(Repo.query!("SELECT * FROM #{table} WHERE #{column} IN (#{marks})", values))
  end

  defp row(table, id) do
    case to_maps(Repo.query!("SELECT * FROM #{table} WHERE id = ?", [id])) do
      [row] -> row
      [] -> nil
    end
  end

  defp to_maps(%{columns: columns, rows: rows}),
    do: Enum.map(rows, fn r -> Map.new(Enum.zip(columns, r)) end)

  defp put_row!(table, row) do
    columns = Map.keys(row)
    values = Enum.map(columns, &row[&1])
    quoted = Enum.map_join(columns, ", ", &~s|"#{&1}"|)
    marks = Enum.map_join(columns, ", ", fn _ -> "?" end)

    # An upsert, not INSERT OR REPLACE: a replace deletes the row first, and
    # the delete would cascade to its children.
    sets =
      columns
      |> Enum.reject(&(&1 == "id"))
      |> Enum.map_join(", ", &~s|"#{&1}" = excluded."#{&1}"|)

    sql =
      "INSERT INTO #{table} (#{quoted}) VALUES (#{marks}) ON CONFLICT(id) DO UPDATE SET #{sets}"

    # Anything else in the way (another row took a unique value since) means
    # the change can't be put back as it was.
    case Repo.query(sql, values) do
      {:ok, _} -> :ok
      {:error, _} -> Repo.rollback(:undo_stale)
    end
  end

  # The batches whose vessels the write changed, and every other batch of
  # their split trees (as they were or as the write left them: X1, an Undo
  # split's parent), each with its whole vessel list as the write left it.
  defp vessels(entries, after_) do
    ids =
      entries
      |> Enum.filter(&(&1["table"] == "batch_vessels"))
      |> Enum.map(&(&1["before"] || after_[{"batch_vessels", &1["id"]}])["batch_id"])
      |> Enum.uniq()

    before =
      for e <- entries,
          e["table"] == "batches",
          e["before"],
          into: %{},
          do: {e["id"], e["before"]}

    roots =
      for id <- ids,
          uniq: true,
          do: (after_[{"batches", id}] || before[id] || %{})["split_parent_id"] || id

    parts = select("batches", "split_parent_id", roots) |> Enum.map(& &1["id"])

    (ids ++ roots ++ parts)
    |> Enum.uniq()
    |> Map.new(&{to_string(&1), vessels_hash(&1)})
  end

  # The batches an Undo puts vessels back in, or batch rows (a split's parts).
  defp touched(entries, vessels) do
    from_rows =
      for e <- entries,
          e["table"] in ["batches", "batch_vessels"],
          id = if(e["table"] == "batches", do: e["id"], else: (e["before"] || %{})["batch_id"]),
          do: id

    Enum.uniq(Enum.map(Map.keys(vessels), &String.to_integer/1) ++ from_rows)
  end

  defp vessels_hash(batch_id) do
    select("batch_vessels", "batch_id", [batch_id])
    |> Enum.map(&{&1["id"], hash(&1)})
    |> Enum.sort()
    |> digest()
  end

  defp entries(before, after_) do
    for key <- Enum.uniq(Map.keys(before) ++ Map.keys(after_)),
        before[key] != after_[key] do
      {table, id} = key

      entry = %{
        "table" => table,
        "id" => id,
        "before" => before[key],
        "after" => hash(after_[key])
      }

      # A step's done state as the write left it (`put_back!/1`).
      if table == "production_steps",
        do: Map.put(entry, "done", done?(after_[key])),
        else: entry
    end
  end

  # Rows go through JSON in the record, so hash what JSON keeps. Not
  # `updated_at` (D49 BB2): a row changed and changed back since is as the
  # write left it, so the Undo comes back once a blocker is cleared.
  defp hash(nil), do: nil

  defp hash(row) do
    row
    |> Map.delete("updated_at")
    |> Jason.encode!()
    |> Jason.decode!()
    |> Enum.sort()
    |> digest()
  end

  defp digest(term),
    do:
      term
      |> :erlang.term_to_binary()
      |> then(&:crypto.hash(:sha256, &1))
      |> Base.encode16(case: :lower)

  defp save!(user, entries, vessels) do
    token = Base.url_encode64(:crypto.strong_rand_bytes(18), padding: false)

    Repo.insert!(%UndoRecord{
      token: token,
      user_id: user.id,
      expires_at: DateTime.utc_now() |> DateTime.add(@ttl_seconds) |> DateTime.truncate(:second),
      entries: %{"rows" => entries, "vessels" => vessels}
    })

    token
  end

  defp prune do
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    Repo.delete_all(from(u in UndoRecord, where: u.expires_at < ^now))
  end

  defp merge(a, b), do: Map.merge(a, b, fn _k, x, y -> Enum.uniq(x ++ y) end)

  defp done?(row), do: (row || %{})["done_on"] != nil

  @done_columns ~w(done_on done_by_id completed_at)

  defp keep_done(e, now),
    do: %{e | "before" => Map.merge(e["before"], Map.take(now, @done_columns))}

  defp rank(table), do: Enum.find_index(@order, &(&1 == table))
end
