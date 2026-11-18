defmodule RockcutApi.Repo.Migrations.CreateGrainCatalog do
  @moduledoc """
  D60 §3: the grain catalog and inventory tables (Silverston's product,
  party, feature, supplier product and lot patterns), category parents, and
  the new lot columns. Additive; the copy of the old lot columns and their
  drop are the next two migrations.
  """
  use Ecto.Migration

  def change do
    alter table(:ingredient_categories) do
      add :parent_id, references(:ingredient_categories, on_delete: :restrict)
    end

    create index(:ingredient_categories, [:parent_id])

    create table(:parties) do
      add :name, :string, null: false
      add :notes, :text
      add :active, :boolean, null: false, default: true

      timestamps(type: :utc_datetime)
    end

    create unique_index(:parties, [:name])

    create table(:party_roles) do
      add :party_id, references(:parties, on_delete: :delete_all), null: false
      add :role, :string, null: false

      timestamps(type: :utc_datetime)
    end

    create unique_index(:party_roles, [:party_id, :role])

    # The maltster product. A nil name is "no product name": the unique
    # index treats it as "" so a grain + maltster has one unnamed product.
    create table(:ingredient_products) do
      add :ingredient_id, references(:ingredients, on_delete: :restrict), null: false
      add :maltster_party_id, references(:parties, on_delete: :restrict), null: false
      add :name, :string
      add :notes, :text
      add :active, :boolean, null: false, default: true

      timestamps(type: :utc_datetime)
    end

    create index(:ingredient_products, [:maltster_party_id])

    create unique_index(
             :ingredient_products,
             [:ingredient_id, :maltster_party_id, "coalesce(name, '')"],
             name: :ingredient_products_ingredient_maltster_name_index
           )

    create table(:feature_types) do
      add :key, :string, null: false
      add :label, :string, null: false
      add :unit_label, :string
      add :min, :decimal
      add :max, :decimal
      add :decimals, :integer, null: false, default: 1

      timestamps(type: :utc_datetime)
    end

    create unique_index(:feature_types, [:key])

    create table(:category_feature_types) do
      add :category_id, references(:ingredient_categories, on_delete: :delete_all), null: false
      add :feature_type_id, references(:feature_types, on_delete: :restrict), null: false
      add :sort_order, :integer, null: false, default: 0
      add :required, :boolean, null: false, default: false

      timestamps(type: :utc_datetime)
    end

    create unique_index(:category_feature_types, [:category_id, :feature_type_id])

    create table(:product_feature_values) do
      add :product_id, references(:ingredient_products, on_delete: :delete_all), null: false
      add :feature_type_id, references(:feature_types, on_delete: :restrict), null: false
      add :value, :decimal, null: false
      add :entered_value, :decimal
      add :entered_unit, :string

      timestamps(type: :utc_datetime)
    end

    create unique_index(:product_feature_values, [:product_id, :feature_type_id])

    create table(:supplier_offers) do
      add :product_id, references(:ingredient_products, on_delete: :restrict), null: false
      add :supplier_party_id, references(:parties, on_delete: :restrict), null: false
      add :order_name, :string
      add :sack_size_lb, :decimal, null: false
      add :form, :string, null: false
      add :notes, :text
      add :active, :boolean, null: false, default: true

      timestamps(type: :utc_datetime)
    end

    create index(:supplier_offers, [:product_id])
    create index(:supplier_offers, [:supplier_party_id])

    create table(:supplier_offer_prices) do
      add :offer_id, references(:supplier_offers, on_delete: :delete_all), null: false
      add :price_per_sack, :decimal, null: false
      add :effective_on, :date, null: false
      add :note, :text
      add :entered_by_id, references(:users, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create index(:supplier_offer_prices, [:offer_id, :effective_on])

    alter table(:ingredient_lots) do
      add :product_id, references(:ingredient_products, on_delete: :restrict)
      add :supplier_party_id, references(:parties, on_delete: :restrict)
      add :sack_size_lb, :decimal
    end

    create index(:ingredient_lots, [:product_id])
    create index(:ingredient_lots, [:supplier_party_id])

    create table(:lot_feature_values) do
      add :lot_id, references(:ingredient_lots, on_delete: :delete_all), null: false
      add :feature_type_id, references(:feature_types, on_delete: :restrict), null: false
      add :value, :decimal, null: false
      add :entered_value, :decimal
      add :entered_unit, :string

      timestamps(type: :utc_datetime)
    end

    create unique_index(:lot_feature_values, [:lot_id, :feature_type_id])

    # Quantity is signed lb (§3.7): + for opening, received, traded/loaned in.
    create table(:inventory_movements) do
      add :lot_id, references(:ingredient_lots, on_delete: :delete_all), null: false
      add :kind, :string, null: false
      add :quantity_lb, :decimal, null: false
      add :occurred_on, :date, null: false
      add :partner_party_id, references(:parties, on_delete: :restrict)
      add :note, :text
      add :entered_by_id, references(:users, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create index(:inventory_movements, [:lot_id, :occurred_on])
    create index(:inventory_movements, [:partner_party_id])
  end
end
