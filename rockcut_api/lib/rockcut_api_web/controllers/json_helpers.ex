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

  def me(user, capabilities) do
    %{user: user(user), capabilities: capabilities}
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
    %{id: p.id, name: p.name, group: p.group, active: p.active, department_id: p.department_id}
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
