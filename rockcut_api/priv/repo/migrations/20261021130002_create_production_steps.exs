defmodule RockcutApi.Repo.Migrations.CreateProductionSteps do
  use Ecto.Migration

  # D47 (spec §3.5): the tanks a scheduled batch occupies (`tank_id` null =
  # Unassigned), its steps (copied from the template; a standalone CIP has a
  # `tank_id` and no batch) and the links between them. A typed step's name
  # comes from its type; `name` is only for a custom step.
  def change do
    create table(:batch_vessels) do
      add :batch_id, references(:batches, on_delete: :delete_all), null: false
      add :vessel_index, :integer, null: false
      add :tank_id, references(:tanks, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create unique_index(:batch_vessels, [:batch_id, :vessel_index])
    create index(:batch_vessels, [:tank_id])

    create table(:production_steps) do
      add :batch_id, references(:batches, on_delete: :delete_all)
      add :tank_id, references(:tanks, on_delete: :nilify_all)
      add :step_type_id, references(:production_step_types, on_delete: :restrict)
      add :name, :string
      add :phase_id, references(:production_phases, on_delete: :restrict)
      add :vessel_index, :integer, null: false, default: 0
      add :detail, :string
      add :temperature, :integer
      add :split_method, :string
      add :package_partial, :boolean, null: false, default: false
      add :notes, :text
      add :on_task_list, :boolean, null: false, default: true
      add :position, :integer, null: false, default: 0
      add :due_on, :date, null: false
      add :done_on, :date
      add :done_by_id, references(:users, on_delete: :nilify_all)
      add :completed_at, :utc_datetime
      add :assignee_id, references(:users, on_delete: :nilify_all)
      add :added, :boolean, null: false, default: false
      add :template_step_id, references(:template_steps, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create index(:production_steps, [:batch_id])
    create index(:production_steps, [:tank_id])
    create index(:production_steps, [:due_on])
    create index(:production_steps, [:assignee_id])

    create table(:production_step_links) do
      add :from_step_id, references(:production_steps, on_delete: :delete_all), null: false
      add :to_step_id, references(:production_steps, on_delete: :delete_all), null: false
      add :default_answer, :string, null: false, default: "move_all"

      timestamps(type: :utc_datetime)
    end

    create unique_index(:production_step_links, [:from_step_id, :to_step_id])
    create index(:production_step_links, [:to_step_id])
  end
end
