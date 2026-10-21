defmodule RockcutApi.Production.Steps do
  @moduledoc """
  D47 §3.5 and §3.7: a scheduled batch's steps. Moving them (with the move
  prompt), checking them off and un-checking them, and the step dialog's
  edits.

  **Following** steps are the unfinished steps reachable from the moved
  one(s) along links, not passing through a finished step (it doesn't move,
  so what comes after it isn't pulled along). Finished steps never move.

  **The move prompt** is answered `move_all` (the moved steps and every
  following step) or `move_only` (just the moved steps). Its default is
  `move_only` when every link out of the first moved step is `move_only`,
  otherwise `move_all`. With nothing following there's no prompt.

  **Previews** (plan decision 4): `move/3` and `complete/4` with
  `preview: true` work out the same plan in memory and return it without
  writing: the moved and following steps with their new dates, the default
  answer, and per answer the links that would run backwards and the
  P-numbers that would change. Applying uses the same functions.
  """
  import Ecto.Query, only: [from: 2]

  alias Ecto.Changeset
  alias RockcutApi.{Accounts, Authz, Repo, Tasks}
  alias RockcutApi.Accounts.User
  alias RockcutApi.Brewing.Batch
  alias RockcutApi.Production.{Batches, Phase, Step, StepLink, StepType}

  @answers ~w(move_all move_only)
  @max_days 365

  ## Names

  @doc ~S"""
  A step's name: "FDH", "Dry hop - #2", "Set temp - 52°", "Split - Filter",
  "Package - Partial - kegs", "Brew day - 1 of 2", a custom step's own name,
  or a marker's phase. Needs `step_type` and `phase` preloaded.
  """
  def name(%Step{step_type: nil} = s) do
    case s.phase do
      %Phase{name: name} -> name
      _ -> s.name || "Phase start"
    end
  end

  def name(%Step{step_type: %StepType{} = type} = s) do
    [
      if(type.behavior == "plain" and s.name, do: s.name, else: type.name),
      if(type.behavior == "set_temp" and s.temperature, do: "#{s.temperature}°"),
      if(type.behavior == "split", do: RockcutApi.Production.split_method_label(s.split_method)),
      if(type.behavior == "package" and s.package_partial, do: "Partial"),
      s.detail
    ]
    |> Enum.reject(&is_nil/1)
    |> Enum.join(" - ")
  end

  @doc "The step's behavior (\"brew\", \"cip\", …), nil for a marker. Needs `step_type`."
  def behavior(%Step{step_type: %StepType{behavior: b}}), do: b
  def behavior(%Step{}), do: nil

  @doc """
  Whether `step` is its batch's first Brew day: the batch's Brew day with
  the lowest id, among `steps` (the batch's steps, `step_type` preloaded).
  """
  def first_brew?(%Step{} = step, steps) do
    behavior(step) == "brew" and
      step.id ==
        steps
        |> Enum.filter(&(&1.batch_id == step.batch_id and behavior(&1) == "brew"))
        |> Enum.map(& &1.id)
        |> Enum.min(fn -> nil end)
  end

  ## The link graph

  # Every step of the batches the steps `ids` belong to (standalone CIPs:
  # just themselves), with their links. `:not_found` if any id is missing.
  defp graph!(ids) do
    rows = Repo.all(from(s in Step, where: s.id in ^ids, select: {s.id, s.batch_id}))
    if length(rows) != length(Enum.uniq(ids)), do: Repo.rollback(:not_found)

    batch_ids = rows |> Enum.map(&elem(&1, 1)) |> Enum.reject(&is_nil/1) |> Enum.uniq()
    standalone = for {id, nil} <- rows, do: id

    steps =
      Repo.all(
        from(s in Step,
          where: s.batch_id in ^batch_ids or s.id in ^standalone,
          preload: [:step_type, :phase]
        )
      )

    step_ids = Enum.map(steps, & &1.id)
    links = Repo.all(from(l in StepLink, where: l.from_step_id in ^step_ids))

    %{
      steps: Map.new(steps, &{&1.id, &1}),
      out: Enum.group_by(links, & &1.from_step_id),
      links: links
    }
  end

  @doc false
  def following_ids(graph, ids) do
    start = MapSet.new(ids)

    walk(ids, MapSet.new(), graph)
    |> MapSet.difference(start)
    |> MapSet.to_list()
  end

  defp walk([], seen, _graph), do: seen

  defp walk([id | rest], seen, graph) do
    next =
      for l <- Map.get(graph.out, id, []),
          to = graph.steps[l.to_step_id],
          (to && is_nil(to.done_on)) and not MapSet.member?(seen, to.id),
          do: to.id

    walk(next ++ rest, MapSet.union(seen, MapSet.new(next)), graph)
  end

  # The move: the steps moved, the following ones, and the default answer.
  defp plan(graph, moved, days) do
    first = Enum.min_by(moved, &{Date.to_gregorian_days(&1.due_on), &1.id})
    ids = Enum.map(moved, & &1.id)

    following =
      graph
      |> following_ids(ids)
      |> Enum.map(&graph.steps[&1])
      |> Enum.sort_by(&{Date.to_gregorian_days(&1.due_on), &1.position, &1.id})

    out =
      case Map.get(graph.out, first.id, []) do
        [] -> Enum.flat_map(ids, &Map.get(graph.out, &1, []))
        links -> links
      end

    default =
      cond do
        following == [] -> nil
        out != [] and Enum.all?(out, &(&1.default_answer == "move_only")) -> "move_only"
        true -> "move_all"
      end

    %{days: days, first: first, moved: moved, following: following, default: default}
  end

  # `%{step_id => new date}` for an answer.
  defp changes(plan, answer) do
    steps = if answer == "move_all", do: plan.moved ++ plan.following, else: plan.moved
    Map.new(steps, &{&1.id, Date.add(&1.due_on, plan.days)})
  end

  @doc """
  Whether the link from `from` to `to` runs backwards: `to` is dated before
  the step it follows, and they aren't both done. The move prompt's warning
  and the "Steps out of order" flag both use it; `due` and `done?` give a
  step's date and whether it's done after the change being previewed.
  """
  def out_of_order?(from, to, due \\ & &1.due_on, done? \\ &(&1.done_on != nil)) do
    not (done?.(from) and done?.(to)) and Date.compare(due.(to), due.(from)) == :lt
  end

  # The links that would run backwards after `changes` (one end changed);
  # `done` the steps checked off by it.
  defp out_of_order(graph, changes, done \\ []) do
    due = &Map.get(changes, &1.id, &1.due_on)
    done? = &(&1.done_on != nil or &1.id in done)

    for l <- graph.links,
        Map.has_key?(changes, l.from_step_id) or Map.has_key?(changes, l.to_step_id),
        from = graph.steps[l.from_step_id],
        to = graph.steps[l.to_step_id],
        from && to && out_of_order?(from, to, due, done?) do
      %{from_step_id: from.id, from_name: name(from), to_step_id: to.id, to_name: name(to)}
    end
  end

  # `done`: the steps the change checks off; `leaving`: the batches it takes
  # off the P-number list (a first Brew day: the batch is brewed).
  defp preview(graph, plan, done \\ [], leaving \\ []) do
    pnums = Batches.p_numbers()

    per_answer = fn f ->
      Map.new(@answers, fn a -> {a, f.(changes(plan, a))} end)
    end

    %{
      days: plan.days,
      batch_id: plan.first.batch_id,
      batch_label: batch_label(plan.first.batch_id, pnums),
      moved: Enum.map(plan.moved, &brief(&1, plan.days)),
      following: Enum.map(plan.following, &brief(&1, plan.days)),
      default_answer: plan.default,
      out_of_order: per_answer.(&out_of_order(graph, &1, done)),
      renumbered: per_answer.(&Batches.renumbered(pnums, Batches.p_numbers(&1, leaving)))
    }
  end

  defp brief(%Step{} = s, days) do
    %{id: s.id, name: name(s), due_on: s.due_on, new_due_on: Date.add(s.due_on, days)}
  end

  defp batch_label(nil, _pnums), do: nil

  defp batch_label(batch_id, pnums) do
    Repo.get!(Batch, batch_id) |> Repo.preload(:brand) |> Batches.label(pnums)
  end

  defp write_dates!(graph, changes) do
    for {id, date} <- changes do
      graph.steps[id] |> Changeset.change(due_on: date) |> Repo.update!()
    end
  end

  ## Moving

  @doc """
  Move the steps `ids` by `days` (whole days, not 0, at most a year).
  `answer`: `move_all` / `move_only`; required when steps follow
  (`{:answer_required, preview}`). A finished step can't move
  (`:step_done`).

  `preview: true` returns `{:ok, {:preview, preview}}` and writes nothing.
  Otherwise `{:ok, %{batch_ids, renumbered, out_of_order}}`.
  """
  def move(ids, days, opts \\ []) do
    Repo.transaction(fn ->
      days = days!(days)
      ids = ids!(ids)
      answer = answer!(opts[:answer])
      graph = graph!(ids)
      moved = Enum.map(ids, &graph.steps[&1])
      if Enum.any?(moved, & &1.done_on), do: Repo.rollback(:step_done)
      plan = plan(graph, moved, days)

      cond do
        opts[:preview] ->
          {:preview, preview(graph, plan)}

        plan.following != [] and is_nil(answer) ->
          Repo.rollback({:answer_required, preview(graph, plan)})

        true ->
          changes = changes(plan, answer || "move_only")
          {_, renumbered} = Batches.with_renumbering(fn -> write_dates!(graph, changes) end)

          %{
            batch_ids: batch_ids(Map.keys(changes), graph),
            renumbered: renumbered,
            out_of_order: out_of_order(graph, changes)
          }
      end
    end)
  end

  ## Checking off

  @doc """
  Check off `step` (§3.7) as `actor`: `done_on` (default today; not in the
  future), and for a planned batch's first Brew day its `batch_number`
  (`Batches.check_number/2`; the batch becomes `fermenting`). Done on
  another day than planned, the step moves to that day and `answer` says
  what happens to the following steps, as in `move/3`. A full Package
  completes the batch; a partial one changes nothing.

  `preview: true` returns `{:ok, {:preview, %{move, done_on,
  needs_batch_number, next_batch_number}}}` (`move` nil when it's done on
  plan). Otherwise `{:ok, %{batch_ids, renumbered, out_of_order}}`.
  """
  def complete(id, attrs, %User{} = actor, opts \\ []) do
    attrs = stringify(attrs)

    Repo.transaction(fn ->
      graph = graph!([to_int(id) || Repo.rollback(:not_found)])
      step = graph.steps[to_int(id)]
      if step.done_on, do: Repo.rollback(:step_done)
      today = opts[:today] || Tasks.today()
      done_on = done_on!(attrs["done_on"], today)
      answer = answer!(attrs["answer"])
      batch = step.batch_id && Repo.get!(Batch, step.batch_id)

      numbering? =
        batch != nil and batch.status == "planned" and first_brew?(step, Map.values(graph.steps))

      days = Date.diff(done_on, step.due_on)
      plan = if days != 0, do: plan(graph, [step], days)
      leaving = if numbering?, do: [batch.id], else: []

      if opts[:preview] do
        {:preview,
         %{
           move: plan && preview(graph, plan, [step.id], leaving),
           done_on: done_on,
           needs_batch_number: numbering?,
           next_batch_number: if(numbering?, do: Batches.next_batch_number())
         }}
      else
        number =
          if numbering? do
            case Batches.check_number(attrs["batch_number"], batch) do
              {:ok, n} -> n
              {:error, reason} -> Repo.rollback(reason)
            end
          end

        if plan && plan.following != [] && is_nil(answer),
          do: Repo.rollback({:answer_required, preview(graph, plan, [step.id], leaving)})

        changes = if plan, do: changes(plan, answer || "move_only"), else: %{}

        {_, renumbered} =
          Batches.with_renumbering(fn ->
            write_dates!(graph, Map.delete(changes, step.id))

            step
            |> Changeset.change(
              due_on: done_on,
              done_on: done_on,
              done_by_id: actor.id,
              completed_at: DateTime.utc_now() |> DateTime.truncate(:second)
            )
            |> Repo.update!()

            cond do
              numbering? ->
                batch
                |> Changeset.change(status: "fermenting", batch_number: number)
                |> Repo.update!()

              batch && behavior(step) == "package" && not step.package_partial ->
                batch |> Changeset.change(status: "completed") |> Repo.update!()

              true ->
                :ok
            end
          end)

        %{
          batch_ids: batch_ids([step.id | Map.keys(changes)], graph),
          renumbered: renumbered,
          out_of_order: out_of_order(graph, Map.put(changes, step.id, done_on), [step.id])
        }
      end
    end)
  end

  @doc """
  Un-check `step` (`:not_done` if it isn't done). Its first Brew day makes
  the batch planned again and frees its number (`message` says so); a full
  Package makes a completed batch `fermenting` again. The step keeps its date.
  `{:ok, %{batch_ids, renumbered, message}}`.
  """
  def uncomplete(id) do
    Repo.transaction(fn ->
      graph = graph!([to_int(id) || Repo.rollback(:not_found)])
      step = graph.steps[to_int(id)]
      unless step.done_on, do: Repo.rollback(:not_done)
      batch = step.batch_id && Repo.get!(Batch, step.batch_id) |> Repo.preload(:brand)
      first_brew? = batch != nil and first_brew?(step, Map.values(graph.steps))

      {message, renumbered} =
        Batches.with_renumbering(fn ->
          step
          |> Changeset.change(done_on: nil, done_by_id: nil, completed_at: nil)
          |> Repo.update!()

          cond do
            first_brew? and batch.status != "planned" ->
              label = Batches.label(batch, %{})
              batch |> Changeset.change(status: "planned", batch_number: nil) |> Repo.update!()

              if batch.batch_number,
                do: "#{label} is planned again; its number is freed.",
                else: "#{label} is planned again."

            batch && batch.status == "completed" && behavior(step) == "package" &&
                not step.package_partial ->
              batch |> Changeset.change(status: "fermenting") |> Repo.update!()
              nil

            true ->
              nil
          end
        end)

      %{batch_ids: batch_ids([step.id], graph), renumbered: renumbered, message: message}
    end)
  end

  ## The step dialog

  @doc """
  Edit a step: `detail`, `temperature` (Set temp, required there; Brew
  day's starting temperature), `package_partial` (an unfinished Package;
  `:step_done` once done), `notes`, `on_task_list`, `assignee_id` (a Brewery
  member, or nil). Other fields are ignored.
  """
  def update(%Step{} = step, attrs) do
    step = Repo.preload(step, :step_type)
    b = behavior(step)
    attrs = stringify(attrs)

    attrs =
      attrs
      |> then(&if(b in ["set_temp", "brew"], do: &1, else: Map.delete(&1, "temperature")))
      |> then(&if(b == "package", do: &1, else: Map.delete(&1, "package_partial")))

    if Map.has_key?(attrs, "package_partial") and step.done_on != nil and
         truthy?(attrs["package_partial"]) != step.package_partial do
      {:error, :step_done}
    else
      step
      |> Step.edit_changeset(attrs)
      |> then(
        &if(b == "set_temp",
          do: Changeset.validate_required(&1, [:temperature], message: "Enter the temperature."),
          else: &1
        )
      )
      |> validate_assignee()
      |> Repo.update()
    end
  end

  @doc "Assign the steps `ids` to `assignee_id` (a Brewery member) or nobody (nil)."
  def assign(ids, assignee_id) do
    Repo.transaction(fn ->
      ids = ids!(ids)
      assignee_id = blank_to_nil(assignee_id) && to_int(assignee_id)

      if assignee_id && not assignable?(assignee_id),
        do: Repo.rollback(:assignee_invalid)

      graph = graph!(ids)

      Repo.update_all(from(s in Step, where: s.id in ^ids),
        set: [
          assignee_id: assignee_id,
          updated_at: DateTime.utc_now() |> DateTime.truncate(:second)
        ]
      )

      %{batch_ids: batch_ids(ids, graph)}
    end)
  end

  defp validate_assignee(changeset) do
    Changeset.validate_change(changeset, :assignee_id, fn :assignee_id, id ->
      if assignable?(id), do: [], else: [assignee_id: "must be a Brewery member"]
    end)
  end

  defp assignable?(id),
    do: Authz.can_take_task?(Accounts.get_user(id), "brewery")

  ## Helpers

  defp batch_ids(step_ids, graph) do
    step_ids
    |> Enum.map(&graph.steps[&1].batch_id)
    |> Enum.reject(&is_nil/1)
    |> Enum.uniq()
  end

  defp days!(days) do
    case to_int(days) do
      d when is_integer(d) and d != 0 and abs(d) <= @max_days -> d
      _ -> Repo.rollback(:days_invalid)
    end
  end

  defp ids!(ids) when is_list(ids) and ids != [] do
    ints = Enum.map(ids, &to_int/1)
    if Enum.any?(ints, &is_nil/1), do: Repo.rollback(:not_found)
    Enum.uniq(ints)
  end

  defp ids!(_), do: Repo.rollback(:not_found)

  defp answer!(nil), do: nil
  defp answer!(a) when a in @answers, do: a
  defp answer!(_), do: Repo.rollback(:answer_invalid)

  defp done_on!(nil, today), do: today
  defp done_on!("", today), do: today

  defp done_on!(value, today) do
    case Date.from_iso8601(to_string(value)) do
      {:ok, d} -> if Date.compare(d, today) == :gt, do: Repo.rollback(:done_on_future), else: d
      _ -> Repo.rollback(:done_on_invalid)
    end
  end

  defp stringify(attrs), do: Map.new(attrs, fn {k, v} -> {to_string(k), v} end)
  defp truthy?(v), do: v in [true, "true", 1, "1"]
  defp blank_to_nil(v) when v in [nil, ""], do: nil
  defp blank_to_nil(v), do: v
  defp to_int(v), do: Batches.to_int(v)
end
