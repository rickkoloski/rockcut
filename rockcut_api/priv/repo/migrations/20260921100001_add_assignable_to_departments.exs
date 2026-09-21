defmodule RockcutApi.Repo.Migrations.AddAssignableToDepartments do
  use Ecto.Migration

  def change do
    alter table(:departments) do
      # false for scheduling-only placeholder departments (e.g. "Other") that
      # should not appear in user role assignment / RBAC.
      add :assignable, :boolean, null: false, default: true
    end
  end
end
