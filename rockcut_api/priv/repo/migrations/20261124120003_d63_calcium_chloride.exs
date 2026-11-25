defmodule RockcutApi.Repo.Migrations.D63CalciumChloride do
  @moduledoc """
  D63 §5.4: the calcium chloride in use is anhydrous, so the Hydrous
  ingredient's one product (Flake, lb, None) moves to the Anhydrous
  ingredient; its offer and price go by product, so they come with it. The
  Hydrous ingredient stays, with no product. Left as it is and logged when
  the rows aren't as expected, the product has a lot, or Anhydrous already
  has a product. Moved already, or neither ingredient there (a fresh
  database): nothing happens. `down` does nothing (spec §9).
  """
  use Ecto.Migration
  require Logger

  @hydrous "Calcium Chloride (Hydrous)"
  @anhydrous "Calcium Chloride (Anhydrous)"

  def up do
    case {ingredients(@hydrous), ingredients(@anhydrous)} do
      {[], []} ->
        :ok

      {[[hydrous]], [[anhydrous]]} ->
        move(hydrous, anhydrous, products(hydrous), products(anhydrous))

      _ ->
        skip("the Hydrous and Anhydrous ingredients aren't as expected")
    end
  end

  def down, do: :ok

  # Moved already (or no product to move).
  defp move(_hydrous, _anhydrous, [], [_ | _]), do: :ok
  defp move(_hydrous, _anhydrous, [], []), do: skip("Hydrous has no product")
  defp move(_hydrous, _anhydrous, [_ | _], [_ | _]), do: skip("Anhydrous already has a product")

  defp move(_hydrous, anhydrous, [[id, "Flake", "lb", nil, nil]], []) do
    case rows("SELECT count(*) FROM ingredient_lots WHERE product_id = ?", [id]) do
      [[0]] ->
        repo().query!(
          "UPDATE ingredient_products SET ingredient_id = ?, lock_version = lock_version + 1, " <>
            "updated_at = ? WHERE id = ?",
          [anhydrous, now(), id]
        )

      [[n]] ->
        skip("the product has #{n} lot(s)")
    end
  end

  defp move(_hydrous, _anhydrous, _products, []),
    do: skip("Hydrous's product isn't the one seeded (Flake, lb, None)")

  # In Water Salts, or at the top of Other Consumables.
  defp ingredients(name) do
    rows(
      """
      SELECT i.id FROM ingredients i
      JOIN ingredient_categories c ON c.id = i.category_id
      LEFT JOIN ingredient_categories p ON p.id = c.parent_id
      WHERE lower(i.name) = lower(?) AND coalesce(c.key, p.key) = 'consumables'
      """,
      [name]
    )
  end

  defp products(ingredient_id) do
    rows(
      "SELECT id, form, unit, manufacturer_party_id, name FROM ingredient_products WHERE ingredient_id = ?",
      [ingredient_id]
    )
  end

  defp skip(why), do: Logger.warning("D63: calcium chloride's product not moved: #{why}")

  defp rows(sql, params), do: repo().query!(sql, params).rows
  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
end
