defmodule RockcutApi.Repo.Migrations.AddSplitMethodAndPackagePartialToTemplateSteps do
  use Ecto.Migration

  # D47 task 0 (spec §3.4, P109, P111): how a Split's parts leave,
  # "transfer" or "filter" (Splits only; the Splits already in templates are
  # Split - Transfer), and whether a Package is partial (some of the beer;
  # not the tank's exit).
  def up do
    alter table(:template_steps) do
      add :split_method, :string
      add :package_partial, :boolean, null: false, default: false
    end

    flush()

    execute("""
    UPDATE template_steps SET split_method = 'transfer'
    WHERE step_type_id IN (SELECT id FROM production_step_types WHERE behavior = 'split')
    """)
  end

  def down do
    alter table(:template_steps) do
      remove :split_method
      remove :package_partial
    end
  end
end
