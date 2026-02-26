defmodule RockcutApi.Repo.Migrations.AddIsDefaultToRecipes do
  use Ecto.Migration

  def change do
    alter table(:recipes) do
      add :is_default, :boolean, default: false, null: false
    end
  end
end
