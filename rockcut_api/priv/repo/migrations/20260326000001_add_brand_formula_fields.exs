defmodule RockcutApi.Repo.Migrations.AddBrandFormulaFields do
  use Ecto.Migration

  def change do
    alter table(:brands) do
      add :apparent_attenuation, :decimal
      add :target_mash_efficiency, :decimal
      add :target_batch_size, :decimal
      add :original_gravity, :decimal
    end
  end
end
