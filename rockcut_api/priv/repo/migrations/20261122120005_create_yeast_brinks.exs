defmodule RockcutApi.Repo.Migrations.CreateYeastBrinks do
  @moduledoc """
  D64 plan migration 5 (spec §4.4, decisions 7–8): the yeast brinks. `name`
  unique in any case; `empty_weight_lb` optional (the yeast settings say it,
  the app never subtracts it); `position` and `active` (retired); `dirty`
  with `dirty_since`. YB1–YB4 are seeded clean, with no empty weight
  (idempotent by name).
  """
  use Ecto.Migration

  def up do
    create_if_not_exists table(:yeast_brinks) do
      add :name, :string, null: false
      add :empty_weight_lb, :decimal
      add :position, :integer, null: false, default: 0
      add :active, :boolean, null: false, default: true
      add :dirty, :boolean, null: false, default: false
      add :dirty_since, :date

      timestamps(type: :utc_datetime)
    end

    execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS yeast_brinks_lower_name_index ON yeast_brinks (lower(name))"
    )

    execute(fn ->
      for {name, position} <- [{"YB1", 0}, {"YB2", 1}, {"YB3", 2}, {"YB4", 3}] do
        repo().query!(
          """
          INSERT INTO yeast_brinks (name, position, active, dirty, inserted_at, updated_at)
          SELECT ?, ?, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE NOT EXISTS (SELECT 1 FROM yeast_brinks WHERE lower(name) = lower(?))
          """,
          [name, position, name]
        )
      end
    end)
  end

  def down, do: drop(table(:yeast_brinks))
end
