defmodule RockcutApi.Production.Batches do
  @moduledoc """
  D47 §3.5: scheduled batches. A batch planned from a template gets its
  vessels (the tanks it occupies, nil = Unassigned), a copy of the
  template's steps and links dated from the brew day, and a P-number until
  its first Brew day is checked off (`Steps.complete/4`), when it gets its
  real number.

  **Scheduled batches only** (plan decision 2): a batch is part of the
  schedule when it has vessels. Older `batches` rows are left alone here;
  only the batch-number rules (uniqueness, the next-number suggestion) cover
  every row.

  **P-numbers** are computed, never stored: the planned scheduled batches by
  their first Brew day's date, then id, numbered 1, 2, 3, …. A write that can
  change them returns `renumbered` (`with_renumbering/1`).

  **The first Brew day** is the batch's Brew day with the lowest id: the one
  copied from the template (a two-day brew's "2 of 2" is added after it).
  """
  import Ecto.Query, only: [from: 2]

  alias Ecto.Changeset
  alias RockcutApi.Repo
  alias RockcutApi.Brewing.{Batch, Brand}
  alias RockcutApi.Production

  alias RockcutApi.Production.{
    BatchVessel,
    Step,
    StepLink,
    StepType,
    Tank,
    Template,
    TemplateStep
  }

  @max_number 20
  @max_volume 10_000
  @max_shift 365

  ## Reading

  @doc "A scheduled batch (one with vessels), or nil."
  def get(id) do
    case to_int(id) do
      nil ->
        nil

      id ->
        Repo.one(
          from(b in Batch,
            where: b.id == ^id and b.id in subquery(from(v in BatchVessel, select: v.batch_id)),
            preload: :brand
          )
        )
    end
  end

  @doc """
  The P-numbers: `%{batch_id => n}` for every planned scheduled batch, by
  the first Brew day's date (with `overrides`, `%{step_id => date}`, in
  place of the stored dates: a preview), then id.
  """
  def p_numbers(overrides \\ %{}) do
    Repo.all(
      from(s in Step,
        join: b in Batch,
        on: b.id == s.batch_id,
        join: t in StepType,
        on: t.id == s.step_type_id,
        where: b.status == "planned" and t.behavior == "brew",
        select: {s.batch_id, s.id, s.due_on}
      )
    )
    |> Enum.group_by(&elem(&1, 0))
    |> Enum.map(fn {batch_id, brews} ->
      {_, step_id, due_on} = Enum.min_by(brews, &elem(&1, 1))
      {batch_id, Map.get(overrides, step_id, due_on)}
    end)
    |> Enum.sort_by(fn {batch_id, due_on} -> {Date.to_gregorian_days(due_on), batch_id} end)
    |> Enum.with_index(1)
    |> Map.new(fn {{batch_id, _}, n} -> {batch_id, n} end)
  end

  @doc """
  The P-numbers that differ between `before` and `after` (`p_numbers/1`
  maps), for batches planned in both: `[%{batch_id, brand, from, to}]` with
  `from`/`to` as "P2", by the new number.
  """
  def renumbered(before, after_) do
    changed =
      for {id, n} <- after_, Map.has_key?(before, id), before[id] != n, do: {id, before[id], n}

    brands = brand_names(Enum.map(changed, &elem(&1, 0)))

    changed
    |> Enum.sort_by(&elem(&1, 2))
    |> Enum.map(fn {id, from, to} ->
      %{batch_id: id, brand: brands[id], from: "P#{from}", to: "P#{to}"}
    end)
  end

  @doc """
  Run `fun` (inside a transaction) and return `{result, renumbered}`: the
  P-numbers it changed.
  """
  def with_renumbering(fun) do
    before = p_numbers()
    result = fun.()
    {result, renumbered(before, p_numbers())}
  end

  @doc ~S|"Galactic #40", "Altruism P1" (`pnums` from `p_numbers/1`).|
  def label(%Batch{} = batch, pnums) do
    brand = (match?(%Brand{}, batch.brand) && batch.brand.name) || "Batch"
    "#{brand} #{number_label(batch, pnums)}"
  end

  @doc ~S|"#40" or "P2" ("" for a planned batch that isn't scheduled).|
  def number_label(%Batch{batch_number: n}, _pnums) when is_binary(n), do: "##{n}"

  def number_label(%Batch{id: id}, pnums) do
    case pnums[id] do
      nil -> ""
      n -> "P#{n}"
    end
  end

  @doc """
  The suggested next batch number: one more than the highest plain-number
  batch ("44b" doesn't count), over every batch. "1" when there's none.
  """
  def next_batch_number do
    Repo.all(from(b in Batch, where: not is_nil(b.batch_number), select: b.batch_number))
    |> Enum.flat_map(fn n ->
      case Integer.parse(String.trim(n)) do
        {i, ""} -> [i]
        _ -> []
      end
    end)
    |> Enum.max(fn -> 0 end)
    |> Kernel.+(1)
    |> Integer.to_string()
  end

  @doc """
  Check a batch number for `batch` (nil = any batch): trimmed, 1–20
  characters, not another batch's ignoring case. `{:ok, number}`, or
  `{:error, :batch_number_required | :batch_number_invalid}` or
  `{:error, {:batch_number_taken, number, other_label}}`.
  """
  def check_number(raw, batch \\ nil) do
    number = if is_binary(raw), do: String.trim(raw), else: raw && to_string(raw)

    cond do
      number in [nil, ""] ->
        {:error, :batch_number_required}

      String.length(number) > @max_number ->
        {:error, :batch_number_invalid}

      other = number_taken(number, batch && batch.id) ->
        {:error, {:batch_number_taken, number, label(other, %{})}}

      true ->
        {:ok, number}
    end
  end

  defp number_taken(number, id) do
    down = String.downcase(number)

    from(b in Batch,
      where: fragment("lower(?)", b.batch_number) == ^down,
      preload: :brand,
      limit: 1
    )
    |> then(fn q -> if id, do: from(b in q, where: b.id != ^id), else: q end)
    |> Repo.one()
  end

  ## Planning

  @doc """
  Plan a batch (§3.5): `brand_id`, `template_id`, `brew_on`, `volume_bbl`,
  `brew_two_days`, and `tank_ids` (one per vessel, in order; nil or missing =
  Unassigned). The template must be active and complete
  (`:template_incomplete`); each tank active (`:tank_invalid`).

  Copies every template entry with `due_on` = brew day + its day; a two-day
  brew names the first Brew day "1 of 2" and adds "2 of 2" the next day,
  linked from it. A tank whose exit is a full Package with no CIP & Sanitize
  gets one on the Package day, linked from it (plan decision 3).

  `{:ok, {batch, renumbered}}`.
  """
  def plan(attrs) do
    attrs = stringify(attrs)

    types = %{
      brand_id: :integer,
      template_id: :integer,
      brew_on: :date,
      volume_bbl: :decimal,
      brew_two_days: :boolean
    }

    changeset =
      {%{brew_two_days: false}, types}
      |> Changeset.cast(attrs, Map.keys(types))
      |> Changeset.validate_required([:brand_id], message: "Pick a brand.")
      |> Changeset.validate_required([:template_id], message: "Pick a template.")
      |> Changeset.validate_required([:brew_on], message: "Pick the brew day.")
      |> Changeset.validate_required([:volume_bbl], message: "Enter the volume.")
      |> validate_volume()
      |> Changeset.validate_change(:brand_id, fn :brand_id, id ->
        case Repo.get(Brand, id) do
          %Brand{status: status} when status != "retired" -> []
          _ -> [brand_id: "Pick a brand."]
        end
      end)

    with {:ok, fields} <- Changeset.apply_action(changeset, :insert) do
      Repo.transaction(fn ->
        template = plannable_template!(fields.template_id)
        vessels = template.steps |> Enum.map(& &1.vessel_index) |> Enum.max(fn -> 0 end)
        tanks = tank_ids!(attrs["tank_ids"], vessels)

        {batch, renumbered} =
          with_renumbering(fn ->
            batch =
              Repo.insert!(%Batch{
                brand_id: fields.brand_id,
                template_id: template.id,
                status: "planned",
                volume_bbl: fields.volume_bbl,
                brew_two_days: fields.brew_two_days
              })

            for k <- 0..vessels,
                do:
                  Repo.insert!(%BatchVessel{
                    batch_id: batch.id,
                    vessel_index: k,
                    tank_id: tanks[k]
                  })

            copy_steps!(batch, template, fields.brew_on, fields.brew_two_days)
            batch
          end)

        {batch, renumbered}
      end)
    end
  end

  defp validate_volume(changeset) do
    Changeset.validate_change(changeset, :volume_bbl, fn :volume_bbl, v ->
      if volume_ok?(v),
        do: [],
        else: [volume_bbl: "Enter a volume more than 0 and under 10,000 bbl."]
    end)
  end

  defp volume_ok?(%Decimal{} = v),
    do: Decimal.gt?(v, 0) and Decimal.lt?(v, @max_volume)

  defp volume_ok?(_), do: false

  defp plannable_template!(id) do
    case Production.get_template(id) do
      %Template{retired_at: nil, issues: []} = t -> t
      %Template{retired_at: nil} -> Repo.rollback(:template_incomplete)
      _ -> Repo.rollback(:not_found)
    end
  end

  # `tank_ids` as a list (vessel order) or a map ("0" => id): each nil or an
  # active tank. Vessels past the template's are refused.
  defp tank_ids!(nil, _vessels), do: %{}

  defp tank_ids!(ids, vessels) do
    pairs =
      cond do
        is_list(ids) -> Enum.with_index(ids, fn id, k -> {k, id} end)
        is_map(ids) -> Enum.map(ids, fn {k, id} -> {to_int(k), id} end)
        true -> Repo.rollback(:tank_invalid)
      end

    Map.new(pairs, fn {k, id} ->
      if not is_integer(k) or k < 0 or k > vessels, do: Repo.rollback(:tank_invalid)
      {k, active_tank_id!(id)}
    end)
  end

  @doc false
  def active_tank_id!(id) do
    case blank_to_nil(id) do
      nil ->
        nil

      id ->
        case to_int(id) && Repo.get(Tank, to_int(id)) do
          %Tank{retired_at: nil, id: id} -> id
          _ -> Repo.rollback(:tank_invalid)
        end
    end
  end

  defp copy_steps!(batch, template, brew_on, two_days) do
    ids =
      Map.new(template.steps, fn %TemplateStep{} = s ->
        brew? = s.step_type && s.step_type.behavior == "brew"

        step =
          Repo.insert!(%Step{
            batch_id: batch.id,
            step_type_id: s.step_type_id,
            phase_id: s.phase_id,
            vessel_index: s.vessel_index,
            detail: if(brew? and two_days, do: "1 of 2", else: s.detail),
            temperature: s.temperature,
            split_method: s.split_method,
            package_partial: s.package_partial,
            notes: s.notes,
            on_task_list: s.on_task_list,
            position: s.position,
            due_on: Date.add(brew_on, s.day_offset),
            template_step_id: s.id
          })

        {s.id, step}
      end)

    for l <- template.links do
      insert_link!(ids[l.from_step_id].id, ids[l.to_step_id].id, l.default_answer)
    end

    steps = Map.values(ids) |> Repo.preload(:step_type)

    if two_days do
      first = Enum.find(steps, &(&1.step_type && &1.step_type.behavior == "brew"))

      second =
        Repo.insert!(%Step{
          batch_id: batch.id,
          step_type_id: first.step_type_id,
          vessel_index: 0,
          detail: "2 of 2",
          temperature: first.temperature,
          on_task_list: first.on_task_list,
          position: first.position + 1,
          due_on: Date.add(first.due_on, 1)
        })

      insert_link!(first.id, second.id, "move_all")
    end

    add_package_cips!(batch, steps)
  end

  # Plan decision 3: a tank whose exit is a full Package and that has no CIP
  # & Sanitize gets one on the Package day, linked from it.
  defp add_package_cips!(batch, steps) do
    cip = Repo.one!(from(t in StepType, where: t.behavior == "cip", order_by: t.id, limit: 1))

    steps
    |> Enum.group_by(& &1.vessel_index)
    |> Enum.each(fn {k, in_tank} ->
      behaviors = Enum.map(in_tank, &(&1.step_type && &1.step_type.behavior))

      package =
        in_tank
        |> Enum.filter(
          &((&1.step_type && &1.step_type.behavior == "package") and not &1.package_partial)
        )
        |> Enum.max_by(& &1.due_on, Date, fn -> nil end)

      if package && "cip" not in behaviors do
        step =
          Repo.insert!(%Step{
            batch_id: batch.id,
            step_type_id: cip.id,
            vessel_index: k,
            on_task_list: cip.on_task_list,
            position: package.position + 1,
            due_on: package.due_on
          })

        insert_link!(package.id, step.id, "move_all")
      end
    end)
  end

  defp insert_link!(from_id, to_id, answer) do
    Repo.insert!(%StepLink{from_step_id: from_id, to_step_id: to_id, default_answer: answer})
  end

  ## Changing

  @doc """
  Delete a planned batch with its steps, links and vessels
  (`:not_planned` once brewed). `{:ok, renumbered}`.
  """
  def delete_planned(%Batch{status: "planned"} = batch) do
    Repo.transaction(fn ->
      {_, renumbered} = with_renumbering(fn -> Repo.delete!(batch) end)
      renumbered
    end)
  end

  def delete_planned(%Batch{}), do: {:error, :not_planned}

  @doc """
  Move a batch in time by `days`: a planned batch's every step, a brewed
  one's unfinished steps (finished ones keep their dates). No prompt.
  `{:ok, %{moved, kept, renumbered}}`.
  """
  def shift(%Batch{} = batch, days) do
    case to_int(days) do
      d when is_integer(d) and d != 0 and abs(d) <= @max_shift ->
        Repo.transaction(fn ->
          steps = Repo.all(from(s in Step, where: s.batch_id == ^batch.id))

          {open, done} =
            Enum.split_with(steps, &(batch.status == "planned" or is_nil(&1.done_on)))

          {_, renumbered} =
            with_renumbering(fn ->
              for s <- open,
                  do: s |> Changeset.change(due_on: Date.add(s.due_on, d)) |> Repo.update!()
            end)

          %{moved: length(open), kept: length(done), renumbered: renumbered}
        end)

      _ ->
        {:error, :days_invalid}
    end
  end

  @doc """
  Put vessel `index` of `batch` in `tank_id` (nil = Unassigned); only that
  part changes. `:not_found` for a vessel the batch doesn't have,
  `:tank_invalid` for a retired or unknown tank.
  """
  def set_vessel_tank(%Batch{} = batch, index, tank_id) do
    Repo.transaction(fn ->
      vessel =
        Repo.get_by(BatchVessel, batch_id: batch.id, vessel_index: to_int(index) || -1) ||
          Repo.rollback(:not_found)

      vessel |> Changeset.change(tank_id: active_tank_id!(tank_id)) |> Repo.update!()
    end)
  end

  @doc """
  Change `volume_bbl` (`:volume_invalid`) and, once brewed, `batch_number`
  (`check_number/2`'s errors; a planned batch's is `:not_brewed`).
  """
  def update(%Batch{} = batch, attrs) do
    attrs = stringify(attrs)

    Repo.transaction(fn ->
      changes =
        Enum.reduce(attrs, %{}, fn
          {"volume_bbl", v}, acc ->
            case Decimal.cast(v) do
              {:ok, d} ->
                if volume_ok?(d),
                  do: Map.put(acc, :volume_bbl, d),
                  else: Repo.rollback(:volume_invalid)

              :error ->
                Repo.rollback(:volume_invalid)
            end

          {"batch_number", raw}, acc ->
            if batch.status == "planned", do: Repo.rollback(:not_brewed)

            case check_number(raw, batch) do
              {:ok, n} -> Map.put(acc, :batch_number, n)
              {:error, reason} -> Repo.rollback(reason)
            end

          _, acc ->
            acc
        end)

      batch |> Changeset.change(changes) |> Repo.update!()
    end)
  end

  ## Helpers

  defp brand_names([]), do: %{}

  defp brand_names(batch_ids) do
    Repo.all(
      from(b in Batch,
        join: br in Brand,
        on: br.id == b.brand_id,
        where: b.id in ^batch_ids,
        select: {b.id, br.name}
      )
    )
    |> Map.new()
  end

  defp stringify(attrs), do: Map.new(attrs, fn {k, v} -> {to_string(k), v} end)

  defp blank_to_nil(nil), do: nil
  defp blank_to_nil(""), do: nil
  defp blank_to_nil(v), do: v

  @doc false
  def to_int(i) when is_integer(i), do: i

  def to_int(s) when is_binary(s) do
    case Integer.parse(s) do
      {i, ""} -> i
      _ -> nil
    end
  end

  def to_int(_), do: nil
end
