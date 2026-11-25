defmodule RockcutApi.Repo.Migrations.D63BackfillUsePosition do
  @moduledoc """
  D63 §4.1: each hop's use lists (a variety and a form, across makers) start
  by received date, then crop year, then lot id. Hops by the category's key,
  its own or its parent's, never the name. A lot that already has a position
  keeps it, and the rest go after it. No rows (a fresh database): nothing
  happens. `down` does nothing: the column's own migration drops it.
  """
  use Ecto.Migration

  def up do
    rows("""
    SELECT l.id, l.ingredient_id, coalesce(p.form, ''), l.use_position
    FROM ingredient_lots l
    JOIN ingredients i ON i.id = l.ingredient_id
    JOIN ingredient_categories c ON c.id = i.category_id
    LEFT JOIN ingredient_categories cp ON cp.id = c.parent_id
    LEFT JOIN ingredient_products p ON p.id = l.product_id
    WHERE coalesce(c.key, cp.key) = 'hops'
    ORDER BY l.received_date, l.crop_year, l.id
    """)
    |> Enum.group_by(fn [_, ingredient, form, _] -> {ingredient, form} end)
    |> Enum.each(fn {_list, lots} ->
      last = lots |> Enum.map(&(List.last(&1) || 0)) |> Enum.max()

      for {[id | _], position} <-
            lots |> Enum.filter(&is_nil(List.last(&1))) |> Enum.with_index(last + 1) do
        repo().query!("UPDATE ingredient_lots SET use_position = ? WHERE id = ?", [position, id])
      end
    end)
  end

  def down, do: :ok

  defp rows(sql), do: repo().query!(sql).rows
end
