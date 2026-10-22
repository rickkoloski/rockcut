defmodule RockcutApi.Repo.Migrations.AddSplitStaysAndLinks do
  use Ecto.Migration

  # D48 DEV QA fix cycle 4: which part of a split stays in the parent's tank
  # (`split_stays`, on the part; X1, X2), and the parent's links into and out
  # of the steps the split moved, as part ids (`split_links`; X3), so Undo
  # split can put them back.
  def up do
    alter table(:batches) do
      add :split_stays, :boolean, default: false, null: false
      add :split_links, :map
    end

    flush()

    # Splits made before this: the part whose first tank is the parent's
    # last one stays.
    execute("""
    UPDATE batches SET split_stays = 1
    WHERE split_parent_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM batch_vessels cv, batch_vessels pv
      WHERE cv.batch_id = batches.id AND cv.vessel_index = 0 AND cv.tank_id IS NOT NULL
        AND pv.batch_id = batches.split_parent_id AND pv.tank_id = cv.tank_id
        AND pv.vessel_index =
          (SELECT MAX(vessel_index) FROM batch_vessels WHERE batch_id = batches.split_parent_id)
    )
    """)
  end

  def down do
    alter table(:batches) do
      remove :split_stays
      remove :split_links
    end
  end
end
