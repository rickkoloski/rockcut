defmodule RockcutApi.Repo.Migrations.CreateBeerBoard do
  use Ecto.Migration

  # D37 §3.1: the Buy-a-Beer Board. Entries are lines moved off the taproom
  # chalkboard; events are the append-only change log. An event keeps a
  # snapshot of the names and no foreign key to its entry, because entries are
  # deleted when their last beer is redeemed.
  def change do
    create table(:beer_board_entries) do
      add :recipient_name, :string, null: false
      add :purchaser_name, :string, null: false
      add :beers_remaining, :integer, null: false
      add :moved_off_board_at, :utc_datetime, null: false
      add :imported_at, :utc_datetime
      add :created_by_id, references(:users, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create table(:beer_board_events) do
      add :entry_id, :integer, null: false
      add :action, :string, null: false
      add :actor_id, references(:users, on_delete: :nilify_all)
      add :device_id, references(:users, on_delete: :nilify_all)
      add :recipient_name, :string, null: false
      add :purchaser_name, :string, null: false
      add :beers_before, :integer, null: false
      add :beers_after, :integer, null: false
      add :detail, :map, null: false, default: %{}

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:beer_board_events, [:inserted_at])
    create index(:beer_board_events, [:entry_id])
  end
end
