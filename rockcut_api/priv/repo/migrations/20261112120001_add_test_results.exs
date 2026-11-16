defmodule RockcutApi.Repo.Migrations.AddTestResults do
  use Ecto.Migration

  # D56 §3.2 (was D57): a step type can record Pass / Fail at check-off, and
  # a Fail can add a retest N days later. Additive: an older image ignores
  # the columns. The seeded Diacetyl test and Gravity check start switched
  # on, found by name (a type renamed since stays off).
  def up do
    alter table(:production_step_types) do
      add :has_result, :boolean, null: false, default: false
    end

    alter table(:template_steps) do
      add :retest_days, :integer, null: false, default: 2
    end

    alter table(:production_steps) do
      add :retest_days, :integer, null: false, default: 2
      add :result, :string
      add :retest_of_id, references(:production_steps, on_delete: :nilify_all)
    end

    create index(:production_steps, [:retest_of_id])

    execute """
    UPDATE production_step_types SET has_result = 1
    WHERE lower(name) IN ('diacetyl test', 'gravity check')
    """
  end

  def down do
    drop index(:production_steps, [:retest_of_id])

    alter table(:production_steps) do
      remove :retest_of_id
      remove :result
      remove :retest_days
    end

    alter table(:template_steps) do
      remove :retest_days
    end

    alter table(:production_step_types) do
      remove :has_result
    end
  end
end
