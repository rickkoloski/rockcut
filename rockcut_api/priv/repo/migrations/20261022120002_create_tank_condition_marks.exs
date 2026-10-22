defmodule RockcutApi.Repo.Migrations.CreateTankConditionMarks do
  use Ecto.Migration

  # D48 (spec §3.8, "Marking a tank clean or dirty"): a brewer's record that
  # an empty tank is clean or dirty from `marked_on`. Not a step and not a
  # task.
  def change do
    create table(:tank_condition_marks) do
      add :tank_id, references(:tanks, on_delete: :delete_all), null: false
      add :state, :string, null: false
      add :marked_on, :date, null: false
      add :user_id, references(:users, on_delete: :nilify_all)
      add :note, :text

      timestamps(type: :utc_datetime)
    end

    create index(:tank_condition_marks, [:tank_id, :marked_on])
  end
end
