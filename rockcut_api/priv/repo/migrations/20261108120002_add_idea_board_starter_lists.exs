defmodule RockcutApi.Repo.Migrations.AddIdeaBoardStarterLists do
  use Ecto.Migration

  # D53 Part 2 §4.1: every board starts with Ideas, Planned, Doing, Done.
  # Made here rather than on first open, which could race and make
  # duplicates. A board that already has lists is left alone, so running up
  # again adds nothing; down removes only starter lists that are still
  # empty, under their starting names.
  @boards ~w(brewery bar office sales company)
  @names ~w(Ideas Planned Doing Done)

  def up do
    for board <- @boards do
      execute fn ->
        %{rows: [[count]]} =
          repo().query!("SELECT COUNT(*) FROM idea_lists WHERE board = ?", [board])

        if count == 0 do
          @names
          |> Enum.with_index(1)
          |> Enum.each(fn {name, position} ->
            repo().query!(
              """
              INSERT INTO idea_lists (board, name, position, inserted_at, updated_at)
              VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%S', 'now'),
                      strftime('%Y-%m-%dT%H:%M:%S', 'now'))
              """,
              [board, name, position]
            )
          end)
        end
      end
    end
  end

  def down do
    execute fn ->
      placeholders = Enum.map_join(@names, ", ", fn _ -> "?" end)

      repo().query!(
        """
        DELETE FROM idea_lists
        WHERE name IN (#{placeholders})
          AND NOT EXISTS (SELECT 1 FROM idea_cards c WHERE c.list_id = idea_lists.id)
        """,
        @names
      )
    end
  end
end
