defmodule RockcutApi.Repo.Migrations.CreatePurchasing do
  @moduledoc """
  D61 §3: malt contracts (Silverston's Agreement), purchase orders and their
  lines (Order, Order Item), a supplier's order target, a product's minimum
  on hand, and the order line and cost on a Received movement. Additive; the
  unique lot number per product is the next migration.
  """
  use Ecto.Migration

  def change do
    create table(:supplier_contracts) do
      add :supplier_party_id, references(:parties, on_delete: :restrict), null: false
      add :year, :integer, null: false
      add :notes, :text
      add :created_by_id, references(:users, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    # A1: one contract per supplier per year.
    create unique_index(:supplier_contracts, [:supplier_party_id, :year])

    create table(:supplier_contract_lines) do
      add :contract_id, references(:supplier_contracts, on_delete: :delete_all), null: false
      add :product_id, references(:ingredient_products, on_delete: :restrict), null: false
      add :sacks, :integer, null: false
      add :price_per_sack, :decimal, null: false

      timestamps(type: :utc_datetime)
    end

    create unique_index(:supplier_contract_lines, [:contract_id, :product_id])
    create index(:supplier_contract_lines, [:product_id])

    create table(:purchase_orders) do
      add :supplier_party_id, references(:parties, on_delete: :restrict), null: false
      add :ordered_on, :date, null: false
      add :expected_on, :date
      add :reference, :string
      add :off_contract, :boolean, null: false, default: false
      add :notes, :text
      add :status, :string, null: false, default: "open"
      add :received_on, :date
      add :created_by_id, references(:users, on_delete: :nilify_all)
      add :received_by_id, references(:users, on_delete: :nilify_all)
      add :cancelled_by_id, references(:users, on_delete: :nilify_all)
      add :received_at, :utc_datetime
      add :cancelled_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create index(:purchase_orders, [:supplier_party_id, :ordered_on])
    create index(:purchase_orders, [:status])

    create table(:purchase_order_lines) do
      add :order_id, references(:purchase_orders, on_delete: :delete_all), null: false
      add :offer_id, references(:supplier_offers, on_delete: :restrict), null: false
      add :sacks_ordered, :integer, null: false
      add :price_per_sack, :decimal, null: false
      add :sacks_received, :integer

      timestamps(type: :utc_datetime)
    end

    create index(:purchase_order_lines, [:order_id])
    create index(:purchase_order_lines, [:offer_id])

    alter table(:parties) do
      add :order_target_sacks, :integer
    end

    alter table(:ingredient_products) do
      add :min_on_hand_sacks, :integer
    end

    # §3.3/§3.4: a Received movement from an order records its line and cost.
    alter table(:inventory_movements) do
      add :purchase_order_line_id, references(:purchase_order_lines, on_delete: :restrict)
      add :unit_cost_per_lb, :decimal
    end

    create index(:inventory_movements, [:purchase_order_line_id])
  end
end
