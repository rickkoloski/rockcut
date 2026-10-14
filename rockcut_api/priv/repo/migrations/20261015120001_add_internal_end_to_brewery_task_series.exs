defmodule RockcutApi.Repo.Migrations.AddInternalEndToBreweryTaskSeries do
  use Ecto.Migration

  # D39 R1 (DEV QA recheck): a split ends the old part the day before, and a
  # "following" action ends the parts left with kept occurrences on their last
  # one. Those `until_date`s only stop the top-up; they aren't the person's
  # "Ends". This marks them, so the dialog and a later rule change use the
  # chain's real end. Additive.
  def change do
    alter table(:brewery_task_series) do
      add :internal_end, :boolean, null: false, default: false
    end
  end
end
