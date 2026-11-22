defmodule RockcutApiWeb.JSONHelpers do
  @moduledoc """
  Shared functions for converting Ecto schemas to JSON-safe maps.
  """

  # ── Accounts / auth views ──────────────────────────────────────────

  def user(user) do
    %{
      id: user.id,
      email: user.email,
      name: user.name,
      active: user.active,
      is_owner: user.is_owner,
      must_reset_password: user.must_reset_password,
      schedulable: user.schedulable,
      kind: user.kind,
      home_department_id: user.home_department_id,
      # D37: whether a staff code is set; the code itself is only ever sent by
      # GET /api/users/:id/staff_code.
      has_staff_code: not is_nil(user.staff_code_digest),
      memberships: maybe_render(user, :memberships, &Enum.map(&1, fn m -> membership(m) end)),
      inserted_at: user.inserted_at,
      updated_at: user.updated_at
    }
  end

  @doc """
  D58 §3.3: a person in Users & Roles as `viewer` (an owner or a manager) may
  see them: `user/1`, without the departments `viewer` can't see (Owners), plus `can_edit`, `can_deactivate` and
  `addable_departments` (`Accounts.user_access/3`). Every Users & Roles reply
  about a person uses this.
  """
  def user_for(user, viewer, departments \\ nil) do
    access =
      if departments,
        do: RockcutApi.Accounts.user_access(viewer, user, departments),
        else: RockcutApi.Accounts.user_access(viewer, user)

    {hidden, access} = Map.pop(access, :hidden_department_ids)

    user
    |> user()
    |> Map.update!(:memberships, fn
      nil -> nil
      ms -> Enum.reject(ms, &(&1.department_id in hidden))
    end)
    |> Map.merge(access)
  end

  def membership(m) do
    %{
      department_id: m.department_id,
      department_key: maybe_render(m, :department, & &1.key),
      department_name: maybe_render(m, :department, & &1.name),
      # D59 decision 9: a manager's Users & Roles shows an Owners membership as
      # a read-only chip from this, since `/api/departments` leaves Owners out.
      owners_only: maybe_render(m, :department, & &1.owners_only),
      role: m.role
    }
  end

  def department(d) do
    %{
      id: d.id,
      name: d.name,
      key: d.key,
      color: d.color,
      assignable: d.assignable,
      scheduling: d.scheduling,
      owners_only: d.owners_only
    }
  end

  def message(m) do
    %{
      id: m.id,
      channel_key: m.channel_key,
      body: m.body,
      user: maybe_render(m, :user, fn u -> %{id: u.id, name: u.name, email: u.email} end),
      inserted_at: m.inserted_at
    }
  end

  # Flags such as `shared_devices` (D33), `staff_codes` and `beer_board_manage`
  # (D37) and `task_boards` (D41) sit beside
  # `capabilities`, whose keys the D31 parity suite pins.
  def me(user, capabilities, flags \\ %{}) do
    Map.merge(
      %{
        shared_devices: false,
        staff_codes: false,
        beer_board_manage: false,
        task_boards: [],
        idea_boards: [],
        color_mode: "light",
        show_planned_batches: true
      },
      flags
    )
    |> Map.merge(%{user: user(user), capabilities: capabilities})
  end

  @doc """
  One of `/api/me`'s `task_boards` (D41): `key`, `name`, `color`, `manage`, and
  `scheduling` (D59 gap 2: false on Owners, whose board has no shifts to hide).
  """
  def task_board_entry(%{department: d, manage: manage}),
    do: %{key: d.key, name: d.name, color: d.color, manage: manage, scheduling: d.scheduling}

  # ── Idea Boards (D53 Part 2) ──────────────────────────────────────

  @doc "One of `/api/idea_boards` (and `/api/me`'s `idea_boards`): `key`, `name`, `color`, `manage`, `history`."
  def idea_board_entry(%{key: _, name: _, color: _, manage: _, history: _} = entry), do: entry

  @doc "The board `GET …/lists` (`IdeaBoards.board/2`): its lists with card faces, and its labels."
  def idea_board(%{lists: lists, labels: labels}) do
    %{lists: Enum.map(lists, &idea_list/1), labels: Enum.map(labels, &idea_label/1)}
  end

  def idea_list(l) do
    %{
      id: l.id,
      name: l.name,
      position: l.position,
      locked: not is_nil(l.locked_at),
      locked_at: l.locked_at,
      locked_by: maybe_render(l, :locked_by, &person_ref/1),
      archived_at: l.archived_at,
      cards: maybe_render(l, :cards, &Enum.map(&1, fn c -> idea_card_face(c) end))
    }
  end

  @doc "What a card's face shows (§4.4), from `IdeaBoards`' preloads."
  def idea_card_face(c) do
    %{
      id: c.id,
      list_id: c.list_id,
      title: c.title,
      due_on: c.due_on,
      position: c.position,
      locked: not is_nil(c.locked_at),
      locked_at: c.locked_at,
      locked_by: maybe_render(c, :locked_by, &person_ref/1),
      archived_at: c.archived_at,
      label_ids: maybe_render(c, :labels, &Enum.map(&1, fn l -> l.id end)),
      assignee_ids: maybe_render(c, :assignees, &Enum.map(&1, fn u -> u.id end)),
      assignees: maybe_render(c, :assignees, &Enum.map(&1, fn u -> person_ref(u) end)),
      checklist: %{done: c.checklist_done, total: c.checklist_total},
      note_count: c.note_count,
      watching: c.watching,
      sent_tasks: maybe_render(c, :sent_tasks, &Enum.map(&1, fn t -> idea_sent_task(t) end))
    }
  end

  @doc "A card for its dialog (`IdeaBoards.get_card/3`): the face plus everything else."
  def idea_card(c) do
    c
    |> idea_card_face()
    |> Map.merge(%{
      description: c.description,
      list: maybe_render(c, :list, &Map.delete(idea_list(&1), :cards)),
      labels: maybe_render(c, :labels, &Enum.map(&1, fn l -> idea_label(l) end)),
      created_by: maybe_render(c, :created_by, &person_ref/1),
      inserted_at: c.inserted_at,
      updated_at: c.updated_at,
      checklist_items:
        maybe_render(c, :checklist_items, &Enum.map(&1, fn i -> idea_checklist_item(i) end)),
      notes: maybe_render(c, :notes, &Enum.map(&1, fn n -> idea_note(n) end))
    })
  end

  def idea_label(l), do: %{id: l.id, name: l.name, color: l.color, position: l.position}

  def idea_checklist_item(i) do
    %{
      id: i.id,
      text: i.text,
      position: i.position,
      done: not is_nil(i.done_at),
      done_at: i.done_at,
      done_by: maybe_render(i, :done_by, &person_ref/1)
    }
  end

  def idea_note(n) do
    %{
      id: n.id,
      body: n.body,
      author: maybe_render(n, :author, &person_ref/1),
      author_id: n.author_id,
      inserted_at: n.inserted_at,
      edited_at: n.edited_at
    }
  end

  @doc """
  A card's chip for a sent task (§4.7): `state` is `on_list`, `done`,
  `repeating` or `removed` (`IdeaBoards.sent_state/1`); the department, the
  task's day and finish day, and a repeat's rule.
  """
  def idea_sent_task(t) do
    task = loaded(t.task)
    series = loaded(t.task_series)

    %{
      id: t.id,
      state: RockcutApi.IdeaBoards.sent_state(t),
      task_id: t.task_id,
      task_series_id: t.task_series_id,
      task_title: t.task_title,
      department: maybe_render(t, :department, &%{key: &1.key, name: &1.name}),
      due_on: task && task.due_on,
      completed_on: task && task.completed_on,
      series: series && %{frequency: series.frequency, interval: series.interval},
      sent_at: t.inserted_at
    }
  end

  @doc "\"Archived\" (`IdeaBoards.archived/1`): archived lists with card counts, and archived cards."
  def idea_archived(%{lists: lists, cards: cards}) do
    %{
      lists: Enum.map(lists, fn l -> l |> idea_list() |> Map.put(:card_count, l.card_count) end),
      cards:
        Enum.map(cards, fn c ->
          %{
            id: c.id,
            title: c.title,
            # Archived's search (Matt, 2026-11-08) matches it too.
            description: c.description,
            archived_at: c.archived_at,
            list: maybe_render(c, :list, &%{id: &1.id, name: &1.name})
          }
        end)
    }
  end

  def idea_event(ev) do
    %{
      id: ev.id,
      card_id: ev.card_id,
      list_id: ev.list_id,
      action: ev.action,
      title: ev.title,
      actor_id: ev.actor_id,
      actor_name: maybe_render(ev, :actor, &name_of/1),
      detail: ev.detail,
      inserted_at: ev.inserted_at
    }
  end

  defp person_ref(u), do: %{id: u.id, name: u.name}

  defp loaded(%Ecto.Association.NotLoaded{}), do: nil
  defp loaded(value), do: value

  # ── Buy-a-Beer Board (D37) ─────────────────────────────────────────

  def beer_board_entry(e) do
    %{
      id: e.id,
      recipient_name: e.recipient_name,
      purchaser_name: e.purchaser_name,
      beers_remaining: e.beers_remaining,
      moved_off_board_at: e.moved_off_board_at,
      imported_at: e.imported_at
    }
  end

  def beer_board_event(ev) do
    %{
      id: ev.id,
      entry_id: ev.entry_id,
      action: ev.action,
      actor_name: maybe_render(ev, :actor, & &1.name),
      on_shared_device: not is_nil(ev.device_id),
      recipient_name: ev.recipient_name,
      purchaser_name: ev.purchaser_name,
      beers_before: ev.beers_before,
      beers_after: ev.beers_after,
      source: Map.get(ev.detail || %{}, "source"),
      detail: ev.detail,
      inserted_at: ev.inserted_at
    }
  end

  # ── Brewery task board (D38) ───────────────────────────────────────

  @doc """
  The board `GET` (`Tasks.board/3`). Dates are `YYYY-MM-DD`; card keys
  are `"<task_id>:<day>"`, `"<task_id>:future"` or `"<task_id>:unfinished"`.
  """
  def task_board(b) do
    %{
      from: b.from,
      to: b.to,
      today: b.today,
      days: Enum.map(b.days, &task_board_day/1),
      unfinished: Enum.map(b.unfinished, &task_card/1),
      future: Enum.map(b.future, &task_card/1),
      # D59: owners the assignee picker offers too (owners-only boards; else []).
      owners: b.owners
    }
  end

  @doc """
  The All departments `GET` (`Tasks.all_boards/3`, D41 §3.6): a board's shape
  without `header`; every card carries its `department` key, and each day has
  `daily_counts` (`[%{department, done, total}]`, boards with items that day)
  in place of `daily`.
  """
  def all_task_boards(b) do
    %{
      from: b.from,
      to: b.to,
      today: b.today,
      days:
        Enum.map(b.days, fn d ->
          %{
            date: d.date,
            cards: Enum.map(d.cards, &task_card/1),
            daily_counts: d.daily_counts
          }
        end),
      unfinished: Enum.map(b.unfinished, &task_card/1),
      future: Enum.map(b.future, &task_card/1)
    }
  end

  defp task_board_day(d) do
    %{
      date: d.date,
      header: brewery_day_header(d.header),
      cards: Enum.map(d.cards, &task_card/1),
      daily: daily_card(d.date, d.daily)
    }
  end

  # D59: nil for a board whose department isn't on the schedule (Owners).
  defp brewery_day_header(nil), do: nil

  defp brewery_day_header(h) do
    %{
      people:
        Enum.map(h.people, fn p ->
          %{
            user_id: p.user.id,
            name: p.user.name,
            hours: p.hours,
            shifts: Enum.map(p.shifts, &brewery_header_shift/1)
          }
        end),
      open_shifts: Enum.map(h.open_shifts, &brewery_header_shift/1),
      events:
        Enum.map(h.events, fn e ->
          %{
            id: e.id,
            title: e.title,
            all_day: e.all_day,
            starts_at: e.starts_at,
            ends_at: e.ends_at
          }
        end),
      no_one_scheduled: h.people == [] and h.open_shifts == []
    }
  end

  defp brewery_header_shift(s) do
    %{
      id: s.id,
      position_name: s.position.name,
      starts_at: s.starts_at,
      ends_at: s.ends_at
    }
  end

  def task_card(c) do
    c.task
    |> task()
    |> Map.merge(%{
      key: "#{c.task.id}:#{c.day}",
      day: c.day,
      planned_on: c.planned_on,
      done_on: c.done_on,
      from_future: c.from_future,
      locked: c.locked,
      overdue: c.overdue
    })
    |> Map.merge(Map.take(c, [:department]))
  end

  def task(t) do
    %{
      id: t.id,
      title: t.title,
      notes: t.notes,
      due_on: t.due_on,
      position: t.position,
      assignee_id: t.assignee_id,
      assignee_name: maybe_render(t, :assignee, &name_of/1),
      assignees: task_assignees(t),
      done: not is_nil(t.completed_at),
      completed_at: t.completed_at,
      completed_on: t.completed_on,
      completed_display: t.completed_display,
      completed_by_id: t.completed_by_id,
      completed_by_name: maybe_render(t, :completed_by, &name_of/1),
      created_by_id: t.created_by_id,
      created_by_name: maybe_render(t, :created_by, &name_of/1),
      series_id: t.series_id,
      series_date: t.series_date,
      series_exception: t.series_exception,
      series_last: t.series_last,
      production: task_production(t),
      # D53 §4.7: "From idea: …", filled in per viewer by the task board
      # controller (`IdeaBoards.from_idea/2`).
      from_idea: nil,
      inserted_at: t.inserted_at,
      updated_at: t.updated_at
    }
  end

  # D53 §3.3: everyone on a task or series, first first. `assignee_id` and
  # `assignee_name` above stay for one release (UI tabs on the old version).
  defp task_assignees(record) do
    case record.assignees do
      %Ecto.Association.NotLoaded{} -> []
      people -> Enum.map(people, &%{id: &1.id, name: &1.name})
    end
  end

  # D49 §3.12: a task made from a production step (nil for the board's own):
  # the step, its batch (nil for a standalone CIP) and whether that batch is
  # planned (the Planned batch pill and "Show planned batches"), and what the
  # board's prompts name (`TaskLink.describe/1`; lead decisions 8.2).
  defp task_production(%{production_step_id: nil}), do: nil

  defp task_production(t) do
    batch =
      case t.production_step do
        %{batch: %RockcutApi.Brewing.Batch{} = b} -> b
        _ -> nil
      end

    %{
      step_id: t.production_step_id,
      batch_id: batch && batch.id,
      batch_status: batch && batch.status,
      planned: batch != nil and batch.status == "planned",
      step_name: t.step_name,
      batch_label: t.batch_label,
      # D56 §3.2: the step's Pass / Fail, for the board's ✓ / ✗.
      result: step_result(t.production_step),
      # D56 decision 14: a failed test's retest day ("✗ Fail · retest Wed").
      retest_on: retest_on(t.production_step),
      # Mark not done is refused while the retest is done (`retest_done`).
      retest_done: retest_done(t.production_step),
      # D64 §4.8: a Yeast harvest step's check-off (`harvested` / `dumped`).
      yeast_outcome: step_yeast_outcome(t.production_step)
    }
  end

  defp step_result(%RockcutApi.Production.Step{result: result}), do: result
  defp step_result(_not_loaded), do: nil

  defp step_yeast_outcome(%RockcutApi.Production.Step{yeast_outcome: o}), do: o
  defp step_yeast_outcome(_not_loaded), do: nil

  defp retest_on(%RockcutApi.Production.Step{retest: %RockcutApi.Production.Step{due_on: d}}),
    do: d

  defp retest_on(_none), do: nil

  defp retest_done(%RockcutApi.Production.Step{retest: %RockcutApi.Production.Step{done_on: d}}),
    do: d != nil

  defp retest_done(_none), do: false

  @doc "A recurring task's rule (D39 `GET /api/boards/brewery/tasks/:id/series`), for the dialog."
  def task_series(s, preview) do
    %{
      id: s.id,
      title: s.title,
      notes: s.notes,
      assignee_id: s.assignee_id,
      assignees: task_assignees(s),
      frequency: s.frequency,
      month_rule: s.month_rule,
      interval: s.interval,
      weekdays: s.weekdays,
      day_of_month: s.day_of_month,
      week_of_month: s.week_of_month,
      weekday: s.weekday,
      start_date: s.start_date,
      until_date: s.until_date,
      count: s.count,
      later_open: preview.later_open,
      later_changed: preview.later_changed
    }
  end

  defp daily_card(date, card) do
    %{
      date: date,
      done: card.done,
      total: card.total,
      items:
        Enum.map(card.items, fn %{item: i, check: c} ->
          %{
            daily_item_id: i.id,
            name: i.name,
            active: i.active,
            checked: not is_nil(c),
            completed_by_name: c && maybe_render(c, :completed_by, &name_of/1),
            completed_at: c && c.completed_at
          }
        end)
    }
  end

  def daily_item(i) do
    json = %{id: i.id, name: i.name, position: i.position, active: i.active}
    # D42: only the retired list sets `deletable`.
    if is_nil(i.deletable), do: json, else: Map.put(json, :deletable, i.deletable)
  end

  def task_event(ev) do
    %{
      id: ev.id,
      task_id: ev.task_id,
      action: ev.action,
      title: ev.title,
      actor_id: ev.actor_id,
      actor_name: maybe_render(ev, :actor, &name_of/1),
      on_shared_device: not is_nil(ev.device_id),
      detail: ev.detail,
      inserted_at: ev.inserted_at
    }
  end

  defp name_of(nil), do: nil
  defp name_of(u), do: u.name

  # ── Production setup (D46) ─────────────────────────────────────────

  @doc "A tank with its out-of-service periods, each with `state` (now / coming / past) for `today`."
  def production_tank(t, today) do
    %{
      id: t.id,
      name: t.name,
      abbreviation: t.abbreviation,
      kind: t.kind,
      capacity_bbl: decimal_number(t.capacity_bbl),
      location: t.location,
      position: t.position,
      notes: t.notes,
      retired_at: t.retired_at,
      outages: maybe_render(t, :outages, &Enum.map(&1, fn o -> tank_outage(o, today) end))
    }
  end

  def tank_outage(o, today) do
    %{
      id: o.id,
      tank_id: o.tank_id,
      starts_on: o.starts_on,
      ends_on: o.ends_on,
      reason: o.reason,
      state: RockcutApi.Production.outage_state(o, today),
      label: RockcutApi.Production.period_label(o)
    }
  end

  def production_phase(p) do
    %{id: p.id, name: p.name, color: p.color, position: p.position, retired_at: p.retired_at}
  end

  def production_step_type(t) do
    %{
      id: t.id,
      name: t.name,
      full_name: t.full_name,
      behavior: t.behavior,
      built_in: t.built_in,
      starts_phase_id: t.starts_phase_id,
      on_task_list: t.on_task_list,
      # D56 §3.2: its steps record Pass / Fail at check-off.
      has_result: t.has_result,
      position: t.position,
      retired_at: t.retired_at
    }
  end

  @doc "A template in the list: no entries, with `step_count` and `issues`."
  def process_template_summary(t) do
    %{
      id: t.id,
      name: t.name,
      notes: t.notes,
      position: t.position,
      retired_at: t.retired_at,
      step_count: t.step_count,
      issues: t.issues
    }
  end

  @doc "A template with its entries (day order) and links."
  def process_template(t) do
    Map.merge(process_template_summary(t), %{
      steps: Enum.map(t.steps, &template_step/1),
      links: Enum.map(t.links, &template_link/1)
    })
  end

  def template_step(s) do
    type = s.step_type

    %{
      id: s.id,
      step_type_id: s.step_type_id,
      marker: is_nil(s.step_type_id),
      name: RockcutApi.Production.step_name(s),
      type_name: type && type.name,
      full_name: type && type.full_name,
      behavior: type && type.behavior,
      phase_id: s.phase_id,
      day_offset: s.day_offset,
      vessel_index: s.vessel_index,
      detail: s.detail,
      temperature: s.temperature,
      split_method: s.split_method,
      cip_method: if(type && type.behavior == "cip", do: s.cip_method || "sanitize_full"),
      package_partial: s.package_partial,
      notes: s.notes,
      on_task_list: s.on_task_list,
      position: s.position,
      ramp_group: s.ramp_group,
      # D56 §3.2: "Retest after [2] days" when the type has a result.
      has_result: type != nil and type.has_result,
      retest_days: s.retest_days
    }
  end

  def template_link(l) do
    %{
      id: l.id,
      from_step_id: l.from_step_id,
      to_step_id: l.to_step_id,
      default_answer: l.default_answer
    }
  end

  # ── Production schedule (D47) ──────────────────────────────────────

  @doc "`GET /api/production/schedule`: see `Production.Schedule.load/3`."
  def production_schedule(sched) do
    %{
      from: sched.from,
      to: sched.to,
      today: sched.today,
      tanks: Enum.map(sched.tanks, &production_tank(&1, sched.today)),
      phases: Enum.map(sched.phases, &production_phase/1),
      step_types: Enum.map(sched.step_types, &production_step_type/1),
      batches: Enum.map(sched.batches, &production_batch/1),
      cips: Enum.map(sched.cips, &production_step(&1, [])),
      statuses: sched.statuses,
      flags: sched.flags,
      condition_marks: Enum.map(sched.marks, &production_condition_mark/1),
      sanitize_on_dirty: sched.sanitize_on_dirty,
      next_batch_number: sched.next_batch_number,
      brewers: sched.brewers
    }
  end

  @doc "D48: a tank's clean / dirty mark, with who made it."
  def production_condition_mark(m) do
    %{
      id: m.id,
      tank_id: m.tank_id,
      state: m.state,
      marked_on: m.marked_on,
      note: m.note,
      user_id: m.user_id,
      user_name: m.user && m.user.name,
      inserted_at: m.inserted_at
    }
  end

  @doc "A scheduled batch from `Production.Schedule.batches/1`, with its vessels, steps and links."
  def production_batch(%{batch: b} = entry) do
    %{
      id: b.id,
      brand_id: b.brand_id,
      brand_name: b.brand && b.brand.name,
      batch_number: b.batch_number,
      p_number: entry.p_number,
      label: entry.label,
      status: b.status,
      pencilled: b.pencilled,
      volume_bbl: decimal_number(b.volume_bbl),
      template_id: b.template_id,
      template_name: b.template && b.template.name,
      brew_two_days: b.brew_two_days,
      split_parent_id: b.split_parent_id,
      part_number: b.part_number,
      # D48 DEV QA fix cycle 4: the part that stays in its parent's tank.
      split_stays: b.split_stays,
      # D48: a part's fill is its parent's Split step.
      split_step_id: entry[:origin] && entry.origin.fill && entry.origin.fill.id,
      vessels: Enum.map(entry.vessels, &%{vessel_index: &1.vessel_index, tank_id: &1.tank_id}),
      steps: Enum.map(entry.steps, &production_step(&1, entry.steps)),
      links:
        Enum.map(
          entry.links,
          &%{
            id: &1.id,
            from_step_id: &1.from_step_id,
            to_step_id: &1.to_step_id,
            default_answer: &1.default_answer
          }
        )
    }
  end

  @doc """
  A batch step or a standalone CIP (`batch_steps`: the batch's steps, to
  mark its first Brew day). Needs type, phase, assignee, done-by and (D50)
  done-on-device loaded.
  """
  def production_step(s, batch_steps) do
    type = s.step_type

    %{
      id: s.id,
      batch_id: s.batch_id,
      tank_id: s.tank_id,
      step_type_id: s.step_type_id,
      marker: RockcutApi.Production.Step.marker?(s),
      name: RockcutApi.Production.Steps.name(s),
      type_name: type && type.name,
      full_name: type && type.full_name,
      behavior: type && type.behavior,
      first_brew: s.batch_id != nil and RockcutApi.Production.Steps.first_brew?(s, batch_steps),
      phase_id: s.phase_id,
      vessel_index: s.vessel_index,
      detail: s.detail,
      temperature: s.temperature,
      split_method: s.split_method,
      cip_method: if(type && type.behavior == "cip", do: s.cip_method || "sanitize_full"),
      package_partial: s.package_partial,
      notes: s.notes,
      on_task_list: s.on_task_list,
      position: s.position,
      due_on: s.due_on,
      done_on: s.done_on,
      done_by: s.done_by && %{id: s.done_by.id, name: s.done_by.name},
      # D50: "· on Brewhouse" when it was checked off on a shared device.
      done_on_device: s.done_on_device && %{id: s.done_on_device.id, name: s.done_on_device.name},
      assignee_id: s.assignee_id,
      assignee: s.assignee && %{id: s.assignee.id, name: s.assignee.name},
      added: s.added,
      ramp_group: s.ramp_group,
      # D56 §3.2: Pass / Fail (`pass` / `fail`, nil when not recorded), the
      # days to a retest, and the failed step a retest retests.
      has_result: type != nil and type.has_result,
      result: s.result,
      retest_days: s.retest_days,
      retest_of_id: s.retest_of_id,
      # D56 decision 22: planned before brew day, whatever its date is now.
      pre_brew: s.pre_brew,
      # D64 §4.8: a Yeast harvest step's check-off (`harvested` / `dumped`) and note.
      yeast_outcome: s.yeast_outcome,
      yeast_note: s.yeast_note
    }
  end

  defp decimal_number(nil), do: nil
  defp decimal_number(%Decimal{} = d), do: Decimal.to_float(d)
  defp decimal_number(n), do: n

  # ── Shared devices (D33) ───────────────────────────────────────────

  @doc """
  What a shared device may see of a rendered response (DEV G8, decision Q6:
  assume customers can read anything the device can fetch): no email
  addresses anywhere. People get `data` unchanged. Used by every controller
  action in the router's `:device_allowed` scope.
  """
  def for_viewer(data, viewer) do
    if RockcutApi.Authz.device?(viewer), do: drop_emails(data), else: data
  end

  defp drop_emails(%{__struct__: _} = struct), do: struct

  defp drop_emails(map) when is_map(map) do
    for {k, v} <- map, k not in [:email, "email"], into: %{}, do: {k, drop_emails(v)}
  end

  defp drop_emails(list) when is_list(list), do: Enum.map(list, &drop_emails/1)
  defp drop_emails(other), do: other

  def device(d) do
    %{
      id: d.id,
      name: d.name,
      active: d.active,
      color_mode: d.color_mode,
      # D50: the device's own "Show planned batches" (the board and the Gantt).
      show_planned_batches: d.show_planned_batches,
      home_department_id: d.home_department_id,
      home_department: maybe_render(d, :home_department, &department/1),
      tokens: maybe_render(d, :device_tokens, &Enum.map(&1, fn t -> device_token(t) end)),
      inserted_at: d.inserted_at
    }
  end

  def device_token(t) do
    %{
      id: t.id,
      name: t.name,
      paired_by: maybe_render(t, :paired_by, &audit_actor/1),
      paired_at: t.inserted_at,
      last_seen_at: t.last_seen_at,
      revoked_at: t.revoked_at
    }
  end

  def audit_entry(entry) do
    %{
      id: entry.id,
      action: entry.action,
      detail: entry.detail,
      actor: maybe_render(entry, :actor, &audit_actor/1),
      target: maybe_render(entry, :target, &audit_actor/1),
      inserted_at: entry.inserted_at
    }
  end

  defp audit_actor(nil), do: nil
  defp audit_actor(u), do: %{id: u.id, email: u.email, name: u.name}

  # ── Scheduling views ───────────────────────────────────────────────

  def position(p) do
    %{
      id: p.id,
      name: p.name,
      group: p.group,
      active: p.active,
      department_id: p.department_id,
      color_shade: p.color_shade
    }
  end

  def shift(s) do
    %{
      id: s.id,
      department_id: s.department_id,
      department: maybe_render(s, :department, &department/1),
      position_id: s.position_id,
      position: maybe_render(s, :position, &position/1),
      assignee_id: s.assignee_id,
      assignee: maybe_render(s, :assignee, &shift_user/1),
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      status: s.status,
      notes: s.notes,
      inserted_at: s.inserted_at,
      updated_at: s.updated_at
    }
  end

  def schedule_event(e) do
    %{
      id: e.id,
      department_id: e.department_id,
      department: maybe_render(e, :department, &department/1),
      title: e.title,
      notes: e.notes,
      all_day: e.all_day,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      status: e.status,
      created_by_id: e.created_by_id,
      series_id: e.series_id,
      series_exception: e.series_exception,
      series: maybe_render(e, :series, &event_series/1),
      inserted_at: e.inserted_at,
      updated_at: e.updated_at
    }
  end

  def event_series(nil), do: nil

  def event_series(s) do
    %{
      id: s.id,
      frequency: s.frequency,
      interval: s.interval,
      weekdays: s.weekdays,
      week_of_month: s.week_of_month,
      weekday: s.weekday,
      start_date: s.start_date,
      until_date: s.until_date,
      count: s.count,
      generated_through: s.generated_through
    }
  end

  defp shift_user(nil), do: nil
  defp shift_user(u), do: %{id: u.id, email: u.email, name: u.name}

  def time_off_request(r) do
    %{
      id: r.id,
      user_id: r.user_id,
      user: maybe_render(r, :user, &shift_user/1),
      type: r.type,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      all_day: r.all_day,
      note: r.note,
      status: r.status,
      reviewer_note: r.reviewer_note,
      reviewed_at: r.reviewed_at,
      reviewed_by_id: r.reviewed_by_id,
      reviewed_by: maybe_render(r, :reviewed_by, &shift_user/1),
      inserted_at: r.inserted_at
    }
  end

  def availability_slot(s) do
    %{
      id: s.id,
      user_id: s.user_id,
      user: maybe_render(s, :user, &shift_user/1),
      weekday: s.weekday,
      kind: s.kind,
      all_day: s.all_day,
      start_time: s.start_time,
      end_time: s.end_time,
      note: s.note,
      inserted_at: s.inserted_at
    }
  end

  def shift_template(t) do
    %{
      id: t.id,
      position_id: t.position_id,
      name: t.name,
      start_time: t.start_time,
      end_time: t.end_time
    }
  end

  def schedule_template(t) do
    %{
      id: t.id,
      name: t.name,
      kind: t.kind,
      items: maybe_render(t, :items, &Enum.map(&1, fn i -> schedule_template_item(i) end)),
      inserted_at: t.inserted_at,
      updated_at: t.updated_at
    }
  end

  def schedule_template_item(i) do
    %{
      id: i.id,
      position_id: i.position_id,
      position: maybe_render(i, :position, &position/1),
      assignee_id: i.assignee_id,
      day_index: i.day_index,
      start_time: i.start_time,
      end_time: i.end_time,
      notes: i.notes
    }
  end

  def notification(n) do
    %{
      id: n.id,
      event: n.event,
      title: n.title,
      body: n.body,
      data: n.data,
      read_at: n.read_at,
      inserted_at: n.inserted_at
    }
  end

  def ingredient_category(cat) do
    %{
      id: cat.id,
      name: cat.name,
      key: cat.key,
      parent_id: cat.parent_id,
      sort_order: cat.sort_order,
      delete_blocked: cat.delete_blocked,
      # D65 §4.2: the forms, units and packs its products take, and whether
      # it takes a manufacturer, children and custom fields (`Catalog.describe/1`).
      catalog: RockcutApi.Ingredients.Catalog.describe(cat),
      field_definitions:
        maybe_render(
          cat,
          :field_definitions,
          &Enum.map(&1, fn d -> category_field_definition(d) end)
        ),
      inserted_at: cat.inserted_at,
      updated_at: cat.updated_at
    }
  end

  def category_field_definition(d) do
    %{
      id: d.id,
      category_id: d.category_id,
      field_name: d.field_name,
      field_type: d.field_type,
      options: d.options,
      required: d.required,
      sort_order: d.sort_order,
      inserted_at: d.inserted_at,
      updated_at: d.updated_at
    }
  end

  def ingredient(ing) do
    %{
      id: ing.id,
      name: ing.name,
      category_id: ing.category_id,
      category: maybe_render(ing, :category, &ingredient_category_summary/1),
      notes: ing.notes,
      formula: ing.formula,
      # D65: ion values (ppm @ 1 g/gal) on a Water Salts ingredient, by key.
      ions: ing.ions,
      # D64: a yeast strain's type (nil on every other ingredient).
      yeast_strain_type_id: ing.yeast_strain_type_id,
      delete_blocked: ing.delete_blocked,
      lots: maybe_render(ing, :lots, &Enum.map(&1, fn l -> ingredient_lot_summary(l) end)),
      inserted_at: ing.inserted_at,
      updated_at: ing.updated_at
    }
  end

  def ingredient_lot(lot) do
    %{
      id: lot.id,
      ingredient_id: lot.ingredient_id,
      ingredient: maybe_render(lot, :ingredient, &ingredient_summary/1),
      lot_number: lot.lot_number,
      product_id: lot.product_id,
      product: maybe_render(lot, :product, &product_summary/1),
      supplier_party_id: lot.supplier_party_id,
      supplier: maybe_render(lot, :supplier, &party_summary/1),
      pack_name: lot.pack_name,
      pack_size: lot.pack_size,
      unit: maybe_render(lot, :product, &RockcutApi.Ingredients.Products.unit/1),
      received_date: lot.received_date,
      crop_year: lot.crop_year,
      status: lot.status,
      features: lot_features(lot),
      outside_range: lot.outside_range,
      # D62 §4.8: the recipe's lot picker label for a hop lot, else nil.
      label: RockcutApi.Ingredients.Inventory.lot_label(lot),
      on_hand: lot.on_hand,
      unit_cost: lot.unit_cost,
      value: lot.value,
      estimated: lot.estimated,
      unvalued: lot.unvalued,
      delete_blocked: lot.delete_blocked,
      notes: lot.notes,
      inserted_at: lot.inserted_at,
      updated_at: lot.updated_at
    }
  end

  # ── D60 grain catalog and inventory ────────────────────────────────

  def party(p) do
    %{
      id: p.id,
      name: p.name,
      notes: p.notes,
      active: p.active,
      order_target_packs: p.order_target_packs,
      delete_blocked: p.delete_blocked,
      roles: maybe_render(p, :roles, fn roles -> roles |> Enum.map(& &1.role) |> Enum.sort() end),
      inserted_at: p.inserted_at,
      updated_at: p.updated_at
    }
  end

  def ingredient_product(p) do
    %{
      id: p.id,
      ingredient_id: p.ingredient_id,
      ingredient: maybe_render(p, :ingredient, &ingredient_summary/1),
      category: maybe_render(p.ingredient, :category, &ingredient_category_summary/1),
      # D62: the top-level category's key (`grains` for a grain on Base).
      category_key: maybe_render(p.ingredient, :category, &RockcutApi.Ingredients.Catalog.key/1),
      manufacturer_party_id: p.manufacturer_party_id,
      manufacturer: maybe_render(p, :manufacturer, &party_summary/1),
      name: p.name,
      unit: p.unit,
      # D65: "tablets" for `each` on a Tablet product; else the unit.
      unit_label: RockcutApi.Ingredients.Products.unit_label(p),
      form: p.form,
      origin: p.origin,
      # D65: its ingredient's ion values, read-only.
      ions: p.ions,
      display_name: RockcutApi.Ingredients.Products.display_name(p),
      notes: p.notes,
      active: p.active,
      features: maybe_render(p, :feature_values, &RockcutApi.Ingredients.Features.values_map/1),
      offers: maybe_render(p, :offers, &Enum.map(&1, fn o -> supplier_offer(o) end)),
      min_on_hand_packs: p.min_on_hand_packs,
      reorder_offer_id: p.reorder_offer_id,
      below_minimum: p.below_minimum,
      lock_version: p.lock_version,
      on_hand: p.on_hand,
      expired: p.expired,
      inserted_at: p.inserted_at,
      updated_at: p.updated_at
    }
  end

  defp number(%Decimal{} = d) do
    if Decimal.eq?(Decimal.round(d, 0), d),
      do: Decimal.to_integer(Decimal.round(d, 0)),
      else: Decimal.to_float(d)
  end

  def feature_type(t) do
    %{
      id: t.id,
      key: t.key,
      label: t.label,
      unit_label: t.unit_label,
      min: t.min,
      max: t.max,
      decimals: t.decimals,
      entered_units: RockcutApi.Ingredients.Units.entered_units(t.key),
      categories:
        maybe_render(t, :applicability, fn rows ->
          Enum.map(rows, fn a ->
            %{
              category_id: a.category_id,
              name: a.category.name,
              sort_order: a.sort_order,
              required: a.required,
              product_mode: a.product_mode,
              lot_mode: a.lot_mode,
              lot_required: a.lot_required,
              only_unit: a.only_unit,
              only_form: a.only_form
            }
          end)
        end)
    }
  end

  def supplier_offer(o) do
    %{
      id: o.id,
      product_id: o.product_id,
      supplier_party_id: o.supplier_party_id,
      supplier: maybe_render(o, :supplier, &party_summary/1),
      order_name: o.order_name,
      pack_name: o.pack_name,
      pack_size: o.pack_size,
      pack_note: o.pack_note,
      form: o.form,
      notes: o.notes,
      active: o.active,
      current_price: o.current_price && offer_price(o.current_price, o.pack_size),
      inserted_at: o.inserted_at,
      updated_at: o.updated_at
    }
  end

  @doc "A price per pack, with $ per unit worked out from the offer's pack size."
  def offer_price(p, pack_size) do
    %{
      id: p.id,
      offer_id: p.offer_id,
      price_per_pack: p.price_per_pack,
      price_per_unit: pack_size && Decimal.round(Decimal.div(p.price_per_pack, pack_size), 4),
      effective_on: p.effective_on,
      note: p.note,
      entered_by: maybe_render(p, :entered_by, &person_name/1),
      inserted_at: p.inserted_at
    }
  end

  # D61 lead decisions 1 (item 18): a receipt from an order names the order
  # in History, its reference else "Order #12".
  defp movement_order_note(%{
         purchase_order_line: %{order: %RockcutApi.Ingredients.PurchaseOrder{} = o}
       }),
       do: if(o.reference in [nil, ""], do: "Order ##{o.id}", else: o.reference)

  defp movement_order_note(_), do: nil

  def inventory_movement(m) do
    %{
      id: m.id,
      lot_id: m.lot_id,
      lot_number: maybe_render(m, :lot, & &1.lot_number),
      product_id: maybe_render(m, :lot, & &1.product_id),
      kind: m.kind,
      quantity: m.quantity,
      occurred_on: m.occurred_on,
      partner_party_id: m.partner_party_id,
      partner: maybe_render(m, :partner, &party_summary/1),
      note: m.note || movement_order_note(m),
      purchase_order_id: maybe_render(m, :purchase_order_line, & &1.order_id),
      # D64 §4.6: the batch a pitch went into.
      batch_id: m.batch_id,
      entered_by: maybe_render(m, :entered_by, &person_name/1),
      inserted_at: m.inserted_at
    }
  end

  defp person_name(u), do: %{id: u.id, name: u.name}

  # ── D61 purchasing, contracts, reorder ─────────────────────────────

  def contract(c) do
    %{
      id: c.id,
      supplier_party_id: c.supplier_party_id,
      supplier: maybe_render(c, :supplier, &party_summary/1),
      year: c.year,
      notes: c.notes,
      created_by: maybe_render(c, :created_by, &person_name/1),
      lines: maybe_render(c, :lines, &Enum.map(&1, fn l -> contract_line(l) end)),
      remaining: c.remaining,
      over: c.over,
      remaining_lb: c.remaining_lb,
      over_lb: c.over_lb,
      delete_blocked: RockcutApi.Ingredients.Contracts.delete_blocked(c),
      lock_version: c.lock_version,
      inserted_at: c.inserted_at,
      updated_at: c.updated_at
    }
  end

  def contract_line(l) do
    Map.merge(
      %{
        id: l.id,
        product_id: l.product_id,
        product: maybe_render(l, :product, &product_summary/1),
        offer_id: l.offer_id,
        # Whole sacks as an integer (as D61), lb as a number with its decimals.
        quantity: l.quantity && number(l.quantity),
        price: l.price
      },
      l.figures || %{}
    )
  end

  def purchase_order(o) do
    alias RockcutApi.Ingredients.Orders

    Map.merge(
      %{
        id: o.id,
        supplier_party_id: o.supplier_party_id,
        supplier: maybe_render(o, :supplier, &party_summary/1),
        ordered_on: o.ordered_on,
        expected_on: o.expected_on,
        reference: o.reference,
        off_contract: o.off_contract,
        notes: o.notes,
        status: o.status,
        received_on: o.received_on,
        created_by: maybe_render(o, :created_by, &person_name/1),
        received_by: maybe_render(o, :received_by, &person_name/1),
        cancelled_by: maybe_render(o, :cancelled_by, &person_name/1),
        received_at: o.received_at,
        cancelled_at: o.cancelled_at,
        lock_version: o.lock_version,
        lines:
          Enum.map(o.lines, fn l ->
            n = Orders.counted_packs(o, l)

            %{
              id: l.id,
              offer_id: l.offer_id,
              offer: %{
                id: l.offer.id,
                order_name: l.offer.order_name,
                label: Orders.offer_label(l.offer),
                pack_name: l.offer.pack_name,
                pack_size: l.offer.pack_size,
                pack_note: l.offer.pack_note,
                product_id: l.offer.product_id,
                product: product_summary(l.offer.product)
              },
              packs_ordered: l.packs_ordered,
              packs_received: l.packs_received,
              price_per_pack: l.price_per_pack,
              line_quantity: Orders.line_quantity(o, l),
              line_dollars: Decimal.round(Decimal.mult(l.price_per_pack, n), 2)
            }
          end),
        inserted_at: o.inserted_at,
        updated_at: o.updated_at
      },
      Orders.totals(o)
    )
  end

  def reorder_row(r) do
    %{
      product_id: r.product.id,
      product: product_summary(r.product),
      min_on_hand_packs: r.product.min_on_hand_packs,
      reorder_offer_id: r.product.reorder_offer_id,
      offer:
        r.offer &&
          Map.put(
            supplier_offer(r.offer),
            :label,
            RockcutApi.Ingredients.Orders.offer_label(Map.put(r.offer, :product, r.product))
          ),
      on_hand: r.on_hand,
      on_hand_packs: r.on_hand_packs,
      on_order: r.on_order,
      on_order_packs: r.on_order_packs,
      to_order: r.to_order,
      below_minimum: r.below_minimum
    }
  end

  def brand(b) do
    %{
      id: b.id,
      name: b.name,
      style: b.style,
      description: b.description,
      target_abv: b.target_abv,
      target_ibu: b.target_ibu,
      target_srm: b.target_srm,
      status: b.status,
      inserted_at: b.inserted_at,
      updated_at: b.updated_at
    }
  end

  def recipe(r) do
    %{
      id: r.id,
      brand_id: r.brand_id,
      brand: maybe_render(r, :brand, &brand/1),
      version_major: r.version_major,
      version_minor: r.version_minor,
      version: "v#{r.version_major}.#{r.version_minor}",
      batch_size: r.batch_size,
      batch_size_unit: r.batch_size_unit,
      boil_time: r.boil_time,
      efficiency_target: r.efficiency_target,
      status: r.status,
      notes: r.notes,
      recipe_ingredients:
        maybe_render(r, :recipe_ingredients, &Enum.map(&1, fn ri -> recipe_ingredient(ri) end)),
      mash_steps: maybe_render(r, :mash_steps, &Enum.map(&1, fn ms -> mash_step(ms) end)),
      process_steps:
        maybe_render(r, :process_steps, &Enum.map(&1, fn ps -> recipe_process_step(ps) end)),
      water_profile: maybe_render(r, :water_profile, &water_profile/1),
      inserted_at: r.inserted_at,
      updated_at: r.updated_at
    }
  end

  def recipe_ingredient(ri) do
    %{
      id: ri.id,
      recipe_id: ri.recipe_id,
      lot_id: ri.lot_id,
      lot: maybe_render(ri, :lot, &ingredient_lot/1),
      amount: ri.amount,
      unit: ri.unit,
      use: ri.use,
      time_minutes: ri.time_minutes,
      sort_order: ri.sort_order,
      notes: ri.notes,
      inserted_at: ri.inserted_at,
      updated_at: ri.updated_at
    }
  end

  def mash_step(ms) do
    %{
      id: ms.id,
      recipe_id: ms.recipe_id,
      step_number: ms.step_number,
      name: ms.name,
      temperature: ms.temperature,
      duration: ms.duration,
      type: ms.type,
      notes: ms.notes,
      inserted_at: ms.inserted_at,
      updated_at: ms.updated_at
    }
  end

  def recipe_process_step(ps) do
    %{
      id: ps.id,
      recipe_id: ps.recipe_id,
      step_number: ps.step_number,
      name: ps.name,
      day: ps.day,
      temperature: ps.temperature,
      duration: ps.duration,
      duration_unit: ps.duration_unit,
      notes: ps.notes,
      inserted_at: ps.inserted_at,
      updated_at: ps.updated_at
    }
  end

  def water_profile(nil), do: nil

  def water_profile(wp) do
    %{
      id: wp.id,
      recipe_id: wp.recipe_id,
      calcium: wp.calcium,
      magnesium: wp.magnesium,
      sodium: wp.sodium,
      sulfate: wp.sulfate,
      chloride: wp.chloride,
      bicarbonate: wp.bicarbonate,
      ph_target: wp.ph_target,
      notes: wp.notes,
      inserted_at: wp.inserted_at,
      updated_at: wp.updated_at
    }
  end

  def batch(b) do
    %{
      id: b.id,
      brand_id: b.brand_id,
      brand: maybe_render(b, :brand, &brand/1),
      brew_turns: maybe_render(b, :brew_turns, &Enum.map(&1, fn t -> brew_turn(t) end)),
      batch_number: b.batch_number,
      status: b.status,
      actual_og: b.actual_og,
      actual_fg: b.actual_fg,
      actual_abv: b.actual_abv,
      actual_volume: b.actual_volume,
      ferm_start_date: b.ferm_start_date,
      ferm_end_date: b.ferm_end_date,
      ferm_temp: b.ferm_temp,
      package_date: b.package_date,
      package_type: b.package_type,
      rating: b.rating,
      tasting_notes: b.tasting_notes,
      notes: b.notes,
      inserted_at: b.inserted_at,
      updated_at: b.updated_at
    }
  end

  def brew_turn(t) do
    %{
      id: t.id,
      batch_id: t.batch_id,
      recipe_id: t.recipe_id,
      recipe: maybe_render(t, :recipe, &recipe_summary/1),
      turn_number: t.turn_number,
      brew_date: t.brew_date,
      actual_og: t.actual_og,
      actual_volume: t.actual_volume,
      actual_efficiency: t.actual_efficiency,
      notes: t.notes,
      inserted_at: t.inserted_at,
      updated_at: t.updated_at
    }
  end

  def batch_log_entry(e) do
    %{
      id: e.id,
      batch_id: e.batch_id,
      timestamp: e.timestamp,
      event_type: e.event_type,
      gravity: e.gravity,
      temperature: e.temperature,
      ph: e.ph,
      notes: e.notes,
      inserted_at: e.inserted_at,
      updated_at: e.updated_at
    }
  end

  # Compact renderers for nested associations

  defp ingredient_category_summary(cat) do
    %{id: cat.id, name: cat.name, key: cat.key, parent_id: cat.parent_id}
  end

  defp ingredient_summary(ing) do
    %{
      id: ing.id,
      name: ing.name,
      # D64: the library's Strain Type column and filter.
      yeast_strain_type_id: ing.yeast_strain_type_id,
      category: maybe_render(ing, :category, &ingredient_category_summary/1)
    }
  end

  defp ingredient_lot_summary(lot) do
    %{
      id: lot.id,
      lot_number: lot.lot_number,
      product_id: lot.product_id,
      supplier_party_id: lot.supplier_party_id,
      pack_name: lot.pack_name,
      pack_size: lot.pack_size,
      received_date: lot.received_date,
      crop_year: lot.crop_year,
      status: lot.status,
      features: lot_features(lot),
      notes: lot.notes
    }
  end

  # D60: specs by feature key (%{"extract_fgdb" => %{value, entered_value,
  # entered_unit}}); nil when the feature values weren't loaded.
  defp lot_features(lot),
    do: maybe_render(lot, :feature_values, &RockcutApi.Ingredients.Features.values_map/1)

  defp party_summary(p), do: %{id: p.id, name: p.name}

  defp product_summary(p) do
    %{
      id: p.id,
      name: p.name,
      display_name: RockcutApi.Ingredients.Products.display_name(p),
      unit: p.unit,
      unit_label: RockcutApi.Ingredients.Products.unit_label(p),
      form: p.form,
      manufacturer: maybe_render(p, :manufacturer, &party_summary/1)
    }
  end

  defp recipe_summary(r) do
    %{
      id: r.id,
      version: "v#{r.version_major}.#{r.version_minor}",
      brand: maybe_render(r, :brand, &brand/1)
    }
  end

  # Returns nil for not-loaded associations instead of crashing
  defp maybe_render(struct, field, render_fn) do
    case Map.get(struct, field) do
      %Ecto.Association.NotLoaded{} -> nil
      nil -> nil
      value -> render_fn.(value)
    end
  end
end
