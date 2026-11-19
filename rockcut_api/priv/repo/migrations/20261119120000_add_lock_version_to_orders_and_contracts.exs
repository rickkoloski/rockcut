defmodule RockcutApi.Repo.Migrations.AddLockVersionToOrdersAndContracts do
  @moduledoc """
  D61 lead decisions 2 (gaps 1, 2): orders and contracts are saved whole, so
  each carries a version the Edit dialog sends back; a save from an older
  version is refused (409). Every write bumps it. Additive, default 1.
  """
  use Ecto.Migration

  def change do
    alter table(:purchase_orders) do
      add :lock_version, :integer, null: false, default: 1
    end

    alter table(:supplier_contracts) do
      add :lock_version, :integer, null: false, default: 1
    end
  end
end
