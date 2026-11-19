defmodule RockcutApi.Repo.Migrations.AddReorderOfferToProducts do
  @moduledoc """
  D61 lead decisions 1 (gap 4, amendment): the reorder offer picked on To
  order is kept on the product. Nullable; nil means the default (the offer
  on the latest order line while active, else the first active offer).
  Deleting the offer clears it. Additive.
  """
  use Ecto.Migration

  def change do
    alter table(:ingredient_products) do
      add :reorder_offer_id, references(:supplier_offers, on_delete: :nilify_all)
    end

    create index(:ingredient_products, [:reorder_offer_id])
  end
end
