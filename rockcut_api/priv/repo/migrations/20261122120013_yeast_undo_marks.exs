defmodule RockcutApi.Repo.Migrations.YeastUndoMarks do
  @moduledoc """
  D64 lead decisions 3: what a write changed, so taking it back puts that
  back (gaps 4, 8, 11). Additive: an older image ignores the columns.

    * `yeast_harvest_entries.cleared_dirty` / `cleared_dirty_since`: a
      harvest recorded into a dirty brink cleared its mark, dirty since then.
    * `yeast_harvest_entries.closed_recount_due_on`: the entry that emptied
      the brink deleted its open Count task, due then.
    * `yeast_counts.ticked_task_id`: the Count task the count ticked.
  """
  use Ecto.Migration

  def change do
    alter table(:yeast_harvest_entries) do
      add :cleared_dirty, :boolean, null: false, default: false
      add :cleared_dirty_since, :date
      add :closed_recount_due_on, :date
    end

    alter table(:yeast_counts) do
      add :ticked_task_id, references(:tasks, on_delete: :nilify_all)
    end
  end
end
