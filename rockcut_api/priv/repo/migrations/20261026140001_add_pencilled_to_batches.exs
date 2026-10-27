defmodule RockcutApi.Repo.Migrations.AddPencilledToBatches do
  @moduledoc """
  D49 §3.12b: a pencilled batch is a planned one that isn't committed yet
  (X-numbers, faded on the Gantt, muted flags, no tasks). A split's parts
  carry their parent's value.
  """
  use Ecto.Migration

  def change do
    alter table(:batches) do
      add :pencilled, :boolean, null: false, default: false
    end
  end
end
