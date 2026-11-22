defmodule RockcutApi.Repo.Migrations.CreateYeastHarvestProducts do
  @moduledoc """
  D64 plan migration 7 (spec §4.5, A2): a record's strains as they stand now
  (each a yeast product; two or more make a co-ferment). Rewritten on every
  write from the fold.
  """
  use Ecto.Migration

  def change do
    create table(:yeast_harvest_products) do
      add :harvest_id, references(:yeast_harvests, on_delete: :delete_all), null: false
      add :product_id, references(:ingredient_products, on_delete: :restrict), null: false
    end

    create unique_index(:yeast_harvest_products, [:harvest_id, :product_id])
    create index(:yeast_harvest_products, [:product_id])
  end
end
