defmodule RockcutApi.Repo.Migrations.AddAbbreviationToTanks do
  @moduledoc """
  D52: a short name for the Gantt's narrow "names only" column (Matt,
  2026-10-28). Optional; without one the Gantt shows the full name.
  """
  use Ecto.Migration

  def change do
    alter table(:tanks) do
      add :abbreviation, :string
    end
  end
end
