defmodule RockcutApi.Repo.Migrations.AddColorShadeToPositions do
  use Ecto.Migration

  def change do
    alter table(:positions) do
      # Per-position shade (HSL lightness 0..1) of the department's hue. Null =
      # fall back to the deterministic position-derived shade.
      add :color_shade, :float
    end
  end
end
