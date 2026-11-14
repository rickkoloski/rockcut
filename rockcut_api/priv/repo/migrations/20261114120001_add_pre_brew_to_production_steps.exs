defmodule RockcutApi.Repo.Migrations.AddPreBrewToProductionSteps do
  use Ecto.Migration

  # D56 decision 22: a step is pre-brew because it was planned that way, not
  # because of its date. Additive: an older image ignores the column.
  # Backfill, in order:
  #   1. copied from a template step at a negative day;
  #   2. added to the batch (not a retest), a plain or custom step, due
  #      before its batch's first Brew day;
  #   3. decision 25: a retest is never pre-brew (cleared, so a database
  #      where an earlier draft of this migration marked some comes out the
  #      same after a rollback and a re-run).
  def up do
    alter table(:production_steps) do
      add :pre_brew, :boolean, null: false, default: false
    end

    flush()

    for sql <- backfill(), do: execute(sql)
  end

  def down do
    alter table(:production_steps) do
      remove :pre_brew
    end
  end

  @doc "The backfill's statements, in order (`PreBrewTest` runs them too)."
  def backfill do
    [
      """
      UPDATE production_steps SET pre_brew = 1
      WHERE template_step_id IN (SELECT id FROM template_steps WHERE day_offset < 0)
      """,
      """
      UPDATE production_steps SET pre_brew = 1
      WHERE added = 1 AND retest_of_id IS NULL AND batch_id IS NOT NULL
        AND (step_type_id IS NULL AND name IS NOT NULL
             OR step_type_id IN (SELECT id FROM production_step_types WHERE behavior = 'plain'))
        AND due_on < (#{first_brew_on()})
      """,
      "UPDATE production_steps SET pre_brew = 0 WHERE retest_of_id IS NOT NULL"
    ]
  end

  # The day of production_steps' batch's first Brew day (the lowest id, as
  # `Parts.first_brew/1`).
  defp first_brew_on do
    """
    SELECT b.due_on FROM production_steps b
    JOIN production_step_types bt ON bt.id = b.step_type_id AND bt.behavior = 'brew'
    WHERE b.batch_id = production_steps.batch_id ORDER BY b.id LIMIT 1
    """
  end
end
