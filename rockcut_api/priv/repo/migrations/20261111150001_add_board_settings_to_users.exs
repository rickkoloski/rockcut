defmodule RockcutApi.Repo.Migrations.AddBoardSettingsToUsers do
  @moduledoc """
  D58 §3.1: task board settings per account on the server (`%{board_key =>
  %{setting => value}}`, see `RockcutApi.Accounts.BoardSettings`). Before
  this, each browser kept them in localStorage.
  """
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :board_settings, :map, null: false, default: %{}
    end
  end
end
