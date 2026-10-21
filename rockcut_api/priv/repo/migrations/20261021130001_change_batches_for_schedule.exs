defmodule RockcutApi.Repo.Migrations.ChangeBatchesForSchedule do
  use Ecto.Migration

  # D47 (spec §3.5): a planned batch has no number yet, so `batch_number`
  # becomes nullable and unique ignoring case; new `volume_bbl`, `template_id`
  # and `brew_two_days`. SQLite can't drop NOT NULL in place, so the table is
  # rebuilt (sqlite.org/lang_altertable.html, "other kinds of changes") with
  # foreign keys off: dropping the old table must not cascade into
  # `brew_turns` and `batch_log_entries`, which point at `batches` by name
  # and so point at the new table afterwards. `foreign_key_check` must come
  # back empty before the commit.
  @disable_ddl_transaction true
  @disable_migration_lock true

  @columns ~w(id brand_id batch_number status actual_og actual_fg actual_abv actual_volume
              ferm_start_date ferm_end_date ferm_temp package_date package_type rating
              tasting_notes notes inserted_at updated_at)

  def up do
    rebuild(
      """
      CREATE TABLE "batches_new" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT,
        "brand_id" INTEGER NOT NULL CONSTRAINT "batches_brand_id_fkey" REFERENCES "brands"("id") ON DELETE RESTRICT,
        "batch_number" TEXT,
        "status" TEXT DEFAULT 'planned' NOT NULL,
        "actual_og" DECIMAL, "actual_fg" DECIMAL, "actual_abv" DECIMAL, "actual_volume" DECIMAL,
        "ferm_start_date" TEXT, "ferm_end_date" TEXT, "ferm_temp" DECIMAL,
        "package_date" TEXT, "package_type" TEXT,
        "rating" INTEGER, "tasting_notes" TEXT, "notes" TEXT,
        "volume_bbl" DECIMAL,
        "template_id" INTEGER CONSTRAINT "batches_template_id_fkey" REFERENCES "process_templates"("id") ON DELETE SET NULL,
        "brew_two_days" INTEGER DEFAULT false NOT NULL,
        "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL
      )
      """,
      [
        ~s|CREATE INDEX "batches_brand_id_index" ON "batches" ("brand_id")|,
        ~s|CREATE INDEX "batches_template_id_index" ON "batches" ("template_id")|,
        ~s|CREATE UNIQUE INDEX "batches_lower_batch_number_index" ON "batches" (lower("batch_number"))|
      ]
    )
  end

  # Back to the D1 table: only when every batch has a number.
  def down do
    rebuild(
      """
      CREATE TABLE "batches_new" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT,
        "brand_id" INTEGER NOT NULL CONSTRAINT "batches_brand_id_fkey" REFERENCES "brands"("id") ON DELETE RESTRICT,
        "batch_number" TEXT NOT NULL,
        "status" TEXT DEFAULT 'planned' NOT NULL,
        "actual_og" DECIMAL, "actual_fg" DECIMAL, "actual_abv" DECIMAL, "actual_volume" DECIMAL,
        "ferm_start_date" TEXT, "ferm_end_date" TEXT, "ferm_temp" DECIMAL,
        "package_date" TEXT, "package_type" TEXT,
        "rating" INTEGER, "tasting_notes" TEXT, "notes" TEXT,
        "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL
      )
      """,
      [
        ~s|CREATE INDEX "batches_brand_id_index" ON "batches" ("brand_id")|,
        ~s|CREATE UNIQUE INDEX "batches_batch_number_index" ON "batches" ("batch_number")|
      ]
    )
  end

  defp rebuild(create_sql, index_sqls) do
    cols = Enum.map_join(@columns, ", ", &~s|"#{&1}"|)

    repo().checkout(fn ->
      repo().query!("PRAGMA foreign_keys = OFF")

      try do
        {:ok, _} =
          repo().transaction(fn ->
            repo().query!(create_sql)
            repo().query!(~s|INSERT INTO "batches_new" (#{cols}) SELECT #{cols} FROM "batches"|)
            repo().query!(~s|DROP TABLE "batches"|)
            repo().query!(~s|ALTER TABLE "batches_new" RENAME TO "batches"|)
            Enum.each(index_sqls, &repo().query!/1)

            case repo().query!("PRAGMA foreign_key_check") do
              %{rows: []} -> :ok
              %{rows: rows} -> raise "foreign_key_check failed: #{inspect(rows)}"
            end
          end)
      after
        repo().query!("PRAGMA foreign_keys = ON")
      end
    end)
  end
end
