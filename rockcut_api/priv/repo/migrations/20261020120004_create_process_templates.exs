defmodule RockcutApi.Repo.Migrations.CreateProcessTemplates do
  use Ecto.Migration

  # D46 §3.4: process templates, their entries (a step, or a phase marker when
  # `step_type_id` is null) and the dependency links between entries. Steps
  # and links go with their template. `ramp_group` ties the Set temp steps of
  # one ramp together.
  def change do
    create table(:process_templates) do
      add :name, :string, null: false
      add :notes, :text
      add :position, :integer, null: false, default: 0
      add :retired_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create unique_index(:process_templates, ["lower(name)"],
             name: :process_templates_lower_name_index
           )

    create table(:template_steps) do
      add :template_id, references(:process_templates, on_delete: :delete_all), null: false
      add :step_type_id, references(:production_step_types, on_delete: :restrict)
      add :phase_id, references(:production_phases, on_delete: :restrict)
      add :day_offset, :integer, null: false, default: 0
      add :vessel_index, :integer, null: false, default: 0
      add :detail, :string
      add :temperature, :integer
      add :notes, :text
      add :on_task_list, :boolean, null: false, default: true
      add :position, :integer, null: false, default: 0
      add :ramp_group, :string

      timestamps(type: :utc_datetime)
    end

    create index(:template_steps, [:template_id])

    create table(:template_links) do
      add :template_id, references(:process_templates, on_delete: :delete_all), null: false
      add :from_step_id, references(:template_steps, on_delete: :delete_all), null: false
      add :to_step_id, references(:template_steps, on_delete: :delete_all), null: false
      add :default_answer, :string, null: false, default: "move_all"

      timestamps(type: :utc_datetime)
    end

    create unique_index(:template_links, [:from_step_id, :to_step_id])
    create index(:template_links, [:template_id])
  end
end
