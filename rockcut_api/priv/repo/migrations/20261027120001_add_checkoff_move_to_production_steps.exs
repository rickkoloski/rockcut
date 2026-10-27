defmodule RockcutApi.Repo.Migrations.AddCheckoffMoveToProductionSteps do
  @moduledoc """
  D49 QA 1 (Matt, option a): what a step's own check-off moved when it was
  done on another day than planned (`{step_id => [from, to]}`), so Mark not
  done puts those steps back and a captured Undo works again (BB2).
  """
  use Ecto.Migration

  def change do
    alter table(:production_steps) do
      # JSON text: an empty record stays SQL NULL (Undo compares rows).
      add :checkoff_move, :text
    end
  end
end
