defmodule RockcutApi.Production do
  @moduledoc """
  Production scheduling's setup (D46, spec §3.2–§3.4): tanks and their
  out-of-service periods, phases and step types, and process templates with
  their entries and links. D47 adds batches and the Gantt on top.

  Callers authorize first (`Authz.can?(person, :setup | :write, :production)`)
  and pass ids from the request. The context validates data only. Every
  multi-row write runs in one transaction.

  **Lists.** Tanks, phases, step types and templates each keep a dense
  `position` (1, 2, 3, …) among their active rows; a retired row leaves the
  order and comes back at the bottom when restored. List functions return the
  active rows in order, then the retired ones by name.

  **Names** are unique ignoring case, retired rows included.

  "Today" is the Colorado date (`Tasks.today/0`); functions that need it take
  it as an optional last argument so tests can pin it.
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Accounts.User

  alias RockcutApi.Production.{
    Outage,
    Phase,
    StepType,
    Tank,
    Template,
    TemplateLink,
    TemplateStep
  }

  @doc """
  A name as it's stored and compared: trimmed and NFKC-normalized, so a
  full-width "Ｆv1" is the same name as "Fv1" (D46 QA minor 8).
  """
  def normalize_name(name) when is_binary(name),
    do: name |> :unicode.characters_to_nfkc_binary() |> String.trim()

  def normalize_name(name), do: name

  ## Tanks

  @doc "Every tank with its outages (by start): active in display order, then retired by name."
  def list_tanks do
    list_ordered(Tank) |> Repo.preload(:outages)
  end

  def get_tank(id), do: get(Tank, id, :outages)

  def create_tank(attrs) do
    insert_ordered(Tank, %Tank{}, attrs, &Tank.changeset/2, "tank")
    |> preload_ok(:outages)
  end

  def update_tank(%Tank{} = tank, attrs) do
    tank
    |> Tank.changeset(attrs)
    |> unique_name(Tank, "tank")
    |> Repo.update()
    |> preload_ok(:outages, force: true)
  end

  @doc "Reorder the active tanks: `ids` must be exactly the active tanks' ids."
  def reorder_tanks(ids), do: reorder(Tank, ids) |> preload_ok(:outages)

  @doc """
  Retire a tank. Refused while an unfinished step is planned in it:
  `{:error, :tank_in_use, batches}` (`batches_in_tank/1`).
  """
  def retire_tank(%Tank{} = tank) do
    case batches_in_tank(tank) do
      [] -> retire(tank) |> preload_ok(:outages, force: true)
      batches -> {:error, :tank_in_use, batches}
    end
  end

  def restore_tank(%Tank{} = tank), do: restore(tank) |> preload_ok(:outages, force: true)

  @doc """
  The batches with an unfinished step planned in `tank` (a step, not a
  phase marker, of the part that vessel puts there), as `%{id, label}` maps by label: what keeps a
  tank from being retired (P4).
  """
  def batches_in_tank(%Tank{id: tank_id}) do
    alias RockcutApi.Production.{BatchVessel, Batches, Step}

    ids =
      Repo.all(
        from(v in BatchVessel,
          join: s in Step,
          on: s.batch_id == v.batch_id and s.vessel_index == v.vessel_index,
          # Markers can't be checked off (D47), so they don't hold a tank.
          where: v.tank_id == ^tank_id and is_nil(s.done_on) and not is_nil(s.step_type_id),
          distinct: true,
          select: v.batch_id
        )
      )

    pnums = Batches.p_numbers()

    from(b in RockcutApi.Brewing.Batch, where: b.id in ^ids, preload: :brand)
    |> Repo.all()
    |> Enum.map(&%{id: &1.id, label: Batches.label(&1, pnums)})
    |> Enum.sort_by(& &1.label)
  end

  ## Out-of-service periods

  def get_outage(id), do: get(Outage, id, [])

  @doc """
  Add an out-of-service period to `tank`. A period that overlaps another on
  the same tank is refused: `{:error, :outage_overlap, other}`.
  """
  def create_outage(%Tank{} = tank, attrs, %User{} = actor) do
    %Outage{tank_id: tank.id, created_by_id: actor.id}
    |> Outage.changeset(attrs)
    |> save_outage(&Repo.insert/1)
  end

  def update_outage(%Outage{} = outage, attrs) do
    outage |> Outage.changeset(attrs) |> save_outage(&Repo.update/1)
  end

  def delete_outage(%Outage{} = outage) do
    with {:ok, _} <- Repo.delete(outage), do: {:ok, :deleted}
  end

  @doc """
  Back in service today: a current period ends yesterday, or is deleted when
  it starts today (`{:ok, :deleted}`). A period that isn't current is
  refused (`:outage_not_current`).
  """
  def end_outage_today(%Outage{} = outage, today \\ Tasks.today()) do
    cond do
      outage_state(outage, today) != :now ->
        {:error, :outage_not_current}

      outage.starts_on == today ->
        delete_outage(outage)

      true ->
        outage |> Ecto.Changeset.change(ends_on: Date.add(today, -1)) |> Repo.update()
    end
  end

  @doc "`:now`, `:coming` or `:past` for `today`."
  def outage_state(%Outage{starts_on: from, ends_on: to}, today \\ Tasks.today()) do
    cond do
      Date.compare(from, today) == :gt -> :coming
      is_nil(to) or Date.compare(to, today) != :lt -> :now
      true -> :past
    end
  end

  @doc ~S|A period in words: "Tue Oct 27 – Mon Nov 2", or "Tue Oct 27 – until further notice".|
  def period_label(%Outage{starts_on: from, ends_on: to}) do
    "#{day_label(from)} – #{if to, do: day_label(to), else: "until further notice"}"
  end

  defp day_label(%Date{} = d), do: Calendar.strftime(d, "%a %b %-d")

  defp save_outage(changeset, write) do
    Repo.transaction(fn ->
      with %{valid?: true} <- changeset,
           nil <- overlapping(changeset),
           {:ok, outage} <- write.(changeset) do
        outage
      else
        %Ecto.Changeset{} = cs -> Repo.rollback(cs)
        %Outage{} = other -> Repo.rollback({:outage_overlap, other})
        {:error, cs} -> Repo.rollback(cs)
      end
    end)
    |> case do
      {:error, {:outage_overlap, other}} -> {:error, :outage_overlap, other}
      other -> other
    end
  end

  # Another period on the same tank sharing a day with this one.
  defp overlapping(changeset) do
    tank_id = Ecto.Changeset.get_field(changeset, :tank_id)
    id = Ecto.Changeset.get_field(changeset, :id)
    from = Ecto.Changeset.get_field(changeset, :starts_on)
    to = Ecto.Changeset.get_field(changeset, :ends_on)

    from(o in Outage, where: o.tank_id == ^tank_id, order_by: o.starts_on)
    |> except_id(id)
    |> Repo.all()
    |> Enum.find(fn o ->
      (is_nil(to) or Date.compare(o.starts_on, to) != :gt) and
        (is_nil(o.ends_on) or Date.compare(from, o.ends_on) != :gt)
    end)
  end

  ## Phases

  def list_phases, do: list_ordered(Phase)
  def get_phase(id), do: get(Phase, id, [])

  def create_phase(attrs),
    do: insert_ordered(Phase, %Phase{}, attrs, &Phase.changeset/2, "phase")

  def update_phase(%Phase{} = phase, attrs) do
    phase |> Phase.changeset(attrs) |> unique_name(Phase, "phase") |> Repo.update()
  end

  def reorder_phases(ids), do: reorder(Phase, ids)

  @doc "Retire a phase: it leaves the pickers; templates and step types that use it keep it."
  def retire_phase(%Phase{} = phase), do: retire(phase)
  def restore_phase(%Phase{} = phase), do: restore(phase)

  ## Step types

  def list_step_types, do: list_ordered(StepType)
  def get_step_type(id), do: get(StepType, id, [])

  @doc "A brewer's new step type: always `plain`, never built in."
  def create_step_type(attrs) do
    insert_ordered(
      StepType,
      %StepType{behavior: "plain", built_in: false},
      attrs,
      &step_type_changeset/2,
      "step type"
    )
  end

  def update_step_type(%StepType{} = type, attrs) do
    type |> step_type_changeset(attrs) |> unique_name(StepType, "step type") |> Repo.update()
  end

  def reorder_step_types(ids), do: reorder(StepType, ids)

  @doc "Retire a step type; built-in types refuse (`:built_in`)."
  def retire_step_type(%StepType{built_in: true}), do: {:error, :built_in}
  def retire_step_type(%StepType{} = type), do: retire(type)
  def restore_step_type(%StepType{} = type), do: restore(type)

  # The phase a type starts must be an active phase (an unchanged one may
  # have been retired since).
  defp step_type_changeset(type, attrs) do
    type |> StepType.changeset(attrs) |> validate_active_phase(:starts_phase_id)
  end

  ## Templates

  @doc """
  Every template with its `issues` and `step_count` (entries that aren't
  phase markers): active in order, then retired by name.
  """
  def list_templates do
    Template
    |> list_ordered()
    |> Repo.preload(steps: :step_type)
    |> Enum.map(&with_issues/1)
  end

  @doc "A template with its entries in day order, their types and phases, links and issues."
  def get_template(id) do
    case get(Template, id, []) do
      nil -> nil
      t -> load(t)
    end
  end

  @doc "A new template. It starts with its Brew day, at day 0 in the first tank."
  def create_template(attrs) do
    Repo.transaction(fn ->
      template =
        case insert_ordered(Template, %Template{}, attrs, &Template.changeset/2, "template") do
          {:ok, t} -> t
          {:error, cs} -> Repo.rollback(cs)
        end

      brew = behavior_type!("brew")

      insert_step!(template, brew, %{
        phase_id: brew.starts_phase_id,
        day_offset: 0,
        vessel_index: 0,
        on_task_list: brew.on_task_list
      })

      load(template)
    end)
  end

  @doc "Name and notes. Editing a template never changes existing batches."
  def update_template(%Template{} = template, attrs) do
    template
    |> Template.changeset(Map.take(stringify(attrs), ["name", "notes"]))
    |> unique_name(Template, "template")
    |> Repo.update()
    |> case do
      {:ok, t} -> {:ok, load(t)}
      error -> error
    end
  end

  def reorder_templates(ids) do
    with {:ok, _} <- reorder(Template, ids), do: {:ok, list_templates()}
  end

  def retire_template(%Template{} = t), do: retire(t) |> load_ok()
  def restore_template(%Template{} = t), do: restore(t) |> load_ok()

  @doc """
  A deep copy: "Copy of <name>" (numbered when taken) with its own entries,
  links and ramp groups, at the bottom of the list.
  """
  def duplicate_template(%Template{} = template) do
    source = load(template)

    Repo.transaction(fn ->
      copy =
        %Template{position: next_position(Template)}
        |> Template.changeset(%{"name" => copy_name(source.name), "notes" => source.notes})
        |> Repo.insert!()

      groups =
        source.steps
        |> Enum.map(& &1.ramp_group)
        |> Enum.reject(&is_nil/1)
        |> Enum.uniq()
        |> Map.new(&{&1, new_ramp_group()})

      ids =
        Map.new(source.steps, fn s ->
          new =
            Repo.insert!(%TemplateStep{
              template_id: copy.id,
              step_type_id: s.step_type_id,
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
              ramp_group: s.ramp_group && groups[s.ramp_group]
            })

          {s.id, new.id}
        end)

      for l <- source.links do
        Repo.insert!(%TemplateLink{
          template_id: copy.id,
          from_step_id: ids[l.from_step_id],
          to_step_id: ids[l.to_step_id],
          default_answer: l.default_answer
        })
      end

      load(copy)
    end)
  end

  defp copy_name(name) do
    base = String.slice("Copy of #{name}", 0, 54)

    Stream.iterate(1, &(&1 + 1))
    |> Stream.map(fn
      1 -> base
      n -> "#{base} (#{n})"
    end)
    |> Enum.find(&is_nil(name_taken?(Template, &1, nil)))
  end

  ## Template entries

  @doc """
  Add an entry to `template`. A step has `step_type_id`; a phase marker has
  none and needs `phase_id`. Optional: `phase_id` (a step defaults to its
  type's), `day_offset`, `vessel_index`, `detail`, `temperature` (Set temp,
  required there; Brew day's starting temperature), `split_method` (a
  Split's `transfer` / `filter`, default `transfer`), `package_partial` (a
  Package), `notes`, `on_task_list`
  (default: the type's; markers off), and the links `comes_after_id` /
  `comes_after_answer` and `leads_to_id` / `leads_to_answer`. With both, the
  entry slots in between and the direct link between them goes.

  A Transfer/Filter's `vessel_index` is the tank it moves the beer **into**:
  always a new one, one more than the highest tank used before it in day
  order (`:transfer_not_new_tank` otherwise). Transfers stay in day order:
  one before an existing transfer is `{:transfer_order, :before, day}`. It adds a CIP & Sanitize for
  the tank it leaves (`vessel_index − 1`), the same day, linked from it.
  Any other entry goes in the first tank or one a Transfer/Filter starts
  (`:no_such_tank` otherwise).

  Returns the whole template (`get_template/1`).
  """
  def add_step(%Template{} = template, attrs) do
    attrs = stringify(attrs)

    Repo.transaction(fn ->
      type = attr_type!(attrs)
      fields = entry_fields!(type, attrs)
      if behavior_of(type) == "brew", do: Repo.rollback(:one_brew_day)
      check_vessel!(template, type, fields, nil)

      step = insert_step!(template, type, fields)
      link_into_chain!(template, step, step, attrs)

      if behavior_of(type) == "transfer" do
        cip = behavior_type!("cip")

        cip_step =
          insert_step!(template, cip, %{
            day_offset: step.day_offset,
            vessel_index: step.vessel_index - 1,
            on_task_list: cip.on_task_list
          })

        insert_link!(template, step, cip_step, "move_all")
      end

      load(template)
    end)
  end

  @doc """
  Change an entry: phase, day, tank, detail, temperature, split method,
  partial package, notes, task list. Brew day stays on day 0 in the first
  tank (`:brew_day_fixed`); a new day that would put it before a step it
  follows (or after one that follows it) is `:link_order`. A Transfer/Filter
  keeps its tank (`:transfer_not_new_tank`); a new day that takes it past another transfer is
  `{:transfer_order, :before | :after, day}` (D47 task 0, N1). The CIP &
  Sanitize it set up moves to its new day too, unless it was moved apart.
  """
  def update_step(%Template{} = template, %TemplateStep{} = step, attrs) do
    attrs = stringify(attrs)
    step = Repo.preload(step, :step_type)
    type = step.step_type

    Repo.transaction(fn ->
      if behavior_of(type) == "brew" and
           (changes?(attrs, "day_offset", step.day_offset) or
              changes?(attrs, "vessel_index", step.vessel_index)),
         do: Repo.rollback(:brew_day_fixed)

      fields = entry_fields!(type, attrs, step)

      if behavior_of(type) == "transfer" and fields.vessel_index != step.vessel_index,
        do: Repo.rollback(:transfer_not_new_tank)

      if fields.vessel_index != step.vessel_index or fields.day_offset != step.day_offset,
        do: check_vessel!(template, type, fields, step.id)

      fields =
        if fields.day_offset != step.day_offset,
          do: Map.put(fields, :position, next_day_position(template.id, fields.day_offset)),
          else: fields

      # Lead decisions 1, item 1: the CIP a Transfer/Filter set up (still on
      # its day) moves with it; one moved on its own stays.
      cips =
        if behavior_of(type) == "transfer" and fields.day_offset != step.day_offset,
          do: set_up_cips(step),
          else: []

      step |> Ecto.Changeset.change(fields) |> Repo.update!()

      for cip <- cips do
        cip
        |> Ecto.Changeset.change(
          day_offset: fields.day_offset,
          position: next_day_position(template.id, fields.day_offset)
        )
        |> Repo.update!()

        check_link_order!(cip.id)
      end

      check_link_order!(step.id)
      load(template)
    end)
  end

  @doc """
  Remove an entry; Brew day can't go (`:brew_day_fixed`). Its links pass
  through: each step it followed now leads to each step that followed it
  (`move_all` only when both links were). Removing a Transfer/Filter also
  removes the CIP & Sanitize it set up.
  """
  def remove_step(%Template{} = template, %TemplateStep{} = step, opts \\ []) do
    step = Repo.preload(step, :step_type)

    if behavior_of(step.step_type) == "brew" do
      {:error, :brew_day_fixed}
    else
      Repo.transaction(fn ->
        if behavior_of(step.step_type) == "transfer" do
          for cip <- set_up_cips(step), do: remove_one!(template, cip)
        end

        remove_one!(template, step)
        result = load(template)
        if opts[:preview], do: Repo.rollback({:preview, result.issues}), else: result
      end)
    end
  end

  @doc """
  What removing `step` would leave incomplete (D47 task 0, N2): the issues
  the template would have afterwards that it doesn't have now. Nothing is
  changed.
  """
  def removal_issues(%Template{} = template, %TemplateStep{} = step) do
    before = load(template).issues

    case remove_step(template, step, preview: true) do
      {:error, {:preview, issues}} -> {:ok, issues -- before}
      error -> error
    end
  end

  # The CIP & Sanitize a Transfer/Filter added: same day, the tank it leaves,
  # linked from it.
  defp set_up_cips(%TemplateStep{} = transfer) do
    Repo.all(
      from(s in TemplateStep,
        join: l in TemplateLink,
        on: l.to_step_id == s.id and l.from_step_id == ^transfer.id,
        join: t in StepType,
        on: t.id == s.step_type_id,
        where:
          t.behavior == "cip" and s.day_offset == ^transfer.day_offset and
            s.vessel_index == ^(transfer.vessel_index - 1)
      )
    )
  end

  defp remove_one!(template, %TemplateStep{} = step) do
    into = Repo.all(from(l in TemplateLink, where: l.to_step_id == ^step.id))
    out = Repo.all(from(l in TemplateLink, where: l.from_step_id == ^step.id))

    for a <- into, b <- out, a.from_step_id != b.to_step_id do
      answer =
        if a.default_answer == "move_all" and b.default_answer == "move_all",
          do: "move_all",
          else: "move_only"

      unless link_between(a.from_step_id, b.to_step_id) do
        Repo.insert!(%TemplateLink{
          template_id: template.id,
          from_step_id: a.from_step_id,
          to_step_id: b.to_step_id,
          default_answer: answer
        })
      end
    end

    Repo.delete!(step)
  end

  ## Links

  @doc """
  Link two entries: `to_step_id` comes after `from_step_id`.
  `:link_cycle` if it would close a loop; `:link_order` if the "to" entry is
  on an earlier day; `:link_exists` for a duplicate.
  """
  def add_link(%Template{} = template, attrs) do
    attrs = stringify(attrs)

    Repo.transaction(fn ->
      from = template_step!(template, attrs["from_step_id"])
      to = template_step!(template, attrs["to_step_id"])
      insert_link!(template, from, to, attrs["default_answer"] || "move_all")
      load(template)
    end)
  end

  @doc "Change a link's default answer (`move_all` / `move_only`)."
  def update_link(%Template{} = template, %TemplateLink{} = link, attrs) do
    case link |> TemplateLink.changeset(stringify(attrs)) |> Repo.update() do
      {:ok, _} -> {:ok, load(template)}
      error -> error
    end
  end

  def remove_link(%Template{} = template, %TemplateLink{} = link) do
    Repo.delete!(link)
    {:ok, load(template)}
  end

  def get_template_step(%Template{id: tid}, id) do
    case to_int(id) do
      nil -> nil
      id -> Repo.one(from(s in TemplateStep, where: s.id == ^id and s.template_id == ^tid))
    end
  end

  def get_template_link(%Template{id: tid}, id) do
    case to_int(id) do
      nil -> nil
      id -> Repo.one(from(l in TemplateLink, where: l.id == ^id and l.template_id == ^tid))
    end
  end

  ## Ramps

  @doc """
  Add a Set temp ramp: `start`, `target`, `change_per_day` (°F, > 0),
  `first_day`, `vessel_index`, optional `phase_id` (default Crash; only the
  first step starts it), `on_task_list`, and the links `comes_after_id` /
  `leads_to_id` (with their `_answer`s) as in `add_step/2`. One Set temp step
  per temperature, one a day, the last reaching the target exactly; chained
  with `move_all` links and sharing a `ramp_group`.

  `:ramp_invalid` for temperatures outside 28–80°F;
  `:ramp_flat` when start and target are the same;
  `{:ramp_change, gap}` for a change per day under 1° or over the gap
  between start and target (D47 task 0, N3);
  `:ramp_days` for a first day before 0 or a ramp that ends past day 365.
  """
  def add_ramp(%Template{} = template, attrs) do
    attrs = stringify(attrs)
    range = TemplateStep.temperatures()

    with {:ok, start} <- int_in(attrs["start"], range),
         {:ok, target} <- int_in(attrs["target"], range),
         true <- start != target || {:error, :ramp_flat},
         gap = abs(start - target),
         {:ok, change} <- ramp_change(attrs["change_per_day"], gap),
         {:ok, temps} <- ramp_temperatures(start, target, change),
         first_day = to_int(attrs["first_day"]) || 0,
         vessel = to_int(attrs["vessel_index"]) || 0,
         true <- vessel in 0..9 || {:error, :ramp_invalid},
         true <-
           (first_day >= 0 and first_day + length(temps) - 1 <= 365) || {:error, :ramp_days} do
      type = behavior_type!("set_temp")

      Repo.transaction(fn ->
        phase_id =
          if Map.has_key?(attrs, "phase_id"),
            do: active_phase_id!(attrs["phase_id"]),
            else: default_crash_phase_id()

        on_task_list =
          if Map.has_key?(attrs, "on_task_list"),
            do: truthy?(attrs["on_task_list"]),
            else: type.on_task_list

        check_vessel!(template, type, %{vessel_index: vessel, day_offset: first_day}, nil)
        group = new_ramp_group()

        steps =
          temps
          |> Enum.with_index()
          |> Enum.map(fn {temp, i} ->
            insert_step!(template, type, %{
              phase_id: if(i == 0, do: phase_id),
              day_offset: first_day + i,
              vessel_index: vessel,
              temperature: temp,
              on_task_list: on_task_list,
              ramp_group: group
            })
          end)

        steps
        |> Enum.chunk_every(2, 1, :discard)
        |> Enum.each(fn [a, b] -> insert_link!(template, a, b, "move_all") end)

        link_into_chain!(template, List.first(steps), List.last(steps), attrs)
        load(template)
      end)
    end
  end

  @doc "The temperatures of a ramp: `start` stepping by `change` toward `target`, ending on it."
  def ramp_temperatures(start, start, _change), do: {:error, :ramp_flat}

  def ramp_temperatures(start, target, change) when change > 0 do
    dir = if target < start, do: -1, else: 1

    temps =
      start
      |> Stream.iterate(&(&1 + dir * change))
      |> Enum.take_while(&(dir * (target - &1) > 0))

    {:ok, temps ++ [target]}
  end

  def ramp_temperatures(_start, _target, _change), do: {:error, :ramp_invalid}

  defp int_in(value, range) do
    case to_int(value) do
      n when is_integer(n) -> if n in range, do: {:ok, n}, else: {:error, :ramp_invalid}
      nil -> {:error, :ramp_invalid}
    end
  end

  defp ramp_change(value, gap) do
    case to_int(value) do
      n when is_integer(n) and n >= 1 and n <= gap -> {:ok, n}
      _ -> {:error, {:ramp_change, gap}}
    end
  end

  defp default_crash_phase_id do
    Repo.one(
      from(p in Phase,
        where: fragment("lower(?)", p.name) == "crash" and is_nil(p.retired_at),
        select: p.id
      )
    )
  end

  defp new_ramp_group, do: "ramp-" <> Base.encode16(:crypto.strong_rand_bytes(6), case: :lower)

  ## Issues

  @doc """
  What keeps a template from being complete, as `%{code, message}` maps:
  no Brew day on day 0 (`no_brew_day`); a later tank no Transfer/Filter
  starts (`vessel_not_started`); a tank whose last entry isn't a Package,
  Split or the next Transfer/Filter (`vessel_has_no_exit`; CIPs and partial
  Packages don't count); a tank with entries after the beer has left it
  (`step_after_exit`, naming them);
  a Set temp without a temperature (`set_temp_without_temperature`). Needs
  the steps preloaded with their types.
  """
  def issues(%Template{steps: steps}) do
    behavior = fn s -> s.step_type && s.step_type.behavior end
    max_vessel = steps |> Enum.map(& &1.vessel_index) |> Enum.max(fn -> 0 end)

    brew =
      if Enum.any?(steps, &(behavior.(&1) == "brew" and &1.day_offset == 0)),
        do: [],
        else: [issue(:no_brew_day, "There's no Brew day on day 0.")]

    started =
      for k <- 1..max_vessel//1,
          not Enum.any?(steps, &(behavior.(&1) == "transfer" and &1.vessel_index == k)),
          do:
            issue(
              :vessel_not_started,
              "#{vessel_label(k)} has no Transfer or Filter starting it."
            )

    exits = for k <- 0..max_vessel//1, issue = exit_issue(steps, k, behavior), do: issue

    temps =
      for s <- Enum.sort_by(steps, & &1.day_offset),
          behavior.(s) == "set_temp" and is_nil(s.temperature),
          do:
            issue(
              :set_temp_without_temperature,
              "The Set temp on day #{s.day_offset} has no temperature."
            )

    brew ++ started ++ exits ++ Enum.uniq(temps)
  end

  defp issue(code, message), do: %{code: Atom.to_string(code), message: message}

  # Tank k's entries (not its CIPs, not the transfer that starts it) and the
  # transfer that leaves it: the last day's must include an exit (a full
  # Package, a Split, or the next Transfer/Filter). When there is an exit but
  # entries come after it, the issue names them (D47 task 0, N4a).
  defp exit_issue(steps, k, behavior) do
    candidates =
      steps
      |> Enum.filter(fn s ->
        b = behavior.(s)

        (s.vessel_index == k and b not in ["cip", "transfer"]) or
          (b == "transfer" and s.vessel_index == k + 1)
      end)
      |> Enum.sort_by(&{&1.day_offset, &1.position, &1.id})

    exit? = fn s ->
      case behavior.(s) do
        "package" -> not s.package_partial
        "split" -> true
        "transfer" -> s.vessel_index == k + 1
        _ -> false
      end
    end

    case Enum.find(candidates, exit?) do
      nil ->
        issue(:vessel_has_no_exit, "#{vessel_label(k)} has no Package, Split or Transfer.")

      exit ->
        case Enum.filter(candidates, &(&1.day_offset > exit.day_offset)) do
          [] ->
            nil

          later ->
            names = Enum.map(later, &"#{step_name(&1)} on day #{&1.day_offset}")
            verb = if length(later) == 1, do: "comes", else: "come"

            issue(
              :step_after_exit,
              "#{vessel_label(k)} is emptied by the #{step_name(exit)} on day #{exit.day_offset}, " <>
                "but #{join_and(names)} #{verb} after it."
            )
        end
    end
  end

  defp join_and([one]), do: one
  defp join_and(list), do: Enum.join(Enum.drop(list, -1), ", ") <> " and " <> List.last(list)

  @doc ~S|"The first tank", "The tank after transfer 2".|
  def vessel_label(0), do: "The first tank"
  def vessel_label(k), do: "The tank after transfer #{k}"

  @doc ~S|An entry's name: "FDH", "Dry hop - #2", "Set temp - 52°", "Split - Filter", "Package - Partial", or a marker's phase.|
  def step_name(%TemplateStep{step_type: nil, phase: %Phase{name: name}}), do: name
  def step_name(%TemplateStep{step_type: nil}), do: "Phase start"

  def step_name(%TemplateStep{step_type: %StepType{} = type} = s) do
    [
      type.name,
      if(type.behavior == "set_temp" and s.temperature, do: "#{s.temperature}°"),
      if(type.behavior == "split", do: split_method_label(s.split_method)),
      if(type.behavior == "package" and s.package_partial, do: "Partial"),
      s.detail
    ]
    |> Enum.reject(&is_nil/1)
    |> Enum.join(" - ")
  end

  @doc ~S|"Transfer" / "Filter": how a Split's parts leave (D47).|
  def split_method_label("filter"), do: "Filter"
  def split_method_label(_), do: "Transfer"

  ## Entry helpers

  defp load(%Template{id: id}) do
    Repo.one!(from(t in Template, where: t.id == ^id))
    |> Repo.preload(
      steps:
        {from(s in TemplateStep, order_by: [s.day_offset, s.position, s.id]),
         [:step_type, :phase]},
      links: from(l in TemplateLink, order_by: l.id)
    )
    |> with_issues()
  end

  defp load_ok({:ok, t}), do: {:ok, load(t)}
  defp load_ok(error), do: error

  defp with_issues(%Template{steps: steps} = t) do
    %{t | issues: issues(t), step_count: Enum.count(steps, &(not is_nil(&1.step_type_id)))}
  end

  # The type named in `step_type_id` (nil for a phase marker): it must exist
  # and not be retired.
  defp attr_type!(attrs) do
    case blank_to_nil(attrs["step_type_id"]) do
      nil ->
        nil

      id ->
        case get_step_type(id) do
          nil -> Repo.rollback(:not_found)
          %StepType{retired_at: nil} = type -> type
          %StepType{} -> Repo.rollback(:retired)
        end
    end
  end

  # The validated fields of a new entry (`step` nil) or a change to one. A
  # marker needs a phase; a step's phase defaults to its type's. Temperature
  # is Set temp's (required) and Brew day's; other entries have none.
  defp entry_fields!(type, attrs, step \\ nil) do
    base = step || %TemplateStep{}

    defaults =
      if step,
        do: %{},
        else: %{
          "phase_id" => type && type.starts_phase_id,
          "on_task_list" => if(type, do: type.on_task_list, else: false),
          "split_method" => if(behavior_of(type) == "split", do: "transfer")
        }

    changeset =
      base
      |> TemplateStep.changeset(Map.merge(defaults, attrs))
      |> validate_active_phase(:phase_id)

    changeset =
      cond do
        is_nil(type) ->
          changeset
          |> Ecto.Changeset.validate_required([:phase_id], message: "Pick a phase.")
          |> Ecto.Changeset.put_change(:temperature, nil)

        type.behavior == "set_temp" ->
          Ecto.Changeset.validate_required(changeset, [:temperature],
            message: "Enter the temperature."
          )

        type.behavior == "brew" ->
          changeset

        true ->
          Ecto.Changeset.put_change(changeset, :temperature, nil)
      end

    # Only a Split has a method, and only a Package can be partial (D47).
    changeset =
      if behavior_of(type) == "split",
        do:
          Ecto.Changeset.validate_required(changeset, [:split_method],
            message: "Pick Transfer or Filter."
          ),
        else: Ecto.Changeset.put_change(changeset, :split_method, nil)

    changeset =
      if behavior_of(type) == "package",
        do: Ecto.Changeset.validate_required(changeset, [:package_partial]),
        else: Ecto.Changeset.put_change(changeset, :package_partial, false)

    case changeset do
      %{valid?: true} ->
        Map.take(Ecto.Changeset.apply_changes(changeset), [
          :phase_id,
          :day_offset,
          :vessel_index,
          :detail,
          :temperature,
          :split_method,
          :package_partial,
          :notes,
          :on_task_list
        ])

      invalid ->
        Repo.rollback(invalid)
    end
  end

  # D46 fix cycle 2 (QA M1, minor 4). A Transfer/Filter moves the beer into
  # a new tank: exactly one past the highest tank used before it (earlier
  # days, or an earlier transfer the same day), and no other transfer goes
  # into it. Any other entry needs its tank to exist: the first, or one a
  # Transfer/Filter starts. `step_id` is the entry being changed (nil = new).
  # Transfers also stay in day order (D47 task 0, N1).
  defp check_vessel!(%Template{id: tid}, type, %{vessel_index: k, day_offset: day}, step_id) do
    others =
      from(s in TemplateStep, where: s.template_id == ^tid, preload: :step_type)
      |> except_id(step_id)
      |> Repo.all()

    transfer? = &(behavior_of(&1.step_type) == "transfer")

    if behavior_of(type) == "transfer" do
      check_transfer_order!(Enum.filter(others, transfer?), k, day, step_id)

      highest =
        others
        |> Enum.filter(
          &(&1.day_offset < day or
              (&1.day_offset == day and transfer?.(&1) and &1.vessel_index < k))
        )
        |> Enum.map(& &1.vessel_index)
        |> Enum.max(fn -> 0 end)

      if k != highest + 1 or starts?(others, k, transfer?),
        do: Repo.rollback(:transfer_not_new_tank)
    else
      if k > 0 and not starts?(others, k, transfer?), do: Repo.rollback(:no_such_tank)
    end
  end

  # A new transfer can't go before an existing one (the later tanks would
  # need renumbering); a changed one, which keeps its tank, can't pass the
  # transfers before or after it.
  defp check_transfer_order!(transfers, k, day, step_id) do
    {before, after_} =
      if step_id,
        do:
          {Enum.filter(transfers, &(&1.vessel_index < k and &1.day_offset > day)),
           Enum.filter(transfers, &(&1.vessel_index > k and &1.day_offset < day))},
        else: {Enum.filter(transfers, &(&1.day_offset > day)), []}

    cond do
      before != [] ->
        Repo.rollback(
          {:transfer_order, :before, before |> Enum.map(& &1.day_offset) |> Enum.min()}
        )

      after_ != [] ->
        Repo.rollback(
          {:transfer_order, :after, after_ |> Enum.map(& &1.day_offset) |> Enum.max()}
        )

      true ->
        :ok
    end
  end

  defp starts?(steps, k, transfer?),
    do: Enum.any?(steps, &(transfer?.(&1) and &1.vessel_index == k))

  defp insert_step!(%Template{id: tid}, type, fields) do
    Repo.insert!(
      struct(
        TemplateStep,
        Map.merge(fields, %{
          template_id: tid,
          step_type_id: type && type.id,
          position: next_day_position(tid, fields.day_offset)
        })
      )
    )
  end

  defp next_day_position(tid, day) do
    (Repo.one(
       from(s in TemplateStep,
         where: s.template_id == ^tid and s.day_offset == ^day,
         select: max(s.position)
       )
     ) || 0) + 1
  end

  # `comes_after_id` links into `first`, `leads_to_id` out of `last`; with
  # both, the direct link between them goes (the new entries slot in).
  defp link_into_chain!(template, first, last, attrs) do
    after_step =
      blank_to_nil(attrs["comes_after_id"]) && template_step!(template, attrs["comes_after_id"])

    lead_step =
      blank_to_nil(attrs["leads_to_id"]) && template_step!(template, attrs["leads_to_id"])

    if after_step && lead_step do
      case link_between(after_step.id, lead_step.id) do
        nil -> :ok
        direct -> Repo.delete!(direct)
      end
    end

    if after_step,
      do: insert_link!(template, after_step, first, attrs["comes_after_answer"] || "move_all")

    if lead_step,
      do: insert_link!(template, last, lead_step, attrs["leads_to_answer"] || "move_all")

    :ok
  end

  defp template_step!(template, id) do
    get_template_step(template, id) || Repo.rollback(:not_found)
  end

  defp insert_link!(template, %TemplateStep{} = from, %TemplateStep{} = to, answer) do
    cond do
      from.id == to.id or reachable?(template.id, to.id, from.id) -> Repo.rollback(:link_cycle)
      to.day_offset < from.day_offset -> Repo.rollback(:link_order)
      link_between(from.id, to.id) -> Repo.rollback(:link_exists)
      true -> :ok
    end

    %TemplateLink{template_id: template.id, from_step_id: from.id, to_step_id: to.id}
    |> TemplateLink.changeset(%{"default_answer" => answer})
    |> Repo.insert()
    |> case do
      {:ok, link} -> link
      {:error, cs} -> Repo.rollback(cs)
    end
  end

  defp link_between(from_id, to_id) do
    Repo.one(
      from(l in TemplateLink, where: l.from_step_id == ^from_id and l.to_step_id == ^to_id)
    )
  end

  # Whether `target` can be reached from `start` along the template's links.
  defp reachable?(tid, start, target) do
    edges =
      Repo.all(
        from(l in TemplateLink,
          where: l.template_id == ^tid,
          select: {l.from_step_id, l.to_step_id}
        )
      )
      |> Enum.group_by(&elem(&1, 0), &elem(&1, 1))

    walk([start], MapSet.new(), edges, target)
  end

  defp walk([], _seen, _edges, _target), do: false
  defp walk([target | _], _seen, _edges, target), do: true

  defp walk([id | rest], seen, edges, target) do
    if MapSet.member?(seen, id),
      do: walk(rest, seen, edges, target),
      else: walk(Map.get(edges, id, []) ++ rest, MapSet.put(seen, id), edges, target)
  end

  # After a step's day changes, every link into and out of it must still run
  # forward in time.
  defp check_link_order!(step_id) do
    bad =
      Repo.exists?(
        from(l in TemplateLink,
          join: f in TemplateStep,
          on: f.id == l.from_step_id,
          join: t in TemplateStep,
          on: t.id == l.to_step_id,
          where:
            (l.from_step_id == ^step_id or l.to_step_id == ^step_id) and
              t.day_offset < f.day_offset
        )
      )

    if bad, do: Repo.rollback(:link_order)
  end

  defp behavior_type!(behavior) do
    Repo.one!(from(t in StepType, where: t.behavior == ^behavior, order_by: t.id, limit: 1))
  end

  defp active_phase_id!(value) do
    case blank_to_nil(value) do
      nil ->
        nil

      id ->
        case get_phase(id) do
          %Phase{retired_at: nil, id: id} -> id
          _ -> Repo.rollback(:not_found)
        end
    end
  end

  defp validate_active_phase(changeset, field) do
    Ecto.Changeset.validate_change(changeset, field, fn ^field, id ->
      case get_phase(id) do
        %Phase{retired_at: nil} -> []
        _ -> [{field, "Pick a phase."}]
      end
    end)
  end

  defp changes?(attrs, key, current) do
    Map.has_key?(attrs, key) and to_int(attrs[key]) != current
  end

  ## Ordered lists (tanks, phases, step types, templates)

  defp list_ordered(schema) do
    active =
      Repo.all(from(r in schema, where: is_nil(r.retired_at), order_by: [r.position, r.id]))

    retired =
      Repo.all(
        from(r in schema,
          where: not is_nil(r.retired_at),
          order_by: [fragment("lower(?)", r.name), r.id]
        )
      )

    active ++ retired
  end

  defp get(schema, id, preloads) do
    case to_int(id) do
      nil -> nil
      id -> schema |> Repo.get(id) |> then(&(&1 && Repo.preload(&1, preloads)))
    end
  end

  defp insert_ordered(schema, struct, attrs, changeset_fun, noun) do
    %{struct | position: next_position(schema)}
    |> changeset_fun.(stringify(attrs))
    |> unique_name(schema, noun)
    |> Repo.insert()
  end

  defp next_position(schema) do
    (Repo.one(from(r in schema, where: is_nil(r.retired_at), select: max(r.position))) || 0) + 1
  end

  defp reorder(schema, ids) when is_list(ids) do
    Repo.transaction(fn ->
      current =
        Repo.all(
          from(r in schema,
            where: is_nil(r.retired_at),
            order_by: [r.position, r.id],
            select: r.id
          )
        )

      ids = Enum.map(ids, &to_int/1)

      if Enum.sort(ids) != Enum.sort(current) or length(Enum.uniq(ids)) != length(ids),
        do: Repo.rollback(:invalid_order)

      write_order(schema, ids)
      list_ordered(schema)
    end)
  end

  defp reorder(_schema, _ids), do: {:error, :invalid_order}

  defp write_order(schema, ids) do
    ids
    |> Enum.with_index(1)
    |> Enum.each(fn {id, position} ->
      Repo.update_all(from(r in schema, where: r.id == ^id), set: [position: position])
    end)
  end

  defp retire(%{retired_at: nil, __struct__: schema} = row) do
    Repo.transaction(fn ->
      row = row |> Ecto.Changeset.change(retired_at: now(), position: 0) |> Repo.update!()

      Repo.all(
        from(r in schema, where: is_nil(r.retired_at), order_by: [r.position, r.id], select: r.id)
      )
      |> then(&write_order(schema, &1))

      row
    end)
  end

  defp retire(row), do: {:ok, row}

  defp restore(%{retired_at: nil} = row), do: {:ok, row}

  defp restore(%{__struct__: schema} = row) do
    row
    |> Ecto.Changeset.change(retired_at: nil, position: next_position(schema))
    |> Repo.update()
  end

  # Names are unique ignoring case, retired rows included. A retired match
  # says so, since it's not in the list a brewer is looking at.
  defp unique_name(changeset, schema, noun) do
    name = Ecto.Changeset.get_field(changeset, :name)
    id = Ecto.Changeset.get_field(changeset, :id)

    case is_binary(name) && name_taken?(schema, name, id) do
      %{retired_at: nil, name: taken} ->
        Ecto.Changeset.add_error(changeset, :name, "A #{noun} named #{taken} already exists.")

      %{name: taken} ->
        Ecto.Changeset.add_error(
          changeset,
          :name,
          "A retired #{noun} named #{taken} already exists. Restore it instead."
        )

      _ ->
        changeset
    end
  end

  defp name_taken?(schema, name, id) do
    lowered = String.downcase(name)

    from(r in schema, where: fragment("lower(?)", r.name) == ^lowered, limit: 1)
    |> except_id(id)
    |> Repo.one()
  end

  defp behavior_of(nil), do: nil
  defp behavior_of(%StepType{behavior: behavior}), do: behavior

  defp except_id(query, nil), do: query
  defp except_id(query, id), do: from(r in query, where: r.id != ^id)

  defp preload_ok(result, preloads, opts \\ [])
  defp preload_ok({:ok, row}, preloads, opts), do: {:ok, Repo.preload(row, preloads, opts)}
  defp preload_ok(error, _preloads, _opts), do: error

  defp truthy?(v), do: v in [true, "true", 1, "1"]

  defp blank_to_nil(nil), do: nil
  defp blank_to_nil(""), do: nil
  defp blank_to_nil(v), do: v

  defp to_int(i) when is_integer(i), do: i

  defp to_int(s) when is_binary(s) do
    case Integer.parse(s) do
      {i, ""} -> i
      _ -> nil
    end
  end

  defp to_int(_), do: nil

  defp stringify(attrs), do: Map.new(attrs, fn {k, v} -> {to_string(k), v} end)

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second)
end
