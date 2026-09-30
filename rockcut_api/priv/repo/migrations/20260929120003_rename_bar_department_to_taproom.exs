defmodule RockcutApi.Repo.Migrations.RenameBarDepartmentToTaproom do
  @moduledoc """
  D32: staff call the Bar department the Taproom. Display name only; the key
  stays `bar`. A name an owner has already changed is left alone.
  """
  use Ecto.Migration

  def up do
    execute "UPDATE departments SET name = 'Taproom' WHERE key = 'bar' AND name = 'Bar'"
    execute ~s(UPDATE positions SET "group" = 'Taproom' WHERE "group" = 'Bar')
  end

  def down do
    execute "UPDATE departments SET name = 'Bar' WHERE key = 'bar' AND name = 'Taproom'"
    execute ~s(UPDATE positions SET "group" = 'Bar' WHERE "group" = 'Taproom')
  end
end
