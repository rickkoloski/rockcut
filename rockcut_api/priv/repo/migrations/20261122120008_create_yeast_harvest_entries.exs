defmodule RockcutApi.Repo.Migrations.CreateYeastHarvestEntries do
  @moduledoc """
  D64 plan migration 8 (spec §4.5): a record's entries, never edited in
  place: `harvested` (+ lb), `pitched`, `dumped`, `adjusted` (signed lb, 2
  dp). Each keeps the generation and strains it brought (`harvested`) or
  the record had (`pitched`), so a later harvest on top doesn't change what
  a pitch was. `production_step_id` is unique where set (one harvest per
  step check-off; Stop 3 writes it). Who entered it, and the device.
  """
  use Ecto.Migration

  def change do
    create table(:yeast_harvest_entries) do
      add :harvest_id, references(:yeast_harvests, on_delete: :delete_all), null: false
      add :kind, :string, null: false
      add :quantity_lb, :decimal, null: false
      add :occurred_on, :date, null: false
      add :batch_id, references(:batches, on_delete: :restrict)
      add :production_step_id, references(:production_steps, on_delete: :nilify_all)
      add :generation, :integer
      add :product_ids, {:array, :integer}
      add :note, :text
      add :entered_by_id, references(:users, on_delete: :nilify_all)
      add :device_id, references(:users, on_delete: :nilify_all)

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:yeast_harvest_entries, [:harvest_id])
    create index(:yeast_harvest_entries, [:batch_id])

    create unique_index(:yeast_harvest_entries, [:production_step_id],
             where: "production_step_id IS NOT NULL"
           )
  end
end
