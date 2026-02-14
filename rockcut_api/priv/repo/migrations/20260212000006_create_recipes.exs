defmodule RockcutApi.Repo.Migrations.CreateRecipes do
  use Ecto.Migration

  def change do
    create table(:recipes) do
      add :brand_id, references(:brands, on_delete: :restrict), null: false
      add :version_major, :integer, null: false, default: 1
      add :version_minor, :integer, null: false, default: 0
      add :batch_size, :decimal, null: false
      add :batch_size_unit, :string, null: false, default: "gallons"
      add :boil_time, :integer, null: false, default: 60
      add :efficiency_target, :decimal
      add :status, :string, null: false, default: "draft"
      add :notes, :text

      timestamps(type: :utc_datetime)
    end

    create index(:recipes, [:brand_id])
    create unique_index(:recipes, [:brand_id, :version_major, :version_minor])
  end
end
