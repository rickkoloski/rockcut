defmodule RockcutApi.Repo.Migrations.CreateBrands do
  use Ecto.Migration

  def change do
    create table(:brands) do
      add :name, :string, null: false
      add :style, :string
      add :description, :text
      add :target_abv, :decimal
      add :target_ibu, :decimal
      add :target_srm, :decimal
      add :status, :string, null: false, default: "active"

      timestamps(type: :utc_datetime)
    end

    create unique_index(:brands, [:name])
  end
end
