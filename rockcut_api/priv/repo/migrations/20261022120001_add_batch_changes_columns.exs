defmodule RockcutApi.Repo.Migrations.AddBatchChangesColumns do
  use Ecto.Migration

  # D48 (spec §3.11): a split's parts are batches of their own, pointing at
  # the parent (`split_parent_id`, numbered 1…n by `part_number`); a batch's
  # Set temp ramp keeps its `ramp_group` from the template, so Change ramp…
  # can find its steps.
  def change do
    alter table(:batches) do
      add :split_parent_id, references(:batches, on_delete: :restrict)
      add :part_number, :integer
    end

    create index(:batches, [:split_parent_id])

    alter table(:production_steps) do
      add :ramp_group, :string
    end
  end
end
