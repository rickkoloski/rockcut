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
  was undone."). Tokens last 2 minutes (`:undo_expired`), belong to the
  person who made the change (anyone else gets `:not_found`) and are pruned
  on every write.
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.Repo
  alias RockcutApi.Accounts.User
  alias RockcutApi.Production.UndoRecord

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
          {result, if(entries == [], do: nil, else: save!(user, entries))}

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

    Repo.transaction(fn ->
      for e <- entries do
        if hash(row(e["table"], e["id"])) != e["after"], do: Repo.rollback(:undo_stale)
      end

      {gone, back} = Enum.split_with(entries, &is_nil(&1["before"]))

      for e <- Enum.sort_by(gone, &(-rank(&1["table"]))),
          do: Repo.query!("DELETE FROM #{e["table"]} WHERE id = ?", [e["id"]])

      for e <- Enum.sort_by(back, &rank(&1["table"])), do: put_row!(e["table"], e["before"])

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

  ## Rows

  defp rows(scope) do
    # D48: a batch's split parts always come with it (a split inserts them,
    # Undo split deletes them, the Split's check-off changes them).
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
    parts = select("batches", "split_parent_id", ids) |> Enum.map(& &1["id"])
    Enum.uniq(ids ++ parts)
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

  defp entries(before, after_) do
    for key <- Enum.uniq(Map.keys(before) ++ Map.keys(after_)),
        before[key] != after_[key] do
      {table, id} = key
      %{"table" => table, "id" => id, "before" => before[key], "after" => hash(after_[key])}
    end
  end

  # Rows go through JSON in the record, so hash what JSON keeps.
  defp hash(nil), do: nil

  defp hash(row) do
    row
    |> Jason.encode!()
    |> Jason.decode!()
    |> Enum.sort()
    |> :erlang.term_to_binary()
    |> then(&:crypto.hash(:sha256, &1))
    |> Base.encode16(case: :lower)
  end

  defp save!(user, entries) do
    token = Base.url_encode64(:crypto.strong_rand_bytes(18), padding: false)

    Repo.insert!(%UndoRecord{
      token: token,
      user_id: user.id,
      expires_at: DateTime.utc_now() |> DateTime.add(@ttl_seconds) |> DateTime.truncate(:second),
      entries: %{"rows" => entries}
    })

    token
  end

  defp prune do
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    Repo.delete_all(from(u in UndoRecord, where: u.expires_at < ^now))
  end

  defp merge(a, b), do: Map.merge(a, b, fn _k, x, y -> Enum.uniq(x ++ y) end)

  defp rank(table), do: Enum.find_index(@order, &(&1 == table))
end
