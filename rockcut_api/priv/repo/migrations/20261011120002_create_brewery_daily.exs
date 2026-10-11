defmodule RockcutApi.Repo.Migrations.CreateBreweryDaily do
  use Ecto.Migration

  # D38 §3.1: the Daily card. Items are the card's list (retired, never
  # deleted, so past ticks keep their name); a check row exists only while it's
  # ticked. An item's `inserted_at` decides whether it counts on a past day.
  #
  # The four default items go to the department keyed `brewery`. On a fresh DB
  # (tests, a new install) it doesn't exist yet, so nothing is inserted here and
  # `seeds.exs` / the test fixture add them.
  @defaults ~w(Backups Gravities Temps Pressures)

  def up do
    create table(:brewery_daily_items) do
      add :department_id, references(:departments, on_delete: :restrict), null: false
      add :name, :string, null: false
      add :position, :integer, null: false, default: 0
      add :active, :boolean, null: false, default: true

      timestamps(type: :utc_datetime)
    end

    create table(:brewery_daily_checks) do
      add :department_id, references(:departments, on_delete: :restrict), null: false
      add :on_date, :date, null: false

      add :daily_item_id, references(:brewery_daily_items, on_delete: :delete_all), null: false

      add :completed_by_id, references(:users, on_delete: :nilify_all)
      add :completed_at, :utc_datetime, null: false
    end

    create unique_index(:brewery_daily_checks, [:on_date, :daily_item_id])

    flush()

    now = DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()

    @defaults
    |> Enum.with_index(1)
    |> Enum.each(fn {name, position} ->
      execute("""
      INSERT INTO brewery_daily_items (department_id, name, position, active, inserted_at, updated_at)
      SELECT id, '#{name}', #{position}, 1, '#{now}', '#{now}' FROM departments WHERE key = 'brewery'
      """)
    end)
  end

  def down do
    drop table(:brewery_daily_checks)
    drop table(:brewery_daily_items)
  end
end
