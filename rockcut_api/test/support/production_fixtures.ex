defmodule RockcutApi.ProductionFixtures do
  @moduledoc """
  D48: tanks, brands, templates and planned batches for the production
  tests. The D47 test files keep their own copies.
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Production, Repo}
  alias RockcutApi.Brewing.{Batch, Brand}
  alias RockcutApi.Production.{BatchVessel, Batches, Step, StepLink, StepType, Steps}

  def type!(name), do: Repo.get_by!(StepType, name: name)

  def brand!(name), do: Repo.insert!(%Brand{name: name, status: "active"})

  def tank!(name, capacity \\ "20") do
    {:ok, t} = Production.create_tank(%{"name" => name, "capacity_bbl" => capacity})
    t
  end

  @doc "Brew day; FDH day 7; Set temp 58° day 10; Carb day 14; Package day 20 (\"move only\")."
  def ale_template!(name \\ "Standard ale") do
    {:ok, t} = Production.create_template(%{"name" => name})
    [brew] = t.steps
    t = add!(t, "FDH", 7, after: brew)
    t = add!(t, "Set temp", 10, after: entry(t, "FDH"), temperature: 58)
    t = add!(t, "Carb", 14, after: entry(t, "Set temp - 58°"))
    t = add!(t, "Package", 20, after: entry(t, "Carb"), answer: "move_only")
    [] = t.issues
    t
  end

  @doc "Brew day; Transfer day 10 into tank 1 (its CIP on tank 0); Package day 20 in tank 1."
  def lager_template!(name \\ "Lager with transfer") do
    {:ok, t} = Production.create_template(%{"name" => name})
    t = add!(t, "Transfer", 10, vessel: 1, after: hd(t.steps))
    t = add!(t, "Package", 20, vessel: 1, after: entry(t, "Transfer"))
    [] = t.issues
    t
  end

  def add!(t, type, day, opts) do
    attrs =
      %{
        "step_type_id" => type!(type).id,
        "day_offset" => day,
        "vessel_index" => opts[:vessel] || 0,
        "temperature" => opts[:temperature]
      }
      |> then(&if(opts[:after], do: Map.put(&1, "comes_after_id", opts[:after].id), else: &1))
      |> then(&if(opts[:answer], do: Map.put(&1, "comes_after_answer", opts[:answer]), else: &1))

    {:ok, t} = Production.add_step(t, attrs)
    t
  end

  def entry(t, name), do: Enum.find(t.steps, &(Production.step_name(&1) == name))

  def plan!(brand, template, brew_on, extra \\ %{}) do
    {:ok, {batch, _}} =
      Batches.plan(
        Map.merge(
          %{
            "brand_id" => brand.id,
            "template_id" => template.id,
            "brew_on" => Date.to_iso8601(brew_on),
            "volume_bbl" => "20"
          },
          extra
        )
      )

    batch
  end

  def reload(batch), do: Repo.get!(Batch, batch.id)

  def steps_of(batch) do
    Repo.all(
      from(s in Step, where: s.batch_id == ^batch.id, order_by: [s.due_on, s.position, s.id])
    )
    |> Repo.preload([:step_type, :phase])
  end

  def named(batch, name), do: Enum.find(steps_of(batch), &(Steps.name(&1) == name))

  @doc "`[{name, date, vessel}]` in order."
  def layout(batch), do: Enum.map(steps_of(batch), &{Steps.name(&1), &1.due_on, &1.vessel_index})

  @doc "The batch's links as `{from name, to name, answer}`."
  def links(batch) do
    names = Map.new(steps_of(batch), &{&1.id, Steps.name(&1)})
    ids = Map.keys(names)

    Repo.all(from(l in StepLink, where: l.from_step_id in ^ids, order_by: l.id))
    |> Enum.map(&{names[&1.from_step_id], names[&1.to_step_id], &1.default_answer})
  end

  @doc "`%{vessel_index => tank_id}`."
  def vessels(batch) do
    Repo.all(from(v in BatchVessel, where: v.batch_id == ^batch.id))
    |> Map.new(&{&1.vessel_index, &1.tank_id})
  end

  @doc "Mark a step done on its own day (no check-off rules)."
  def done!(step) do
    step |> Ecto.Changeset.change(done_on: step.due_on) |> Repo.update!()
  end
end
