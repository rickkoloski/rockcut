defmodule RockcutApi.Repo.Migrations.YeastHarvestBehavior do
  @moduledoc """
  D64 plan migration 12 (spec §4.8, A10): the seeded Yeast harvest step type
  gets the `yeast_harvest` behavior and becomes built in (renamed, never
  retired, like every built-in type).

    * It's found by name: the one not-retired type whose `lower(name)` is
      `yeast harvest`. With none (renamed or retired here), it **stops**
      with nothing changed, naming the types whose name has "harvest" in it,
      and Matt names the one to use.
    * Pre-brew template steps (`day_offset < 0`) and pre-brew batch steps of
      that type are logged: a harvest step isn't `plain` any more, so it can't
      be planned as pre-brew (`Steps.pre_brew_kind?/1`). Their data isn't
      changed.

  `down` puts it back to `plain`, not built in.
  """
  use Ecto.Migration
  require Logger

  def up do
    type_id = find!()

    for [id, template, day] <-
          repo().query!(
            "SELECT ts.id, t.name, ts.day_offset FROM template_steps ts " <>
              "JOIN process_templates t ON t.id = ts.template_id " <>
              "WHERE ts.step_type_id = ? AND ts.day_offset < 0 ORDER BY ts.id",
            [type_id]
          ).rows do
      Logger.warning(
        "D64: template \"#{template}\" has a pre-brew Yeast harvest step (template step #{id}, day #{day})"
      )
    end

    for [id, batch_id, due_on] <-
          repo().query!(
            "SELECT id, batch_id, due_on FROM production_steps " <>
              "WHERE step_type_id = ? AND pre_brew = 1 ORDER BY id",
            [type_id]
          ).rows do
      Logger.warning(
        "D64: batch #{batch_id} has a pre-brew Yeast harvest step (step #{id}, due #{due_on})"
      )
    end

    repo().query!(
      "UPDATE production_step_types SET behavior = 'yeast_harvest', built_in = 1 WHERE id = ?",
      [type_id]
    )
  end

  def down do
    execute(
      "UPDATE production_step_types SET behavior = 'plain', built_in = 0 WHERE behavior = 'yeast_harvest'"
    )
  end

  # The one not-retired "Yeast harvest" (any case), or stop naming what there is.
  defp find! do
    case repo().query!(
           "SELECT id FROM production_step_types " <>
             "WHERE lower(name) = 'yeast harvest' AND retired_at IS NULL"
         ).rows do
      [[id]] ->
        id

      _ ->
        found =
          repo().query!(
            "SELECT id, name, behavior, retired_at FROM production_step_types " <>
              "WHERE lower(name) LIKE '%harvest%' ORDER BY id"
          ).rows
          |> Enum.map_join("; ", fn [id, name, behavior, retired] ->
            "##{id} \"#{name}\" (#{behavior}#{if retired, do: ", retired"})"
          end)

        raise "D64: no step type named \"Yeast harvest\" that isn't retired, so nothing was changed. " <>
                "Found: #{if found == "", do: "none with \"harvest\" in the name", else: found}. " <>
                "Matt names the type to use (A10)."
    end
  end
end
