defmodule RockcutApi.Repo.Migrations.CreateFlagSignoffsAndProductionUndos do
  use Ecto.Migration

  # D47 (spec §3.9, plan decision 5): one sign-off per flag (signing again
  # replaces it; it holds while `signature` matches the flag's), and the
  # server-side undo records: the before-images of the rows one change
  # wrote, for 2 minutes, for the person who made it.
  def change do
    create table(:flag_signoffs) do
      add :flag_key, :string, null: false
      add :signature, :string, null: false
      add :user_id, references(:users, on_delete: :nilify_all)
      add :note, :text
      add :signed_at, :utc_datetime, null: false

      timestamps(type: :utc_datetime)
    end

    create unique_index(:flag_signoffs, [:flag_key])

    create table(:production_undos) do
      add :token, :string, null: false
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :expires_at, :utc_datetime, null: false
      add :entries, :map, null: false

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create unique_index(:production_undos, [:token])
    create index(:production_undos, [:expires_at])
  end
end
