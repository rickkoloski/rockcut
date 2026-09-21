defmodule RockcutApi.Repo.Migrations.AddColorToDepartments do
  use Ecto.Migration

  def change do
    alter table(:departments) do
      add :color, :string
    end
  end
end
