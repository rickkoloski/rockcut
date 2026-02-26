defmodule RockcutApi.Repo.Migrations.AddBrewhouseToBatches do
  use Ecto.Migration

  def change do
    alter table(:batches) do
      add :brewhouse_id, references(:brewhouses, on_delete: :nilify_all)
    end

    create index(:batches, [:brewhouse_id])
  end
end
