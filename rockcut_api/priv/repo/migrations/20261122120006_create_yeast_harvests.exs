defmodule RockcutApi.Repo.Migrations.CreateYeastHarvests do
  @moduledoc """
  D64 plan migration 6 (spec §4.5): a brink's contents, from the first
  harvest into an empty brink until it's emptied. `status` `in_brink` /
  `emptied` / `voided`; the generation and co-ferment mark are a cache of the
  fold over its `harvested` entries (`Yeast.Rules`). One `in_brink` record per
  brink (partial unique index).
  """
  use Ecto.Migration

  def change do
    create table(:yeast_harvests) do
      add :brink_id, references(:yeast_brinks, on_delete: :restrict), null: false
      add :status, :string, null: false, default: "in_brink"
      add :generation, :integer, null: false, default: 1
      add :coferment, :boolean, null: false, default: false
      add :emptied_on, :date
      add :notes, :text
      add :lock_version, :integer, null: false, default: 1

      timestamps(type: :utc_datetime)
    end

    create index(:yeast_harvests, [:brink_id])

    create unique_index(:yeast_harvests, [:brink_id],
             where: "status = 'in_brink'",
             name: :yeast_harvests_one_open_per_brink_index
           )
  end
end
