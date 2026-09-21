defmodule RockcutApi.Repo.Migrations.CreateMemberships do
  use Ecto.Migration

  def change do
    create table(:memberships) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :department_id, references(:departments, on_delete: :delete_all), null: false
      add :role, :string, null: false

      timestamps(type: :utc_datetime)
    end

    create index(:memberships, [:user_id])
    create index(:memberships, [:department_id])
    create unique_index(:memberships, [:user_id, :department_id])
  end
end
