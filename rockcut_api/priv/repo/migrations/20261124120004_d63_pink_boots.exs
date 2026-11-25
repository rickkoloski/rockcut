defmodule RockcutApi.Repo.Migrations.D63PinkBoots do
  @moduledoc """
  D63 §5.5: Pink Boots differs every year, so each year is its own variety.
  Pink Boots Blend becomes Pink Boots '23 (its product, offer and 2023 lot
  stay), and Pink Boots '24 is created with the same maker, form, origin and
  offer (with its prices) and takes the 2024 lot: the lot's `ingredient_id`
  and `product_id` change, and its movements, features and cost go by lot,
  so they come with it. The only place a lot with movements changes product.

  Only when the rows look as seeded: one product (Yakima Chief Hops, T90
  Pellet, no name), its two lots P92-IUPBB3182 (2023) and P92-JUPBB4199
  (2024), one offer, and no Pink Boots '23 or '24 yet. Otherwise nothing
  changes and the log says why. When an order or contract line names the
  product, only the rename happens: the lines and both lots stay with '23,
  and the log says so. A fresh database, or done already: nothing happens.
  `down` does nothing (spec §9).
  """
  use Ecto.Migration
  require Logger

  @old "Pink Boots Blend"
  @y23 "Pink Boots '23"
  @y24 "Pink Boots '24"
  @lots [{"p92-iupbb3182", 2023}, {"p92-jupbb4199", 2024}]

  def up do
    case {hops(@old), hops(@y23), hops(@y24)} do
      {[], [], []} ->
        if rows("SELECT 1 FROM ingredient_products LIMIT 1", []) != [],
          do: skip("there's no #{@old}")

      {[], [_ | _], _} ->
        :ok

      {[hop], [], []} ->
        split(hop, products(hop))

      _ ->
        skip("#{@old}, #{@y23} and #{@y24} aren't as expected")
    end
  end

  def down, do: :ok

  defp split([hop, category], [
         [product, maker, "T90 Pellet", nil, origin, unit, "Yakima Chief Hops"]
       ]) do
    lots =
      rows(
        "SELECT id, lower(trim(lot_number)), crop_year, product_id FROM ingredient_lots WHERE ingredient_id = ?",
        [hop]
      )

    offers = rows("SELECT id FROM supplier_offers WHERE product_id = ?", [product])

    cond do
      Enum.sort(for [_, n, y, p] <- lots, do: {n, y, p}) !=
          Enum.map(@lots, fn {n, y} -> {n, y, product} end) ->
        skip("its lots aren't the two seeded")

      length(offers) != 1 ->
        skip("it has #{length(offers)} offers")

      true ->
        repo().query!("UPDATE ingredients SET name = ?, updated_at = ? WHERE id = ?", [
          @y23,
          now(),
          hop
        ])

        [[offer]] = offers
        lines = lines(product)

        if lines > 0 do
          Logger.warning(
            "D63: #{@old} renamed #{@y23}, but not split: #{lines} order or contract line(s) " <>
              "name it; they and both lots stay with #{@y23}"
          )
        else
          y24 = insert!("ingredients", %{"name" => @y24, "category_id" => category})

          new_product =
            insert!("ingredient_products", %{
              "ingredient_id" => y24,
              "manufacturer_party_id" => maker,
              "form" => "T90 Pellet",
              "origin" => origin,
              "unit" => unit
            })

          copy_offer(offer, new_product)
          [lot] = for [id, "p92-jupbb4199", 2024, _] <- lots, do: id

          repo().query!(
            "UPDATE ingredient_lots SET ingredient_id = ?, product_id = ?, updated_at = ? WHERE id = ?",
            [y24, new_product, now(), lot]
          )
        end
    end
  end

  defp split(_hop, _products), do: skip("its product isn't the one seeded")

  defp copy_offer(offer, product) do
    repo().query!(
      """
      INSERT INTO supplier_offers (product_id, supplier_party_id, order_name, pack_size, form,
        notes, active, pack_name, pack_note, inserted_at, updated_at)
      SELECT ?, supplier_party_id, order_name, pack_size, form, notes, active, pack_name,
        pack_note, ?, ? FROM supplier_offers WHERE id = ?
      """,
      [product, now(), now(), offer]
    )

    [[copy]] = rows("SELECT last_insert_rowid()", [])

    repo().query!(
      """
      INSERT INTO supplier_offer_prices (offer_id, price_per_pack, effective_on, note,
        entered_by_id, inserted_at, updated_at)
      SELECT ?, price_per_pack, effective_on, note, entered_by_id, inserted_at, updated_at
      FROM supplier_offer_prices WHERE offer_id = ? ORDER BY id
      """,
      [copy, offer]
    )
  end

  # Order and contract lines naming the product (contract lines by product or offer).
  defp lines(product) do
    [[orders]] =
      rows(
        "SELECT count(*) FROM purchase_order_lines l JOIN supplier_offers o ON o.id = l.offer_id " <>
          "WHERE o.product_id = ?",
        [product]
      )

    [[contracts]] =
      rows("SELECT count(*) FROM supplier_contract_lines WHERE product_id = ?", [product])

    orders + contracts
  end

  defp hops(name) do
    rows(
      "SELECT i.id, i.category_id FROM ingredients i JOIN ingredient_categories c ON c.id = i.category_id " <>
        "WHERE c.key = 'hops' AND lower(i.name) = lower(?)",
      [name]
    )
  end

  defp products([hop, _category]) do
    rows(
      """
      SELECT p.id, p.manufacturer_party_id, p.form, p.name, p.origin, p.unit, m.name
      FROM ingredient_products p LEFT JOIN parties m ON m.id = p.manufacturer_party_id
      WHERE p.ingredient_id = ?
      """,
      [hop]
    )
  end

  defp insert!(table, row) do
    row = Map.merge(row, %{"inserted_at" => now(), "updated_at" => now()})
    columns = Map.keys(row)

    repo().query!(
      "INSERT INTO #{table} (#{Enum.join(columns, ", ")}) VALUES " <>
        "(#{Enum.map_join(columns, ", ", fn _ -> "?" end)})",
      Enum.map(columns, &Map.fetch!(row, &1))
    )

    [[id]] = rows("SELECT last_insert_rowid()", [])
    id
  end

  defp skip(why), do: Logger.warning("D63: Pink Boots not split: #{why}")

  defp rows(sql, params), do: repo().query!(sql, params).rows
  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
end
