defmodule RockcutApi.Repo.Migrations.AddOfferToContractLines do
  @moduledoc """
  D61 lead (Stop 2 note 3): a contract line remembers the supplier offer its
  price goes on, set when the line is saved (named when the supplier has
  several offers for the product, inferred when one), so a later price
  change writes to the same offer. Additive; existing lines (none outside
  tests) get theirs on their next save.
  """
  use Ecto.Migration

  def change do
    alter table(:supplier_contract_lines) do
      add :offer_id, references(:supplier_offers, on_delete: :restrict)
    end

    create index(:supplier_contract_lines, [:offer_id])
  end
end
