defmodule RockcutApi.Repo.Migrations.AddProductionDeviceIds do
  use Ecto.Migration

  # D50 plan decision 2: a production write made on the brewhouse device is
  # the person's (from their staff code), with the device recorded beside
  # them: on a step's check-off, a flag's sign-off and the Undo record.
  # Nullable; a device deleted later leaves the person.
  def change do
    alter table(:production_steps) do
      add :done_on_device_id, references(:users, on_delete: :nilify_all)
    end

    alter table(:flag_signoffs) do
      add :device_id, references(:users, on_delete: :nilify_all)
    end

    alter table(:production_undos) do
      add :device_id, references(:users, on_delete: :nilify_all)
    end
  end
end
