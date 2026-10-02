defmodule RockcutApi.Repo.Migrations.AddDeviceKindToUsers do
  use Ecto.Migration

  # D33: a shared tablet is a `users` row with kind "device" and a home
  # department (spec §3.1). Every existing row stays a "person".
  def change do
    alter table(:users) do
      add :kind, :string, null: false, default: "person"
      add :home_department_id, references(:departments, on_delete: :restrict)
    end

    create index(:users, [:kind])
  end
end
