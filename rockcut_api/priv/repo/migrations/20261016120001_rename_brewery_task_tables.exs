defmodule RockcutApi.Repo.Migrations.RenameBreweryTaskTables do
  use Ecto.Migration

  # D41 step 1: the task board's tables lose their `brewery_` prefix, since
  # every department gets a board. A new migration, not edits to D38/D39's:
  # local and DEV have run those. SQLite moves the foreign keys that point at
  # a renamed table (`tasks.series_id`, `task_series.continues_series_id`,
  # `daily_checks.daily_item_id`), but an index keeps its name, so each one
  # is recreated under its new table's name. `department_id` on
  # `task_events` comes in the next migration.

  @tables [
    brewery_tasks: :tasks,
    brewery_task_series: :task_series,
    brewery_task_events: :task_events,
    brewery_daily_items: :daily_items,
    brewery_daily_checks: :daily_checks
  ]

  # {new table, columns, unique?}
  @indexes [
    {:tasks, [:department_id, :due_on, :position], false},
    {:tasks, [:department_id, :completed_on], false},
    {:tasks, [:assignee_id], false},
    {:tasks, [:series_id, :series_date], true},
    {:task_series, [:department_id], false},
    {:task_series, [:generated_through], false},
    {:task_series, [:continues_series_id], false},
    {:task_events, [:inserted_at], false},
    {:task_events, [:task_id], false},
    {:daily_checks, [:on_date, :daily_item_id], true}
  ]

  def up do
    for {old, new} <- @tables, do: rename(table(old), to: table(new))

    for {table, columns, unique} <- @indexes do
      drop index(table, columns, name: index_name(old_name(table), columns))
      create index(table, columns, unique: unique)
    end
  end

  def down do
    for {table, columns, _unique} <- @indexes, do: drop(index(table, columns))

    for {old, new} <- @tables, do: rename(table(new), to: table(old))

    for {table, columns, unique} <- @indexes do
      old = old_name(table)
      create index(old, columns, unique: unique, name: index_name(old, columns))
    end
  end

  defp old_name(new), do: @tables |> Enum.find(fn {_old, n} -> n == new end) |> elem(0)

  # Ecto's default: <table>_<col>_<col>_index.
  defp index_name(table, columns), do: :"#{Enum.join([table | columns], "_")}_index"
end
