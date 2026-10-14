defmodule RockcutApi.Repo.Migrations.AddContinuesSeriesIdToBreweryTaskSeries do
  use Ecto.Migration

  # D39 G1 (DEV QA): a rule change saved with "This and all following" splits
  # a series; the new series points back at the one it continues, so a later
  # "following" action from before the split reaches past it. Additive: the
  # create migration has already run on DEV.
  def change do
    alter table(:brewery_task_series) do
      add :continues_series_id, references(:brewery_task_series, on_delete: :nilify_all)
    end

    create index(:brewery_task_series, [:continues_series_id])
  end
end
