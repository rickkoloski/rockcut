defmodule RockcutApi.Repo.Migrations.CreateProductionStepTypes do
  use Ecto.Migration

  # D46 §3.3: step types, brewer-editable. Seeded on every environment. The
  # seven with a behavior other than `plain` are built in (renamable, never
  # retired). {name, full name, behavior, phase it starts by default}
  @types [
    {"Brew day", nil, "brew", "Brew day"},
    {"PDH", "Primary Dry Hop", "plain", nil},
    {"FDH", "Final Dry Hop", "plain", nil},
    {"Dry hop", nil, "plain", nil},
    {"Amylo", "Amyloglucosidase (AMG)", "plain", nil},
    {"Set temp", nil, "set_temp", nil},
    {"Diacetyl test", nil, "plain", nil},
    {"Plug dump", nil, "plain", nil},
    {"Yeast harvest", nil, "plain", nil},
    {"Rouse", nil, "plain", nil},
    {"Addition", nil, "plain", nil},
    {"Fining", nil, "plain", nil},
    {"Gravity check", nil, "plain", nil},
    {"Carb", nil, "plain", "Carbonating"},
    {"Transfer", nil, "transfer", nil},
    {"Filter", nil, "transfer", nil},
    {"Split", nil, "split", nil},
    {"CIP & Sanitize", nil, "cip", nil},
    {"Package", nil, "package", "Packaging"}
  ]

  def up do
    create table(:production_step_types) do
      add :name, :string, null: false
      add :full_name, :string
      add :behavior, :string, null: false, default: "plain"
      add :starts_phase_id, references(:production_phases, on_delete: :nilify_all)
      add :on_task_list, :boolean, null: false, default: true
      add :built_in, :boolean, null: false, default: false
      add :position, :integer, null: false, default: 0
      add :retired_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create unique_index(:production_step_types, ["lower(name)"],
             name: :production_step_types_lower_name_index
           )

    flush()

    now = DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()

    @types
    |> Enum.with_index(1)
    |> Enum.each(fn {{name, full_name, behavior, phase}, position} ->
      full = if full_name, do: "'#{full_name}'", else: "NULL"

      phase_id =
        if phase,
          do: "(SELECT id FROM production_phases WHERE name = '#{phase}')",
          else: "NULL"

      built_in = if behavior == "plain", do: 0, else: 1

      execute("""
      INSERT INTO production_step_types
        (name, full_name, behavior, starts_phase_id, on_task_list, built_in, position, inserted_at, updated_at)
      VALUES ('#{name}', #{full}, '#{behavior}', #{phase_id}, 1, #{built_in}, #{position}, '#{now}', '#{now}')
      """)
    end)
  end

  def down do
    drop table(:production_step_types)
  end
end
