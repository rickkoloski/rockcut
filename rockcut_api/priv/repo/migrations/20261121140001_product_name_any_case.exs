defmodule RockcutApi.Repo.Migrations.ProductNameAnyCase do
  @moduledoc """
  D65 lead decisions 1 (gap 12): a product's name is unique whatever its
  case: "KT-872" and "kt-872" of the same ingredient, manufacturer and form
  are one product. The unique index is rebuilt on `lower(coalesce(name,
  ''))` under the same name (`Product.changeset`'s duplicate sentence uses
  it). Only the index changes: no table rebuild.

  `up` stops before touching the index when existing products differ only
  in the case of their name, and names them (prod expects none).
  `down` puts back the case-sensitive index.
  """
  use Ecto.Migration

  @unique "ingredient_products_ingredient_manufacturer_form_name_index"

  def up do
    %{rows: clashes} =
      repo().query!("""
      SELECT group_concat(id || ' ' || quote(name), ', ')
        FROM ingredient_products
       GROUP BY ingredient_id, coalesce(manufacturer_party_id, 0), coalesce(form, ''),
                lower(coalesce(name, ''))
      HAVING count(*) > 1
      """)

    if clashes != [] do
      raise "Products whose names differ only in case (id 'name'): " <>
              Enum.map_join(clashes, "; ", &hd/1) <>
              ". Rename or deactivate one of each before migrating."
    end

    index("lower(coalesce(name, ''))")
  end

  def down, do: index("coalesce(name, '')")

  defp index(name_key) do
    execute("DROP INDEX IF EXISTS #{@unique}")

    execute("""
    CREATE UNIQUE INDEX #{@unique} ON ingredient_products
      (ingredient_id, coalesce(manufacturer_party_id, 0), coalesce(form, ''), #{name_key})
    """)
  end
end
