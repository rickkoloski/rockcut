defmodule RockcutApi.Repo.Migrations.AddBrewhouseAndProfileToBrands do
  use Ecto.Migration

  def change do
    alter table(:brands) do
      add :brewhouse_id, references(:brewhouses, on_delete: :nilify_all)
      add :process_profile_id, references(:process_profiles, on_delete: :nilify_all)
    end

    create index(:brands, [:brewhouse_id])
    create index(:brands, [:process_profile_id])
  end
end
