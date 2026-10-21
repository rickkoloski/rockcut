defmodule RockcutApi.Repo.Migrations.CreateTanks do
  use Ecto.Migration

  # D46 §3.2: the brewery's tanks and their out-of-service periods. Names are
  # unique ignoring case (retired tanks included). An outage with no `ends_on`
  # runs until further notice.
  def change do
    create table(:tanks) do
      add :name, :string, null: false
      add :kind, :string, null: false, default: "unitank"
      add :capacity_bbl, :decimal, null: false
      add :location, :string, null: false, default: "brewhouse"
      add :position, :integer, null: false, default: 0
      add :notes, :text
      add :retired_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create unique_index(:tanks, ["lower(name)"], name: :tanks_lower_name_index)

    create table(:tank_outages) do
      add :tank_id, references(:tanks, on_delete: :delete_all), null: false
      add :starts_on, :date, null: false
      add :ends_on, :date
      add :reason, :string
      add :created_by_id, references(:users, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create index(:tank_outages, [:tank_id])
  end
end
