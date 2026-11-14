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

  **Pre-brew steps** (D56 §3.1, decision 2) are a batch's unfinished steps
  planned before its first Brew day (`pre_brew/1`; decision 22: the step's
  `pre_brew`, not its date). Whatever moves that Brew
  day moves them by the same days, whatever the answer; they aren't
  following steps, so they don't make a prompt. None may end up on brew day
  or later (`{:before_brew_day, :pre_brew}`). Decision 11: one checked off
  on or after brew day stays on its planned day and moves nothing.

  **Test results** (D56 §3.2): a step whose type `has_result` is checked off
  with `result` `pass` / `fail`; a Fail with `fail_action` `retest` adds a
  retest (`retest_of_id`) `retest_days` after the done day, the failed
  step's outgoing links move to it, and the following steps get **one**
  move prompt for the shift from the step's planned day to the retest's.
  Mark not done, Undo and a Fail changed to Pass take the retest away again
  while it isn't done (`:retest_done`).
  """
  import Ecto.Query, only: [from: 2]

  alias Ecto.Changeset
  alias RockcutApi.{Accounts, Authz, Repo, Tasks}
  alias RockcutApi.Accounts.User
  alias RockcutApi.Brewing.Batch
  alias RockcutApi.Production.{Batches, Parts, Phase, Step, StepLink, StepType}

  @answers ~w(move_all move_only)
  # What empties a tank (D48 DEV QA Y2).
  @exits ~w(split transfer package)
  @max_days 365

  ## Names

  @doc ~S"""
  A step's name: "FDH", "Dry hop - #2", "Set temp - 52°", "Split - Filter",
  "Package - Partial - kegs", "Brew day - 1 of 2", a custom step's own name,
  or a marker's phase. Needs `step_type` and `phase` preloaded.
  """
  def name(%Step{step_type_id: nil, name: name}) when is_binary(name), do: name

  def name(%Step{step_type: nil} = s) do
    case s.phase do
      %Phase{name: name} -> name
      _ -> s.name || "Phase start"
    end
  end

  def name(%Step{step_type: %StepType{} = type} = s) do
    [
      cond do
        type.behavior == "plain" and s.name -> s.name
        type.behavior == "cip" -> RockcutApi.Production.cip_name(type.name, s.cip_method)
        true -> type.name
      end,
      if(type.behavior == "set_temp" and s.temperature, do: "#{s.temperature}°"),
      if(type.behavior == "split", do: RockcutApi.Production.split_method_label(s.split_method)),
      if(type.behavior == "package" and s.package_partial, do: "Partial"),
      s.detail
    ]
    |> Enum.reject(&is_nil/1)
    |> Enum.join(" - ")
  end

  @doc """
  D49 §3.12a: a CIP's variant, `sanitize_full` (also when it has none),
  `no_sani` or `sanitize`.
  """
  def cip_method(%{cip_method: m}) when m in ["no_sani", "sanitize"], do: m
  def cip_method(_), do: "sanitize_full"

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

  @doc """
  D56 §3.1: the pre-brew steps among one batch's `steps` (`step_type`
  preloaded): the unfinished ones planned before its first Brew day
  (decision 22: `pre_brew`, not the date; a step left before brew day some
  other way is an ordinary step, out of order). A batch without a Brew day
  (a split part) has none.
  """
  def pre_brew(steps) do
    case Parts.first_brew(steps) do
      nil ->
        []

      brew ->
        Enum.filter(steps, &(&1.pre_brew and is_nil(&1.done_on) and &1.batch_id == brew.batch_id))
    end
  end

  ## The link graph

  # Every step of the batches the steps `ids` belong to (standalone CIPs:
  # just themselves), with their links. `:not_found` if any id is missing.
  # D48 DEV QA Y1: a split batch comes with its whole family (the parent and
  # every part), and the parent's Split links to each part's first steps
  # (`Parts.split_links/3`), so a move walks on into the parts.
  defp graph!(ids) do
    rows = Repo.all(from(s in Step, where: s.id in ^ids, select: {s.id, s.batch_id}))
    if length(rows) != length(Enum.uniq(ids)), do: Repo.rollback(:not_found)

    batch_ids = rows |> Enum.map(&elem(&1, 1)) |> Enum.reject(&is_nil/1) |> Enum.uniq()
    standalone = for {id, nil} <- rows, do: id

    roots =
      Repo.all(
        from(b in Batch, where: b.id in ^batch_ids, select: coalesce(b.split_parent_id, b.id))
      )
      |> Enum.uniq()

    family =
      Repo.all(
        from(b in Batch,
          where: b.id in ^roots or b.split_parent_id in ^roots,
          select: {b.id, b.split_parent_id}
        )
      )

    steps =
      Repo.all(
        from(s in Step,
          where: s.batch_id in ^Enum.map(family, &elem(&1, 0)) or s.id in ^standalone,
          preload: [:step_type, :phase]
        )
      )

    step_ids = Enum.map(steps, & &1.id)
    links = Repo.all(from(l in StepLink, where: l.from_step_id in ^step_ids))
    by_batch = Enum.group_by(steps, & &1.batch_id)
    links = links ++ split_links(family, by_batch, links)

    %{
      steps: Map.new(steps, &{&1.id, &1}),
      out: Enum.group_by(links, & &1.from_step_id),
      links: links,
      parts:
        for({id, parent} <- family, parent, do: {parent, id})
        |> Enum.group_by(&elem(&1, 0), &elem(&1, 1))
    }
  end

  defp split_links(family, by_batch, links) do
    for {part, parent} <- family,
        parent,
        split = by_batch |> Map.get(parent, []) |> Enum.find(&(behavior(&1) == "split")),
        split,
        l <- Parts.split_links(split, Map.get(by_batch, part, []), links),
        do: l
  end

  # A batch's Split step in `graph`, or nil.
  defp split_parts(graph, %Step{} = split) do
    if behavior(split) == "split", do: Map.get(graph.parts, split.batch_id, []), else: []
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
  # D48 DEV QA Y1: a moved Split carries its parts' steps whatever the
  # answer (`carried`); the parts are only reached as following steps
  # through a Split that follows.
  # `pinned`: steps whose new date isn't `days` away (D56: a failed test
  # stays on its done day while the steps after it move to its retest).
  defp plan(graph, moved, days, pinned \\ %{}) do
    first = Enum.min_by(moved, &{Date.to_gregorian_days(&1.due_on), &1.id})
    ids = Enum.map(moved, & &1.id)
    carried = Enum.flat_map(moved, &part_steps!(graph, &1)) |> Enum.reject(&(&1.id in ids))

    following =
      graph
      |> following_ids(ids ++ Enum.map(carried, & &1.id))
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

    %{
      days: days,
      pinned: pinned,
      first: first,
      moved: moved,
      carried: carried,
      following: following,
      default: default
    }
  end

  defp new_due(plan, %Step{} = s), do: Map.get(plan.pinned, s.id) || Date.add(s.due_on, plan.days)

  # The steps of `split`'s parts (none for another step), refused while one
  # of them is done (`:part_done`): the parts move with their split as one.
  defp part_steps!(graph, %Step{} = split) do
    case split_parts(graph, split) do
      [] ->
        []

      parts ->
        steps =
          graph.steps
          |> Map.values()
          |> Enum.filter(&(&1.batch_id in parts))
          |> Enum.sort_by(&{Date.to_gregorian_days(&1.due_on), &1.position, &1.id})

        case Enum.find(steps, & &1.done_on) do
          nil ->
            steps

          done ->
            batch = Repo.get!(Batch, done.batch_id) |> Repo.preload(:brand)
            Repo.rollback({:part_done, Batches.label(batch, Batches.p_numbers()), name(done)})
        end
    end
  end

  # Move all takes a following Split's parts too (they're among the
  # following steps); refused as for a moved Split while one is done.
  defp parts_follow!(graph, plan, "move_all"),
    do: Enum.each(plan.following, &part_steps!(graph, &1))

  defp parts_follow!(_graph, _plan, _answer), do: :ok

  # `%{step_id => new date}` for an answer, with the pre-brew steps of a
  # first Brew day it moves (D56 §3.1).
  defp changes(graph, plan, answer) do
    base = base_changes(plan, answer)
    Map.merge(base, pre_brew_changes(graph, base))
  end

  defp base_changes(plan, answer) do
    steps =
      if answer == "move_all",
        do: plan.moved ++ plan.carried ++ plan.following,
        else: plan.moved ++ plan.carried

    Map.new(steps, &{&1.id, new_due(plan, &1)})
  end

  # D56 §3.1: each batch whose first Brew day `changes` moves takes its
  # pre-brew steps (those `changes` doesn't move already) by the same days.
  defp pre_brew_changes(graph, changes) do
    for {_batch, steps} <- by_batch(graph),
        brew = Parts.first_brew(steps),
        brew && Map.has_key?(changes, brew.id),
        days = Date.diff(changes[brew.id], brew.due_on),
        days != 0,
        s <- pre_brew(steps),
        not Map.has_key?(changes, s.id),
        into: %{},
        do: {s.id, Date.add(s.due_on, days)}
  end

  # D56 §3.1 and decision 13: what's wrong before a first Brew day after
  # `changes` (`done`: checked off by the change), or nil. An unfinished
  # pre-brew step on brew day or later (`{:before_brew_day, :pre_brew}`);
  # a step that isn't plain or custom, changed by it or by its brew day's
  # move, now before brew day (`{:not_before_brew, type name}`). Decision 21
  # (DEV gaps 3, 9): a moved brew day before a finished pre-brew step's
  # done day (`{:before_brew_day, {:pre_brew_done, name, done_on}}`).
  # Decision 23: a moved brew day on or after the done day of a finished
  # step that isn't pre-brew (`{:after_done_step, name, done_on}`). A split
  # part's steps count against its parent's brew day.
  defp brew_refusal(graph, changes, done) do
    due = &Map.get(changes, &1.id, &1.due_on)

    graph
    |> by_root()
    |> Enum.find_value(fn {root, steps} ->
      brew = steps |> Enum.filter(&(&1.batch_id == root)) |> Parts.first_brew()
      moved_brew? = brew != nil and Map.has_key?(changes, brew.id)

      before? = &(Date.compare(due.(&1), due.(brew)) == :lt)

      cond do
        brew == nil ->
          nil

        finished =
            moved_brew? &&
              Enum.find(
                steps,
                &(&1.batch_id == root and &1.pre_brew and &1.done_on != nil and
                      Date.compare(due.(brew), &1.done_on) == :lt)
              ) ->
          {:before_brew_day, {:pre_brew_done, name(finished), finished.done_on}}

        finished =
            moved_brew? &&
              steps
              |> Enum.filter(
                &(not &1.pre_brew and &1.done_on != nil and behavior(&1) != "brew" and
                      Date.compare(due.(brew), &1.done_on) != :lt)
              )
              |> Enum.min_by(&{Date.to_gregorian_days(&1.done_on), &1.id}, fn -> nil end) ->
          {:after_done_step, name(finished), finished.done_on}

        Enum.any?(pre_brew(steps), &(&1.id not in done and not before?.(&1))) ->
          {:before_brew_day, :pre_brew}

        late =
            Enum.find(
              steps,
              &(is_nil(&1.done_on) and not pre_brew_kind?(&1) and behavior(&1) != "brew" and
                  (moved_brew? or Map.has_key?(changes, &1.id)) and before?.(&1) and
                    Date.compare(&1.due_on, brew.due_on) != :lt)
            ) ->
          {:not_before_brew, kind_name(late)}

        true ->
          nil
      end
    end)
  end

  # Per answer, the refusal (nil when it works); refused under every answer,
  # the preview is refused too (the default answer's reason).
  defp refusals!(graph, plan, done \\ []) do
    refused = Map.new(@answers, &{&1, brew_refusal(graph, changes(graph, plan, &1), done)})

    if Enum.all?(Map.values(refused)),
      do: Repo.rollback(refused[plan.default || "move_only"])

    refused
  end

  @doc """
  D56 decision 13: whether a step may go before brew day: a plain step or a
  custom one (phase markers may not).
  """
  def pre_brew_kind?(%Step{step_type_id: nil, name: name}), do: is_binary(name)
  def pre_brew_kind?(%Step{} = s), do: behavior(s) == "plain"

  # "Set temp", "Transfer", "phase marker": the template's wording (D56).
  defp kind_name(%Step{step_type: %StepType{name: name}}), do: name
  defp kind_name(_), do: "phase marker"

  @doc "D56: a move refusal as the API words it (`ProductionErrors`, the preview's `refused`)."
  def refusal({:before_brew_day, :pre_brew}),
    do: %{error: "before_brew_day", message: "A pre-brew step stays before brew day."}

  # Decision 21 (DEV gap 3).
  def refusal({:before_brew_day, {:pre_brew_done, name, done_on}}),
    do: %{
      error: "before_brew_day",
      message:
        "#{name} was done #{Calendar.strftime(done_on, "%a %b %-d")}; brew day can't be before it."
    }

  # Decision 23.
  def refusal({:after_done_step, name, done_on}),
    do: %{
      error: "after_done_step",
      message:
        "#{name} was done #{Calendar.strftime(done_on, "%a %b %-d")}; brew day can't be after it."
    }

  # D56 DEV gap 5: a template step before brew day with a phase, or in a
  # later tank: the same code, saying what's wrong.
  def refusal({:not_before_brew, :phase}),
    do: %{error: "not_before_brew", message: "A step before brew day has no phase."}

  def refusal({:not_before_brew, :tank}),
    do: %{error: "not_before_brew", message: "A step before brew day is in the first tank."}

  def refusal({:not_before_brew, name}),
    do: %{error: "not_before_brew", message: "A #{name} can't be before brew day."}

  def refusal(nil), do: nil

  defp by_batch(graph) do
    graph.steps
    |> Map.values()
    |> Enum.reject(&is_nil(&1.batch_id))
    |> Enum.group_by(& &1.batch_id)
  end

  # A split family's steps under its parent's id.
  defp by_root(graph) do
    root = for {parent, ids} <- graph.parts, id <- ids, into: %{}, do: {id, parent}

    graph.steps
    |> Map.values()
    |> Enum.reject(&is_nil(&1.batch_id))
    |> Enum.group_by(&Map.get(root, &1.batch_id, &1.batch_id))
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
      Map.new(@answers, fn a -> {a, f.(changes(graph, plan, a))} end)
    end

    %{
      days: plan.days,
      batch_id: plan.first.batch_id,
      batch_label: batch_label(plan.first.batch_id, pnums),
      # D48 DEV QA minor 10: every batch the move touches, for the prompt's groups.
      batches:
        (plan.moved ++ plan.carried ++ plan.following)
        |> Enum.map(& &1.batch_id)
        |> Enum.reject(&is_nil/1)
        |> Enum.uniq()
        |> Enum.map(&batch_brief(&1, pnums)),
      moved: Enum.map(plan.moved, &brief(&1, plan)),
      # D48 DEV QA Y1: a moved Split's parts, which go with it either way.
      carried: Enum.map(plan.carried, &brief(&1, plan)),
      following: Enum.map(plan.following, &brief(&1, plan)),
      # D56 §3.1: the pre-brew steps that go with a moved brew day, per answer.
      pre_brew:
        Map.new(@answers, fn a ->
          {a,
           graph
           |> pre_brew_changes(base_changes(plan, a))
           |> Map.keys()
           |> Enum.map(&graph.steps[&1])
           |> Enum.sort_by(&{Date.to_gregorian_days(&1.due_on), &1.position, &1.id})
           |> Enum.map(&brief(&1, plan))}
        end),
      default_answer: plan.default,
      # D56: why an answer can't be used (nil when it can).
      refused: per_answer.(&refusal(brew_refusal(graph, &1, done))),
      out_of_order: per_answer.(&preview_out_of_order(graph, plan, &1, done)),
      renumbered: per_answer.(&Batches.renumbered(pnums, Batches.p_numbers(&1, leaving)))
    }
  end

  # D56: with a retest the following steps come after it, not after the
  # failed test (done, on its day): the retest stands in for it.
  defp preview_out_of_order(graph, %{retest_on: %Date{} = on} = plan, changes, done),
    do: out_of_order(graph, Map.put(changes, plan.first.id, on), List.delete(done, plan.first.id))

  defp preview_out_of_order(graph, _plan, changes, done), do: out_of_order(graph, changes, done)

  defp brief(%Step{} = s, plan) do
    %{
      id: s.id,
      batch_id: s.batch_id,
      name: name(s),
      due_on: s.due_on,
      new_due_on: new_due(plan, s)
    }
  end

  # A batch in the prompt's groups; `split_parent_id` lets it say "P5 and
  # its 2 parts" (Matt, fix cycle 5).
  defp batch_brief(batch_id, pnums) do
    batch = Repo.get!(Batch, batch_id) |> Repo.preload(:brand)
    %{id: batch.id, label: Batches.label(batch, pnums), split_parent_id: batch.split_parent_id}
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
  (`:step_done`). A moved first Brew day takes its pre-brew steps along,
  and a pre-brew step can't land on brew day or later
  (`{:before_brew_day, :pre_brew}`); nor can a step that isn't plain or
  custom land before it (`{:not_before_brew, name}`, decision 13). Refused
  under every answer, the preview is too; else it says per answer
  (`refused`).

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
      refusals!(graph, plan)

      cond do
        opts[:preview] ->
          {:preview, preview(graph, plan)}

        plan.following != [] and is_nil(answer) ->
          Repo.rollback({:answer_required, preview(graph, plan)})

        true ->
          parts_follow!(graph, plan, answer)
          changes = changes(graph, plan, answer || "move_only")

          if reason = brew_refusal(graph, changes, []), do: Repo.rollback(reason)

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

  @doc "What a check-off takes, on the schedule and the Brewery board (D56 adds the result)."
  def complete_fields, do: ~w(done_on batch_number answer result fail_action retest_days)

  @doc """
  Check off `step` (§3.7) as `actor`: `done_on` (default today; not in the
  future), and for a planned batch's first Brew day its `batch_number`
  (`Batches.check_number/2`; the batch becomes `fermenting`). Done on
  another day than planned, the step moves to that day and `answer` says
  what happens to the following steps, as in `move/3`. A full Package
  completes the batch; a partial one changes nothing. A Split (D48)
  completes the parent and the parts become `fermenting`.

  D56 decision 11: a pre-brew step done on its first Brew day or later
  stays on its planned day (`done_on` records the day) and moves nothing.

  D56 §3.2: a step whose type has a result needs `result` (`pass` /
  `fail`; `:result_required`), and a Fail `fail_action` (`retest` /
  `continue`; `:fail_action_required`). A retest (`retest_days`, default
  the step's, 1–30) is added on `done_on` + N and the move is worked out
  for the shift to it from the step's planned day (one prompt).

  `preview: true` returns `{:ok, {:preview, %{move, done_on,
  needs_batch_number, next_batch_number, needs_result, retest_days,
  retest_on}}}` (`move` nil when nothing else moves; `retest_on` set for a
  Fail with a retest). Otherwise `{:ok, %{batch_ids, renumbered,
  out_of_order, retest_id}}`.
  """
  def complete(id, attrs, %User{} = actor, opts \\ []) do
    attrs = stringify(attrs)

    Repo.transaction(fn ->
      graph = graph!([to_int(id) || Repo.rollback(:not_found)])
      step = graph.steps[to_int(id)]
      if step.done_on, do: Repo.rollback(:step_done)
      today = opts[:today] || Tasks.today()

      # D49 §3.12b: nothing on a pencilled batch is done until it's scheduled.
      if step.batch_id && Repo.get!(Batch, step.batch_id).pencilled,
        do: Repo.rollback(:schedule_first)

      done_on = done_on!(attrs["done_on"], today)
      answer = answer!(attrs["answer"])
      batch = step.batch_id && Repo.get!(Batch, step.batch_id)
      outcome = outcome!(step, attrs, opts[:preview])

      check_off_order!(graph, step, batch)

      numbering? =
        batch != nil and batch.status == "planned" and first_brew?(step, Map.values(graph.steps))

      # D56 decision 11: a pre-brew step done on brew day or later stays
      # on its planned day and moves nothing.
      due_on = if late_pre_brew?(graph, step, done_on), do: step.due_on, else: done_on
      # D56 §3.2: with a retest, the steps after the test move to follow it.
      retest_on = outcome.retest_days && Date.add(done_on, outcome.retest_days)
      plan = retest_plan(graph, step, due_on, retest_on)
      if plan, do: refusals!(graph, plan, [step.id])
      leaving = if numbering?, do: [batch.id], else: []

      if opts[:preview] do
        {:preview,
         %{
           move: plan && preview(graph, plan, [step.id], leaving),
           done_on: done_on,
           needs_batch_number: numbering?,
           next_batch_number: if(numbering?, do: Batches.next_batch_number()),
           needs_result: has_result?(step),
           retest_days: if(has_result?(step), do: step.retest_days),
           retest_allowed: retest_allowed?(step),
           retest_on: retest_on
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

        if plan, do: parts_follow!(graph, plan, answer)
        changes = if plan, do: changes(graph, plan, answer || "move_only"), else: %{}

        if reason = plan && brew_refusal(graph, changes, [step.id]), do: Repo.rollback(reason)

        {_, renumbered} =
          Batches.with_renumbering(fn ->
            write_dates!(graph, Map.delete(changes, step.id))

            step
            |> Changeset.change(
              due_on: due_on,
              done_on: done_on,
              done_by_id: actor.id,
              done_on_device_id: actor.on_device_id,
              completed_at: DateTime.utc_now() |> DateTime.truncate(:second),
              checkoff_move: checkoff_move(graph, step, due_on, changes, retest_on && plan),
              result: outcome.result
            )
            |> Repo.update!()

            cond do
              numbering? ->
                batch
                |> Changeset.change(status: "fermenting", batch_number: number)
                |> Repo.update!()

              batch && behavior(step) == "package" && not step.package_partial ->
                batch |> Changeset.change(status: "completed") |> Repo.update!()

              # D48: the Split ends the parent's part and fills the parts.
              batch && behavior(step) == "split" ->
                batch |> Changeset.change(status: "completed") |> Repo.update!()
                set_parts_status(batch, "fermenting")

              true ->
                :ok
            end
          end)

        retest = retest_on && add_retest!(step, retest_on)

        %{
          batch_ids: batch_ids([step.id | Map.keys(changes)], graph),
          renumbered: renumbered,
          out_of_order:
            if(retest,
              do: out_of_order_now(step, [retest.id | Map.keys(changes)]),
              else: out_of_order(graph, Map.put(changes, step.id, due_on), [step.id])
            ),
          retest_id: retest && retest.id
        }
      end
    end)
  end

  # The move a check-off (or a result changed to Fail) makes: the step to
  # `due_on`, and the steps after it by as many days, or with a retest
  # (`retest_on`) by the days from the step's planned day to the retest's
  # while the step stays on `due_on`. Nil when nothing moves.
  defp retest_plan(graph, step, due_on, nil) do
    days = Date.diff(due_on, step.due_on)
    if days != 0, do: plan(graph, [step], days)
  end

  defp retest_plan(graph, step, due_on, retest_on) do
    days = Date.diff(retest_on, step.due_on)

    cond do
      days != 0 ->
        graph |> plan([step], days, %{step.id => due_on}) |> Map.put(:retest_on, retest_on)

      due_on != step.due_on ->
        graph
        |> plan([step], 0, %{step.id => due_on})
        |> Map.merge(%{following: [], default: nil})

      true ->
        nil
    end
  end

  # The links out of order among `ids` as the schedule is now (after a
  # retest took the failed step's links).
  defp out_of_order_now(%Step{} = step, ids) do
    graph = graph!([step.id])
    out_of_order(graph, Map.new(ids, &{&1, graph.steps[&1].due_on}))
  end

  @doc """
  Un-check `step` (`:not_done` if it isn't done). Its first Brew day makes
  the batch planned again and frees its number (`message` says so); a full
  Package makes a completed batch `fermenting` again. D49 QA 1 (Matt,
  option a): a step its own check-off moved goes back to its planned day,
  with the steps that moved with it (`checkoff_move`) that are still where
  it put them and not done; otherwise it keeps its date.
  D56 decision 8: a failed test's retest goes (its links back on the test),
  unless it's done (`:retest_done`); the result is cleared.
  `{:ok, %{batch_ids, renumbered, message}}`.
  """
  def uncomplete(id) do
    Repo.transaction(fn ->
      graph = graph!([to_int(id) || Repo.rollback(:not_found)])
      step = graph.steps[to_int(id)]
      unless step.done_on, do: Repo.rollback(:not_done)
      batch = step.batch_id && Repo.get!(Batch, step.batch_id) |> Repo.preload(:brand)
      first_brew? = batch != nil and first_brew?(step, Map.values(graph.steps))
      retest = retest!(graph, step)

      uncheck_order!(graph, step, batch)

      {message, renumbered} =
        Batches.with_renumbering(fn ->
          if retest, do: remove_retest!(step, retest)
          # D49 QA 1 (Matt, option a): what its own check-off moved goes back.
          due_on = put_back_checkoff_move!(graph, step)

          step
          |> Changeset.change(
            done_on: nil,
            done_by_id: nil,
            done_on_device_id: nil,
            completed_at: nil,
            checkoff_move: nil,
            due_on: due_on,
            result: nil
          )
          |> Repo.update!()

          cond do
            first_brew? and batch.status != "planned" ->
              label = Batches.label(batch, %{})
              batch |> Changeset.change(status: "planned", batch_number: nil) |> Repo.update!()

              if batch.batch_number,
                do: "#{label} is planned again; its number is freed.",
                else: "#{label} is planned again."

            # D48 DEV QA Y2: back to what its steps support, never a brewed
            # status without brew day.
            batch && batch.status == "completed" && behavior(step) == "package" &&
                not step.package_partial ->
              batch |> Changeset.change(open_status(graph, batch)) |> Repo.update!()
              nil

            # D48: the parts aren't filled any more (`unfill_parts/3`).
            batch && behavior(step) == "split" ->
              if batch.status == "completed",
                do: batch |> Changeset.change(open_status(graph, batch)) |> Repo.update!()

              nil

            true ->
              nil
          end
          |> tap(fn _ -> unfill_parts(graph, batch, step) end)
        end)

      %{batch_ids: batch_ids([step.id], graph), renumbered: renumbered, message: message}
    end)
  end

  # D56 decision 11: `step` is a pre-brew step and `done_on` is on its
  # batch's first Brew day or later.
  defp late_pre_brew?(graph, %Step{batch_id: id} = step, done_on) when not is_nil(id) do
    steps = graph.steps |> Map.values() |> Enum.filter(&(&1.batch_id == id))
    brew = Parts.first_brew(steps)

    brew != nil and Enum.any?(pre_brew(steps), &(&1.id == step.id)) and
      Date.compare(done_on, brew.due_on) != :lt
  end

  defp late_pre_brew?(_graph, _step, _done_on), do: false

  ## Test results (D56 §3.2)

  @doc """
  Change the result of a done step whose type has one (`:not_done`,
  `:result_not_here`). Fail → Pass takes its retest away, unless that's
  done (`:retest_done`), and puts the steps after it where a Pass would
  have left them. Pass → Fail asks the Fail question (`fail_action`,
  `retest_days`) and a retest moves the steps after it as at check-off
  (`answer`, `{:answer_required, preview}`). The same result is a no-op.
  `preview: true` returns `{:ok, {:preview, %{move, retest_days,
  retest_on}}}`; otherwise `{:ok, %{batch_ids, renumbered, out_of_order,
  retest_id}}`.
  """
  def change_result(id, attrs, opts \\ []) do
    attrs = stringify(attrs)

    Repo.transaction(fn ->
      graph = graph!([to_int(id) || Repo.rollback(:not_found)])
      step = graph.steps[to_int(id)]
      unless step.done_on, do: Repo.rollback(:not_done)
      unless has_result?(step), do: Repo.rollback(:result_not_here)
      outcome = outcome!(step, attrs, opts[:preview])
      answer = answer!(attrs["answer"])

      cond do
        outcome.result == step.result or is_nil(outcome.result) ->
          if opts[:preview],
            do:
              {:preview,
               %{
                 move: nil,
                 retest_days: step.retest_days,
                 retest_allowed: retest_allowed?(step),
                 retest_on: nil
               }},
            else: result_reply(graph, step, %{}, nil)

        outcome.result == "pass" ->
          retest = retest!(graph, step)

          if opts[:preview] do
            {:preview,
             %{
               move: nil,
               retest_days: step.retest_days,
               retest_allowed: retest_allowed?(step),
               retest_on: nil
             }}
          else
            if retest, do: remove_retest!(step, retest)
            moves = pass_back!(graph, step)
            step |> Changeset.change(moves) |> Changeset.change(result: "pass") |> Repo.update!()
            result_reply(graph, step, %{}, nil)
          end

        true ->
          to_fail(graph, step, outcome, answer, opts)
      end
    end)
  end

  # Pass → Fail: as the Fail at check-off, from the day the step is on.
  defp to_fail(graph, step, outcome, answer, opts) do
    retest_on = outcome.retest_days && Date.add(step.done_on, outcome.retest_days)
    plan = retest_plan(graph, step, step.due_on, retest_on)
    if plan, do: refusals!(graph, plan, [step.id])

    cond do
      opts[:preview] ->
        {:preview,
         %{
           move: plan && preview(graph, plan, [step.id]),
           retest_days: step.retest_days,
           retest_allowed: retest_allowed?(step),
           retest_on: retest_on
         }}

      plan && plan.following != [] && is_nil(answer) ->
        Repo.rollback({:answer_required, preview(graph, plan, [step.id])})

      true ->
        changes = if plan, do: changes(graph, plan, answer || "move_only"), else: %{}
        if reason = plan && brew_refusal(graph, changes, [step.id]), do: Repo.rollback(reason)
        write_dates!(graph, Map.delete(changes, step.id))

        step
        |> Changeset.change(
          result: "fail",
          checkoff_move: merge_checkoff_move(graph, step, Map.delete(changes, step.id))
        )
        |> Repo.update!()

        retest = retest_on && add_retest!(step, retest_on)
        result_reply(graph, step, changes, retest)
    end
  end

  defp result_reply(graph, step, changes, retest) do
    ids = Map.keys(changes) ++ if(retest, do: [retest.id], else: [])

    %{
      batch_ids: batch_ids([step.id | Map.keys(changes)], graph),
      renumbered: [],
      out_of_order: if(ids == [], do: [], else: out_of_order_now(step, ids)),
      retest_id: retest && retest.id
    }
  end

  # The follower moves of a result changed to Fail, added to the check-off's
  # record (`[from, to, pass_to]`), so Mark not done and Fail → Pass put
  # them back.
  defp merge_checkoff_move(graph, step, changes) do
    # Counted from where the step is now (decision 20, DEV gap 8).
    moved =
      if step.checkoff_move, do: step.checkoff_move |> Jason.decode!() |> rebase(step), else: %{}

    changes
    |> Enum.reduce(moved, fn {id, to}, acc ->
      key = to_string(id)

      case acc[key] do
        [from, now | _] ->
          Map.put(acc, key, [from, iso(to), now])

        _ ->
          Map.put(acc, key, [iso(graph.steps[id].due_on), iso(to), iso(graph.steps[id].due_on)])
      end
    end)
    |> Map.put_new(to_string(step.id), [iso(step.due_on), iso(step.due_on)])
    |> then(&if(&1 == %{}, do: nil, else: Jason.encode!(&1)))
  end

  # Fail → Pass: the steps a retest moved go to where a Pass would have left
  # them (`pass_to`), if they're not done, even if they were moved since (D56
  # decision 20, DEV gap 4), counted from where the test is now (gap 8); a
  # done one gets that as its planned day (gap 7). Refused like a move if
  # it would leave a step before brew day that can't be there. The step's
  # new `checkoff_move`.
  defp pass_back!(_graph, %Step{checkoff_move: nil}), do: []

  defp pass_back!(graph, %Step{checkoff_move: json} = step) do
    moved = json |> Jason.decode!() |> since_fail(step)

    back =
      for {id, [_, _, pass_to]} <- moved,
          s = graph.steps[String.to_integer(id)],
          s && is_nil(s.done_on),
          into: %{},
          do: {s.id, Date.from_iso8601!(pass_to)}

    if reason = brew_refusal(graph, back, [step.id]), do: Repo.rollback(reason)
    write_dates!(graph, back)
    replan_done!(graph, moved, back, 2)

    moved =
      moved
      |> Enum.flat_map(fn
        {id, [from, _, pass_to]} -> if from == pass_to, do: [], else: [{id, [from, pass_to]}]
        other -> [other]
      end)
      |> Map.new()

    own = moved[to_string(step.id)]

    cond do
      map_size(moved) == 1 and match?([same, same], own) -> [checkoff_move: nil]
      true -> [checkoff_move: Jason.encode!(moved)]
    end
  end

  @doc "D56 §3.2: whether `step`'s type records Pass / Fail. Needs `step_type`."
  def has_result?(%Step{step_type: %StepType{has_result: true}}), do: true
  def has_result?(%Step{}), do: false

  @doc """
  D56 decision 15: whether a Fail on `step` can add a retest (plain steps
  and Set temp; anything else only continues). Needs `step_type`.
  """
  def retest_allowed?(%Step{} = step),
    do: has_result?(step) and behavior(step) in ["plain", "set_temp"]

  # What a check-off records: `result` (nil for a type without one) and, for
  # a Fail with a retest, `retest_days`. Only a preview goes without them.
  defp outcome!(step, attrs, preview?) do
    if has_result?(step) do
      case result!(attrs["result"]) do
        nil ->
          unless preview?, do: Repo.rollback(:result_required)
          %{result: nil, retest_days: nil}

        "fail" ->
          case fail_action!(attrs["fail_action"]) do
            nil ->
              unless preview?, do: Repo.rollback(:fail_action_required)
              %{result: "fail", retest_days: nil}

            "continue" ->
              %{result: "fail", retest_days: nil}

            "retest" ->
              unless retest_allowed?(step), do: Repo.rollback(:retest_not_here)

              %{result: "fail", retest_days: retest_days!(attrs["retest_days"], step.retest_days)}
          end

        "pass" ->
          %{result: "pass", retest_days: nil}
      end
    else
      %{result: nil, retest_days: nil}
    end
  end

  defp result!(v) when v in [nil, ""], do: nil
  defp result!(v) when v in ["pass", "fail"], do: v
  defp result!(_), do: Repo.rollback(:result_invalid)

  defp fail_action!(v) when v in [nil, ""], do: nil
  defp fail_action!(v) when v in ["retest", "continue"], do: v
  defp fail_action!(_), do: Repo.rollback(:fail_action_invalid)

  defp retest_days!(v, default) when v in [nil, ""], do: default

  defp retest_days!(v, _default) do
    range = RockcutApi.Production.TemplateStep.retest_days()

    case to_int(v) do
      n when is_integer(n) -> if n in range, do: n, else: Repo.rollback(:retest_days_invalid)
      _ -> Repo.rollback(:retest_days_invalid)
    end
  end

  # The retest a failed test added (nil if none), refused while it's done.
  defp retest!(graph, %Step{} = step) do
    case Enum.find(Map.values(graph.steps), &(&1.retest_of_id == step.id)) do
      %Step{done_on: nil} = retest -> retest
      %Step{} -> Repo.rollback(:retest_done)
      nil -> nil
    end
  end

  # The retest of failed `step` on `on`: a copy of the step (type, tank,
  # phase, notes, assignee, task-list setting, `retest_days`), "retest" /
  # "retest 2" / …, added. The step's outgoing links become the retest's.
  defp add_retest!(%Step{} = step, on) do
    retest =
      Repo.insert!(%Step{
        batch_id: step.batch_id,
        tank_id: step.tank_id,
        step_type_id: step.step_type_id,
        phase_id: step.phase_id,
        name: step.name,
        vessel_index: step.vessel_index,
        temperature: step.temperature,
        notes: step.notes,
        on_task_list: step.on_task_list,
        assignee_id: step.assignee_id,
        retest_days: step.retest_days,
        position: step.position,
        detail: retest_detail(step),
        due_on: on,
        added: true,
        retest_of_id: step.id,
        # D56 decision 22: a pre-brew test's retest before brew day is pre-brew too.
        pre_brew: step.pre_brew and before_brew?(step.batch_id, on)
      })

    Repo.update_all(from(l in StepLink, where: l.from_step_id == ^step.id),
      set: [from_step_id: retest.id, updated_at: now()]
    )

    retest
  end

  defp before_brew?(batch_id, on) do
    brew =
      Repo.all(from(s in Step, where: s.batch_id == ^batch_id, preload: :step_type))
      |> Parts.first_brew()

    brew != nil and Date.compare(on, brew.due_on) == :lt
  end

  # "retest" for the first, then "retest 2", "retest 3", … along the chain.
  defp retest_detail(step) do
    case chain_length(step) do
      1 -> "retest"
      n -> "retest #{n}"
    end
  end

  defp chain_length(%Step{retest_of_id: nil}), do: 1

  defp chain_length(%Step{retest_of_id: id}) do
    case Repo.get(Step, id) do
      nil -> 1
      prev -> 1 + chain_length(prev)
    end
  end

  # Take `retest` away: its outgoing links go back to `step` (one that would
  # repeat a link `step` has is dropped), and it's deleted with its task.
  defp remove_retest!(%Step{} = step, %Step{} = retest) do
    have =
      Repo.all(from(l in StepLink, where: l.from_step_id == ^step.id, select: l.to_step_id))

    Repo.delete_all(
      from(l in StepLink, where: l.from_step_id == ^retest.id and l.to_step_id in ^have)
    )

    Repo.update_all(from(l in StepLink, where: l.from_step_id == ^retest.id),
      set: [from_step_id: step.id, updated_at: now()]
    )

    Repo.delete!(retest)
  end

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second)

  ## A check-off's move (D49 QA 1)

  # What checking `step` off on `done_on` moves: itself from its planned
  # day, and `changes` (the following steps under the answer, a Split's
  # parts), each `[from, to]`. Nil when nothing moved. D56: a step moved for
  # a retest (`retest_plan`) also keeps where a Pass would have put it,
  # `[from, to, pass_to]`, for a Fail changed to Pass.
  defp checkoff_move(graph, step, done_on, changes, retest_plan) do
    others = Map.delete(changes, step.id)

    if others == %{} and done_on == step.due_on do
      nil
    else
      pass_days = Date.diff(done_on, step.due_on)

      others
      |> Map.new(fn {id, to} ->
        from = graph.steps[id].due_on

        {to_string(id),
         if(retest_plan,
           do: [iso(from), iso(to), iso(Date.add(from, pass_days))],
           else: [iso(from), iso(to)]
         )}
      end)
      |> Map.put(to_string(step.id), [iso(step.due_on), iso(done_on)])
      |> Jason.encode!()
    end
  end

  # Mark not done: the steps the check-off moved that are still where it
  # put them, and not done, go back to their dates; the step's own planned
  # day is returned for it. Without a record, it keeps its date (D47).
  # D56 decision 20 (DEV gap 4): the steps a Fail's retest moved (their
  # record has the Pass date too) go back to their dates before the Fail
  # even if they were moved since, counted from where the test is now (gap
  # 8); done ones stay, with that as their planned day (gap 7). Refused like
  # a move if it would leave a step before brew day that can't be there.
  defp put_back_checkoff_move!(_graph, %Step{checkoff_move: nil} = step), do: step.due_on

  defp put_back_checkoff_move!(graph, %Step{checkoff_move: json} = step) do
    moved = json |> Jason.decode!() |> since_fail(step)

    back =
      for {id, [from, to | retest]} <- moved,
          id = String.to_integer(id),
          id != step.id,
          s = graph.steps[id],
          s && is_nil(s.done_on) && (retest != [] or iso(s.due_on) == to),
          into: %{},
          do: {id, Date.from_iso8601!(from)}

    due_on =
      case moved[to_string(step.id)] do
        [from | _] -> Date.from_iso8601!(from)
        _ -> step.due_on
      end

    undone = %{graph | steps: Map.update!(graph.steps, step.id, &%{&1 | done_on: nil})}
    own = if due_on == step.due_on, do: %{}, else: %{step.id => due_on}
    brew? = first_brew?(step, Map.values(graph.steps))

    case brew_refusal(undone, Map.merge(back, own), []) do
      nil ->
        :ok

      # D56 decision 24 (DEV gap 12): brew day held by a finished pre-brew step.
      {:before_brew_day, {:pre_brew_done, name, _}} when brew? ->
        Repo.rollback({:pre_brew_done, name})

      reason ->
        Repo.rollback(reason)
    end

    write_dates!(graph, back)
    replan_done!(graph, moved, back, 0)
    due_on
  end

  # D56 decision 20 (clarified, DEV gap 8): a Fail's record (one with a
  # retest's Pass date) counts from where the test is now: its dates move as
  # far as the test has since (a whole-batch move; dragging the retest
  # doesn't move the test).
  defp since_fail(moved, step) do
    if Enum.any?(moved, fn {_, dates} -> length(dates) == 3 end),
      do: rebase(moved, step),
      else: moved
  end

  # A record's dates moved as far as `step` has from the day it records for it.
  defp rebase(moved, step) do
    case moved[to_string(step.id)] do
      [_, to | _] ->
        days = Date.diff(step.due_on, Date.from_iso8601!(to))

        Map.new(moved, fn {id, dates} ->
          {id, Enum.map(dates, &(&1 |> Date.from_iso8601!() |> Date.add(days) |> iso()))}
        end)

      _ ->
        moved
    end
  end

  # D56 decision 20 (clarified, DEV gap 7): a step a Fail moved that's done
  # since gets its planned day put back too (`at`: 0 its date before the
  # Fail, 2 where a Pass would have left it), so a later Mark not done of it
  # lands in order; the steps put back with it leave its record.
  defp replan_done!(graph, moved, back, at) do
    for {id, [_, _, _] = dates} <- moved,
        s = graph.steps[String.to_integer(id)],
        s && s.done_on do
      key = to_string(s.id)
      record = if s.checkoff_move, do: Jason.decode!(s.checkoff_move), else: %{}

      to =
        case record[key] do
          [_, to | _] -> to
          _ -> iso(s.due_on)
        end

      record =
        record
        |> Map.drop(Enum.map(Map.keys(back), &to_string/1))
        |> Map.put(key, [Enum.at(dates, at), to])

      json = if record == %{key => [to, to]}, do: nil, else: Jason.encode!(record)
      s |> Changeset.change(checkoff_move: json) |> Repo.update!()
    end
  end

  defp iso(%Date{} = d), do: Date.to_iso8601(d)

  ## The order rules

  @doc """
  D48 DEV QA AA1: an Undo that changes steps' done state obeys the same
  order rules as checking them off or un-checking them. `done_ids`: the
  steps it marks done, `undone_ids`: the ones it marks not done, each
  checked against the schedule as the Undo leaves it. Inside a transaction;
  a refusal rolls it back with the rule's own reason.
  """
  def order_after_undo!(done_ids, undone_ids) do
    case done_ids ++ undone_ids do
      [] ->
        :ok

      ids ->
        graph = graph!(ids)
        batch = &(&1.batch_id && Repo.get!(Batch, &1.batch_id))
        for id <- done_ids, s = graph.steps[id], do: check_off_order!(graph, s, batch.(s))
        for id <- undone_ids, s = graph.steps[id], do: uncheck_order!(graph, s, batch.(s))
        :ok
    end
  end

  # D48 DEV QA Y2: what empties a tank (a Split, a Transfer/Filter, a
  # Package) waits for brew day (a part's: its parent's), as the batch
  # number does. Z1: a part's exit waits for its parent's Split too.
  defp check_off_order!(graph, step, batch) do
    if batch && behavior(step) in @exits && not brewed?(graph, batch),
      do: Repo.rollback({:before_brew_day, :check_off})

    case batch && behavior(step) in @exits && parent_split(graph, batch) do
      %Step{done_on: nil} = split -> Repo.rollback({:before_split, :check_off, name(split)})
      _ -> :ok
    end
  end

  # Y2: brew day stays done while anything after it that empties a tank is
  # done, in the batch or its parts (AA2: a part's named). Z1: and the Split
  # stays done while a part's exit is.
  defp uncheck_order!(graph, step, batch) do
    if batch != nil and first_brew?(step, Map.values(graph.steps)) do
      case Enum.find(Map.values(graph.steps), &(&1.done_on && behavior(&1) in @exits)) do
        nil ->
          :ok

        %Step{batch_id: id} = done when id == step.batch_id ->
          Repo.rollback({:exit_done, name(done)})

        done ->
          Repo.rollback({:exit_done, "#{part_label(done)}: #{name(done)}"})
      end
    end

    if behavior(step) == "split" do
      parts = split_parts(graph, step)

      case Enum.find(Map.values(graph.steps), fn s ->
             s.batch_id in parts and s.done_on != nil and behavior(s) in @exits
           end) do
        nil -> :ok
        done -> Repo.rollback({:part_exit_done, part_label(done), name(done)})
      end
    end
  end

  defp part_label(%Step{batch_id: id}),
    do: Repo.get!(Batch, id) |> Repo.preload(:brand) |> Batches.label(Batches.p_numbers())

  ## The step dialog

  @doc """
  Edit a step: `detail`, `temperature` (Set temp, required there; Brew
  day's starting temperature), `package_partial` (an unfinished Package;
  `:step_done` once done), `cip_method` (an unfinished CIP's variant, D49;
  `:step_done` once done), `notes`, `on_task_list`, `assignee_id` (a Brewery
  member, or nil; a phase marker can't go on the task list:
  `:marker_task_list`, D49 QA 8). A date (`due_on`, `done_on`, `completed_at`) is refused
  with `:date_not_here` (D48 DEV QA Z3): dates change by moving the step or
  checking it off. Other fields are ignored.
  """
  def update(%Step{} = step, attrs) do
    step = Repo.preload(step, :step_type)
    b = behavior(step)
    attrs = stringify(attrs)

    attrs =
      attrs
      |> then(&if(b in ["set_temp", "brew"], do: &1, else: Map.delete(&1, "temperature")))
      |> then(&if(b == "package", do: &1, else: Map.delete(&1, "package_partial")))
      |> then(&if(b == "cip", do: &1, else: Map.delete(&1, "cip_method")))

    cond do
      Enum.any?(~w(due_on done_on completed_at), &Map.has_key?(attrs, &1)) ->
        {:error, :date_not_here}

      Map.has_key?(attrs, "package_partial") and step.done_on != nil and
          truthy?(attrs["package_partial"]) != step.package_partial ->
        {:error, :step_done}

      # D49 decision 6.1 (QA 8): a phase marker never goes on the task list.
      Step.marker?(step) and truthy?(attrs["on_task_list"]) ->
        {:error, :marker_task_list}

      # D49 §3.12a: only an unfinished CIP switches its variant.
      Map.has_key?(attrs, "cip_method") and step.done_on != nil and
          attrs["cip_method"] != cip_method(step) ->
        {:error, :step_done}

      true ->
        step
        |> Step.edit_changeset(attrs)
        |> then(
          &if(b == "set_temp",
            do:
              Changeset.validate_required(&1, [:temperature], message: "Enter the temperature."),
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

  # Whether `batch`'s brew day (a part's: its parent's first Brew day) is
  # done; a batch without one counts as brewed.
  defp brewed?(graph, %Batch{} = batch) do
    root = batch.split_parent_id || batch.id

    brew =
      graph.steps |> Map.values() |> Enum.filter(&(&1.batch_id == root)) |> Parts.first_brew()

    brew == nil or brew.done_on != nil
  end

  # A batch whose exit is no longer done: fermenting once brewed (a part:
  # once filled), else planned without a number.
  defp open_status(graph, %Batch{split_parent_id: nil} = batch) do
    if brewed?(graph, batch),
      do: [status: "fermenting"],
      else: [status: "planned", batch_number: nil]
  end

  # D48 DEV QA Z1: a part is filled by its parent's Split, so it's planned
  # until that's done.
  defp open_status(graph, %Batch{} = part) do
    case parent_split(graph, part) do
      %Step{done_on: nil} -> [status: "planned"]
      _ -> [status: "fermenting"]
    end
  end

  # A part's parent's Split (nil for a batch that isn't a part).
  defp parent_split(_graph, %Batch{split_parent_id: nil}), do: nil

  defp parent_split(graph, %Batch{split_parent_id: parent}),
    do:
      graph.steps
      |> Map.values()
      |> Enum.find(&(&1.batch_id == parent and behavior(&1) == "split"))

  # D48 DEV QA Z1: after any un-check in a split family whose Split isn't
  # done (or is the step un-checked), every part is planned, whatever its
  # own steps; this also puts right a part left fermenting before the fix.
  defp unfill_parts(_graph, nil, _step), do: :ok

  defp unfill_parts(graph, %Batch{} = batch, %Step{} = step) do
    root = batch.split_parent_id || batch.id

    case Enum.find(Map.values(graph.steps), &(&1.batch_id == root and behavior(&1) == "split")) do
      %Step{} = split when split.id == step.id or is_nil(split.done_on) ->
        set_parts_status(%Batch{id: root}, "planned")

      _ ->
        :ok
    end
  end

  defp set_parts_status(%Batch{id: id}, status),
    do: Repo.update_all(from(b in Batch, where: b.split_parent_id == ^id), set: [status: status])

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
