defmodule RockcutApi.Repo.Migrations.AddUsePositionToIngredientLots do
  @moduledoc """
  D63 §4.1: a hop lot's place in its use list (`Ingredients.UseOrder`); null
  on every other lot. The next migration fills it.
  """
  use Ecto.Migration

  def change do
    alter table(:ingredient_lots) do
      add :use_position, :integer
    end

    create index(:ingredient_lots, [:ingredient_id, :use_position])
  end
end
