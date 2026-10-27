defmodule RockcutApi.Production.TaskLink do
  @moduledoc """
  D49 §3.12: production steps on the Brewery task board. The step is the
  source and its task is derived (plan decisions 5 and 6): one task per step
  with `tasks.production_step_id`, never edited on its own.

  `want/1` says what a step's task looks like (nil: no task). `sync!/1`
  runs inside a schedule write's transaction and makes the tasks match:
  every **unfinished** step, plus the steps the write touched, is compared
  with its task, and only the tasks that differ are created, updated or
  deleted. It recomputes the titles each time, so a P- or X-renumbering, a
  tank, step type or brand rename retitles every batch's tasks with no path
  of its own.

  It runs at the end of `Undo.track/4` (every schedule write), after
  `Undo.undo/2`, and after the setup writes that change titles. Tasks
  aren't Undo-tracked: Undo puts the steps back and `sync!/1` follows.
  Board-only fields stay the board's: `position` within a day (a task that
  changes day goes to the bottom of the new one), and `completed_display`,
  which is always `planned_day` (a linked task is done on its step's day).
  No change-log rows: the schedule is where linked tasks change.
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Accounts.Department
  alias RockcutApi.Brewing.Batch
  alias RockcutApi.Production.{BatchVessel, Batches, Step, Steps, Tank}
  alias RockcutApi.Tasks.Task

  @fields ~w(department_id title due_on notes assignee_id completed_at completed_on completed_by_id completed_display)a

  @doc """
  The task `step` should have, as a map of `Task` fields, or nil:

    * only a step with `on_task_list`, not a phase marker, and not on a
      pencilled batch (a standalone CIP always qualifies);
    * the title is "FV3 · Galactic #33 · Set temp - 48°" ("FV6 · CIP &
      Sanitize" for a standalone CIP, "No tank · …" when unassigned);
    * the day, notes, assignee and done state are the step's;
    * the board is the Brewery's.
  """
  def want(%Step{} = step) do
    step = Repo.preload(step, [:step_type, :phase])
    want(step, context([step], brewery_id()))
  end

  defp want(%Step{} = step, ctx) do
    batch = step.batch_id && ctx.batches[step.batch_id]

    cond do
      not step.on_task_list -> nil
      Step.marker?(step) -> nil
      batch && batch.pencilled -> nil
      true -> fields(step, batch, ctx)
    end
  end

  defp fields(step, batch, ctx) do
    tank_id =
      if batch,
        do: ctx.vessels[{batch.id, step.vessel_index}],
        else: step.tank_id

    title =
      [
        ctx.tanks[tank_id] || "No tank",
        batch && Batches.label(batch, ctx.pnums),
        Steps.name(step)
      ]
      |> Enum.reject(&is_nil/1)
      |> Enum.join(" · ")

    done? = step.done_on != nil

    %{
      department_id: ctx.brewery_id,
      title: String.slice(title, 0, Task.max_title()),
      due_on: step.due_on,
      notes: step.notes,
      assignee_id: step.assignee_id,
      completed_on: step.done_on,
      completed_by_id: if(done?, do: step.done_by_id),
      completed_at: if(done?, do: step.completed_at || noon(step.done_on)),
      completed_display: if(done?, do: "planned_day")
    }
  end

  @doc """
  Make the Brewery board's linked tasks match their steps: every unfinished
  step's, plus the steps `touched` (ids; a finished step changed by the
  write, or one that's gone). Inside the caller's transaction. Returns
  `%{created, updated, deleted}` (counts).
  """
  def sync!(touched \\ []) do
    # No Brewery, no board (a test database without departments).
    case brewery_id() do
      nil -> %{created: 0, updated: 0, deleted: 0}
      brewery_id -> sync!(Enum.uniq(touched), brewery_id)
    end
  end

  defp sync!(touched, brewery_id) do

    steps =
      Repo.all(
        from(s in Step,
          where: is_nil(s.done_on) or s.id in ^touched,
          preload: [:step_type, :phase]
        )
      )

    ctx = context(steps, brewery_id)
    step_ids = Enum.map(steps, & &1.id)

    existing =
      Repo.all(from(t in Task, where: t.production_step_id in ^step_ids))
      |> Map.new(&{&1.production_step_id, &1})

    {counts, days} =
      Enum.reduce(steps, {%{created: 0, updated: 0, deleted: 0}, []}, fn step, {counts, days} ->
        case {want(step, ctx), existing[step.id]} do
          {nil, nil} ->
            {counts, days}

          {nil, %Task{} = task} ->
            Repo.delete!(task)
            {bump(counts, :deleted), [task.due_on | days]}

          {wanted, nil} ->
            Repo.insert!(
              struct(
                %Task{
                  production_step_id: step.id,
                  position: Tasks.next_position(ctx.brewery_id, wanted.due_on)
                },
                wanted
              )
            )

            {bump(counts, :created), days}

          {wanted, %Task{} = task} ->
            changes =
              for k <- @fields, Map.get(task, k) != wanted[k], into: %{}, do: {k, wanted[k]}

            cond do
              changes == %{} ->
                {counts, days}

              Map.has_key?(changes, :due_on) ->
                position = Tasks.next_position(ctx.brewery_id, wanted.due_on)

                task
                |> Ecto.Changeset.change(Map.put(changes, :position, position))
                |> Repo.update!()

                {bump(counts, :updated), [task.due_on | days]}

              true ->
                task |> Ecto.Changeset.change(changes) |> Repo.update!()
                {bump(counts, :updated), days}
            end
        end
      end)

    # The days tasks left close up (a day's list stays 1, 2, 3, …).
    if days != [], do: Tasks.renumber_days(ctx.brewery_id, days)
    counts
  end

  @doc """
  Run `fun` (a setup write returning `{:ok, _}` or an error) and then
  `sync!/0` in one transaction: a rename that changes titles (a tank, a
  step type, a brand).
  """
  def with_sync(fun) do
    Repo.transaction(fn ->
      case fun.() do
        {:ok, result} ->
          sync!()
          result

        {:error, reason} ->
          Repo.rollback(reason)

        other ->
          Repo.rollback({__MODULE__, other})
      end
    end)
    |> case do
      {:error, {__MODULE__, other}} -> other
      result -> result
    end
  end

  ## What a title needs, loaded once

  defp context(steps, brewery_id) do
    batch_ids = steps |> Enum.map(& &1.batch_id) |> Enum.reject(&is_nil/1) |> Enum.uniq()

    batches =
      Repo.all(from(b in Batch, where: b.id in ^batch_ids, preload: [:brand, :split_parent]))
      |> Map.new(&{&1.id, &1})

    vessels =
      Repo.all(
        from(v in BatchVessel,
          where: v.batch_id in ^batch_ids,
          select: {{v.batch_id, v.vessel_index}, v.tank_id}
        )
      )
      |> Map.new()

    %{
      batches: batches,
      vessels: vessels,
      tanks: Map.new(Repo.all(from(t in Tank, select: {t.id, t.name}))),
      pnums: Batches.p_numbers(),
      brewery_id: brewery_id
    }
  end

  defp brewery_id do
    Repo.one(from(d in Department, where: d.key == "brewery", select: d.id))
  end

  defp bump(counts, key), do: Map.update!(counts, key, &(&1 + 1))

  defp noon(%Date{} = day), do: DateTime.new!(day, ~T[12:00:00], "Etc/UTC")
end
