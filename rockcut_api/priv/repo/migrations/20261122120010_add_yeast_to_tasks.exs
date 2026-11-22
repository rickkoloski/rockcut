defmodule RockcutApi.Repo.Migrations.AddYeastToTasks do
  @moduledoc """
  D64 plan migration 10 (spec §7): a Brewery board task a brink made,
  "Count YB2" (`recount`) or "Clean YB2" (`clean`). At most one open task of
  each kind per brink (partial unique index). A brink deleted leaves its
  tasks (nilify).
  """
  use Ecto.Migration

  def change do
    alter table(:tasks) do
      add :yeast_brink_id, references(:yeast_brinks, on_delete: :nilify_all)
      add :yeast_kind, :string
    end

    create unique_index(:tasks, [:yeast_brink_id, :yeast_kind],
             where: "completed_at IS NULL AND yeast_kind IS NOT NULL",
             name: :tasks_one_open_yeast_task_index
           )
  end
end
