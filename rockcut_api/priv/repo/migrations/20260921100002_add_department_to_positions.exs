defmodule RockcutApi.Repo.Migrations.AddDepartmentToPositions do
  use Ecto.Migration

  def change do
    alter table(:positions) do
      add :department_id, references(:departments, on_delete: :restrict)
    end

    create index(:positions, [:department_id])
  end
end
