defmodule RockcutApi.Repo.Migrations.AddStaffCodesToUsers do
  use Ecto.Migration

  # D37 §3.1: a Taproom member's 4-digit staff code, which attributes a change
  # made on a shared device to them. The digest (HMAC) is for lookup and
  # uniqueness; the encrypted copy lets managers see the code in the user
  # dialog.
  def change do
    alter table(:users) do
      add :staff_code_digest, :binary
      add :staff_code_encrypted, :binary
      add :staff_code_set_at, :utc_datetime
    end

    create unique_index(:users, [:staff_code_digest])
  end
end
