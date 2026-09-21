defmodule RockcutApi.Repo.Migrations.CreateUsers do
  use Ecto.Migration

  def change do
    create table(:users) do
      add :email, :string, null: false
      add :name, :string
      add :password_hash, :string, null: false
      add :active, :boolean, null: false, default: true
      add :is_owner, :boolean, null: false, default: false
      add :must_reset_password, :boolean, null: false, default: false

      timestamps(type: :utc_datetime)
    end

    # Case-insensitive uniqueness on email (SQLite COLLATE NOCASE).
    execute(
      "CREATE UNIQUE INDEX users_email_nocase_index ON users (email COLLATE NOCASE)",
      "DROP INDEX users_email_nocase_index"
    )
  end
end
