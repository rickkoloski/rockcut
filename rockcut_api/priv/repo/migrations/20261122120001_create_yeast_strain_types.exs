defmodule RockcutApi.Repo.Migrations.CreateYeastStrainTypes do
  @moduledoc """
  D64 plan migration 1 (spec Amendment 2, A13): the Strain Type list, edited
  in the yeast settings by Brewery managers and owners. `name` is unique in
  any case; a type is retired (`retired_at`) rather than deleted once a
  strain uses it (`ingredients.yeast_strain_type_id`, `on_delete:
  :restrict`). Seeded with Ale, Lager, Brett and Lacto (idempotent by name).

  `down` drops the column and the table (with any types added since).
  """
  use Ecto.Migration

  @seeded [{"Ale", 0}, {"Lager", 1}, {"Brett", 2}, {"Lacto", 3}]

  def up do
    create_if_not_exists table(:yeast_strain_types) do
      add :name, :string, null: false
      add :position, :integer, null: false, default: 0
      add :retired_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS yeast_strain_types_lower_name_index " <>
        "ON yeast_strain_types (lower(name))"
    )

    execute(fn ->
      for {name, position} <- @seeded do
        repo().query!(
          """
          INSERT INTO yeast_strain_types (name, position, inserted_at, updated_at)
          SELECT ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE NOT EXISTS (SELECT 1 FROM yeast_strain_types WHERE lower(name) = lower(?))
          """,
          [name, position, name]
        )
      end
    end)

    execute(fn ->
      %{rows: rows} =
        repo().query!(
          "SELECT 1 FROM pragma_table_info('ingredients') WHERE name = 'yeast_strain_type_id'"
        )

      if rows == [] do
        repo().query!(
          "ALTER TABLE ingredients ADD COLUMN yeast_strain_type_id INTEGER " <>
            "REFERENCES yeast_strain_types(id) ON DELETE RESTRICT"
        )
      end
    end)

    execute(
      "CREATE INDEX IF NOT EXISTS ingredients_yeast_strain_type_id_index " <>
        "ON ingredients (yeast_strain_type_id)"
    )
  end

  def down do
    execute("DROP INDEX IF EXISTS ingredients_yeast_strain_type_id_index")

    alter table(:ingredients) do
      remove :yeast_strain_type_id
    end

    drop table(:yeast_strain_types)
  end
end
