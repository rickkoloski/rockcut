defmodule RockcutApi.Repo.Migrations.CreateCalendarFeeds do
  use Ecto.Migration

  def change do
    create table(:calendar_feeds) do
      add :token, :string, null: false
      add :subject_type, :string, null: false
      add :subject_id, :integer
      add :created_by_id, references(:users, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create unique_index(:calendar_feeds, [:token])
    create unique_index(:calendar_feeds, [:subject_type, :subject_id])
  end
end
