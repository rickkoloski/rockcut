defmodule RockcutApi.Repo.Migrations.AddBatchToInventoryMovements do
  @moduledoc """
  D64 plan migration 4 (spec §4.6): a movement may name the batch it went
  into. Nullable, `on_delete: :restrict`; D64 writes it only for a pitch of
  purchased yeast (`used`), D63 for every brew-day draw. The table is
  `inventory_movements` (the plan says `ingredient_movements`).
  """
  use Ecto.Migration

  def change do
    alter table(:inventory_movements) do
      add :batch_id, references(:batches, on_delete: :restrict)
    end

    create index(:inventory_movements, [:batch_id])
  end
end
