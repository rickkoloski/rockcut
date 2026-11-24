defmodule RockcutApi.Repo.Migrations.CreateYeastCounts do
  @moduledoc """
  D64 plan migration 9 (spec §4.7, decision 18): cell counts on a brink's
  record: the day, viable cells (millions per mL, 1 dp, > 0) and viability
  (%, 1 dp, 0–100), a note and who entered it.
  """
  use Ecto.Migration

  def change do
    create table(:yeast_counts) do
      add :harvest_id, references(:yeast_harvests, on_delete: :delete_all), null: false
      add :counted_on, :date, null: false
      add :viable_millions_per_ml, :decimal, null: false
      add :viability_pct, :decimal, null: false
      add :note, :text
      add :entered_by_id, references(:users, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create index(:yeast_counts, [:harvest_id])
  end
end
