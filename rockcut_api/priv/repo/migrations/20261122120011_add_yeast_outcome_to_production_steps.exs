defmodule RockcutApi.Repo.Migrations.AddYeastOutcomeToProductionSteps do
  @moduledoc """
  D64 plan migration 11 (spec §4.8): a Yeast harvest step's check-off
  outcome, `harvested` (its entry is the `yeast_harvest_entries` row with
  this `production_step_id`) or `dumped`, and the note. Additive: an older
  image ignores the columns.
  """
  use Ecto.Migration

  def change do
    alter table(:production_steps) do
      add :yeast_outcome, :string
      add :yeast_note, :text
    end
  end
end
