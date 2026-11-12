defmodule RockcutApi.Repo.Migrations.AddChainToScheduleEventSeries do
  use Ecto.Migration

  # D58 §3.6 (4261): D39's split chain for repeating schedule events. A rule
  # change saved with "This and all following" starts a new series that points
  # back at the one it continues (G1), and the old part's `until_date` is
  # marked internal: it stops the dates, it isn't the person's "Ends" (R1).
  # Additive; splits made before this have no link and behave as before.
  def change do
    alter table(:schedule_event_series) do
      add :continues_series_id, references(:schedule_event_series, on_delete: :nilify_all)
      add :internal_end, :boolean, null: false, default: false
    end

    create index(:schedule_event_series, [:continues_series_id])
  end
end
