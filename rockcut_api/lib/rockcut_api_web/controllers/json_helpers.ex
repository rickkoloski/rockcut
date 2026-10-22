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

  def membership(m) do
    %{
      department_id: m.department_id,
      department_key: maybe_render(m, :department, & &1.key),
      department_name: maybe_render(m, :department, & &1.name),
      role: m.role
    }
  end

  def department(d) do
    %{id: d.id, name: d.name, key: d.key, color: d.color, assignable: d.assignable}
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
        color_mode: "light"
      },
      flags
    )
    |> Map.merge(%{user: user(user), capabilities: capabilities})
  end

  @doc "One of `/api/me`'s `task_boards` (D41): `key`, `name`, `color`, `manage`."
  def task_board_entry(%{department: d, manage: manage}),
    do: %{key: d.key, name: d.name, color: d.color, manage: manage}

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
      future: Enum.map(b.future, &task_card/1)
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
      inserted_at: t.inserted_at,
      updated_at: t.updated_at
    }
  end

  @doc "A recurring task's rule (D39 `GET /api/boards/brewery/tasks/:id/series`), for the dialog."
  def task_series(s, preview) do
    %{
      id: s.id,
      title: s.title,
      notes: s.notes,
      assignee_id: s.assignee_id,
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
      package_partial: s.package_partial,
      notes: s.notes,
      on_task_list: s.on_task_list,
      position: s.position,
      ramp_group: s.ramp_group
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
      next_batch_number: sched.next_batch_number,
      brewers: sched.brewers
    }
  end

  @doc "A scheduled batch from `Production.Schedule.batches/1`, with its vessels, steps and links."
  def production_batch(%{batch: b} = entry) do
    %{
      id: b.id,
      brand_id: b.brand_id,
      brand_name: b.brand && b.brand.name,
      batch_number: b.batch_number,
      p_number: entry.p_number && "P#{entry.p_number}",
      label: entry.label,
      status: b.status,
      volume_bbl: decimal_number(b.volume_bbl),
      template_id: b.template_id,
      template_name: b.template && b.template.name,
      brew_two_days: b.brew_two_days,
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
  mark its first Brew day). Needs type, phase, assignee and done-by loaded.
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
      package_partial: s.package_partial,
      notes: s.notes,
      on_task_list: s.on_task_list,
      position: s.position,
      due_on: s.due_on,
      done_on: s.done_on,
      done_by: s.done_by && %{id: s.done_by.id, name: s.done_by.name},
      assignee_id: s.assignee_id,
      assignee: s.assignee && %{id: s.assignee.id, name: s.assignee.name},
      added: s.added,
      ramp_group: s.ramp_group
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
      sort_order: cat.sort_order,
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
      supplier: lot.supplier,
      received_date: lot.received_date,
      status: lot.status,
      alpha_acid: lot.alpha_acid,
      color_lovibond: lot.color_lovibond,
      attenuation: lot.attenuation,
      extract_potential_fgdb: lot.extract_potential_fgdb,
      maltster: lot.maltster,
      protein_perc: lot.protein_perc,
      moisture_perc: lot.moisture_perc,
      diastatic_power_linter: lot.diastatic_power_linter,
      order_name: lot.order_name,
      order_unit_size: lot.order_unit_size,
      properties: decode_json(lot.properties),
      notes: lot.notes,
      inserted_at: lot.inserted_at,
      updated_at: lot.updated_at
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
    %{id: cat.id, name: cat.name}
  end

  defp ingredient_summary(ing) do
    %{
      id: ing.id,
      name: ing.name,
      category: maybe_render(ing, :category, &ingredient_category_summary/1)
    }
  end

  defp ingredient_lot_summary(lot) do
    %{
      id: lot.id,
      lot_number: lot.lot_number,
      supplier: lot.supplier,
      received_date: lot.received_date,
      status: lot.status,
      alpha_acid: lot.alpha_acid,
      color_lovibond: lot.color_lovibond,
      attenuation: lot.attenuation,
      extract_potential_fgdb: lot.extract_potential_fgdb,
      maltster: lot.maltster,
      moisture_perc: lot.moisture_perc,
      protein_perc: lot.protein_perc,
      diastatic_power_linter: lot.diastatic_power_linter,
      order_name: lot.order_name,
      order_unit_size: lot.order_unit_size,
      notes: lot.notes
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

  defp decode_json(nil), do: nil

  defp decode_json(str) when is_binary(str) do
    case Jason.decode(str) do
      {:ok, decoded} -> decoded
      _ -> str
    end
  end

  defp decode_json(other), do: other
end
