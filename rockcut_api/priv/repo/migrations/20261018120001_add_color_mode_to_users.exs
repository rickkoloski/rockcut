defmodule RockcutApi.Repo.Migrations.AddColorModeToUsers do
  use Ecto.Migration

  # D43: the app's theme, per person and per shared device (device accounts are
  # users too): "light", "dark" or "device" (follow the browser's setting).
  def change do
    alter table(:users) do
      add :color_mode, :string, null: false, default: "light"
    end
  end
end
