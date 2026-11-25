defmodule RockcutApi.Repo.Migrations.D63ProcessAids do
  @moduledoc """
  D63 §5.1: Other Consumables' child Finings is renamed Process Aids, found
  by the parent's key and the child's name in any case. Nothing to rename
  (a fresh database, or renamed already): nothing happens. A Process Aids
  already there beside Finings stops the release with a message (a category
  name is unique, wherever it is). `down` does nothing: a rollback restores
  the pre-release snapshot (spec §9).
  """
  use Ecto.Migration
  require Logger

  def up do
    finings =
      rows("""
      SELECT c.id, c.name FROM ingredient_categories c
      JOIN ingredient_categories p ON p.id = c.parent_id
      WHERE p.key = 'consumables' AND lower(trim(c.name)) = 'finings'
      ORDER BY c.id
      """)

    case finings do
      [] ->
        :ok

      [[id, _name]] ->
        stop_on_duplicate!()
        now = DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()

        repo().query!(
          "UPDATE ingredient_categories SET name = 'Process Aids', updated_at = ? WHERE id = ?",
          [now, id]
        )

      many ->
        names = Enum.map_join(many, ", ", fn [_, name] -> name end)

        Logger.warning(
          "D63: Finings not renamed: more than one under Other Consumables (#{names})"
        )
    end
  end

  def down, do: :ok

  defp stop_on_duplicate! do
    case rows("SELECT name FROM ingredient_categories WHERE lower(trim(name)) = 'process aids'") do
      [] ->
        :ok

      [[name] | _] ->
        raise "D63: there's already a category named #{name}, so Finings can't be renamed " <>
                "Process Aids; move its ingredients into Finings and delete it (or rename it) first"
    end
  end

  defp rows(sql), do: repo().query!(sql).rows
end
