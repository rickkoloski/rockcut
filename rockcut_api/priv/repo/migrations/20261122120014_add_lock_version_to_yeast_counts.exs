defmodule RockcutApi.Repo.Migrations.AddLockVersionToYeastCounts do
  @moduledoc """
  D64 lead decisions 8 (gap 23): a count's Edit and Delete send back the
  version they opened; one from an older version is refused (409). Additive,
  default 1 (as orders, contracts and products).
  """
  use Ecto.Migration

  def change do
    alter table(:yeast_counts) do
      add :lock_version, :integer, null: false, default: 1
    end
  end
end
