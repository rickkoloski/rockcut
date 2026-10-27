defmodule RockcutApi.Repo.Migrations.AddProductionStepToTasks do
  @moduledoc """
  D49 §3.12: a Brewery board task made from a production step (plan
  decision 5: one link column). `Production.TaskLink` keeps it in step with
  the step; the task goes when the step does.
  """
  use Ecto.Migration

  def change do
    alter table(:tasks) do
      add :production_step_id, references(:production_steps, on_delete: :delete_all)
    end

    create unique_index(:tasks, [:production_step_id])
  end
end
