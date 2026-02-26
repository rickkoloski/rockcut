defmodule RockcutApi.Repo.Migrations.AddSystemToCategoryFieldDefinitions do
  use Ecto.Migration

  def change do
    alter table(:category_field_definitions) do
      add :system, :boolean, default: false, null: false
    end
  end
end
