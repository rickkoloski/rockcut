defmodule RockcutApi.Repo.Migrations.AddShowPlannedBatchesToUsers do
  @moduledoc """
  D49 §3.12: "Show planned batches" on the Brewery board, remembered per
  person on the server (Matt, 2026-10-26).
  """
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :show_planned_batches, :boolean, null: false, default: true
    end
  end
end
