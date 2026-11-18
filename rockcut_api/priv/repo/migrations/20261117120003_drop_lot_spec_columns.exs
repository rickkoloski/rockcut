defmodule RockcutApi.Repo.Migrations.DropLotSpecColumns do
  @moduledoc """
  D60 §3.4/§3.7: the lot columns the previous migration copied into
  `lot_feature_values`, and the text maltster/supplier/order fields the
  maltster product, supplier party and supplier offer replace. An API image
  from before D60 selects them, so rolling back past D60 needs the
  pre-release snapshot (as D55). `down` brings the columns back empty; the
  previous migration's `down` fills the spec columns again.
  """
  use Ecto.Migration

  @decimals ~w(color_lovibond extract_potential_fgdb protein_perc moisture_perc
               diastatic_power_linter alpha_acid attenuation)a
  @strings ~w(maltster supplier order_name order_unit_size)a

  def up do
    alter table(:ingredient_lots) do
      for column <- @decimals ++ @strings, do: remove(column)
      remove :properties
    end
  end

  def down do
    alter table(:ingredient_lots) do
      for column <- @decimals, do: add(column, :decimal)
      for column <- @strings, do: add(column, :string)
      add :properties, :text
    end
  end
end
