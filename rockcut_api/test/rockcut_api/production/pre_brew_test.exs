defmodule RockcutApi.Production.PreBrewTest do
  @moduledoc """
  D56 §3.1 (decisions 1, 2, 7, 10, 11): pre-brew steps. Template days
  −30…365, only plain steps before brew day; copied into a batch; moving
  with the first Brew day whatever the answer; never moved onto brew day or
  later; checked off on a planned batch (late: on its planned day); no tank
  time; the Brewery task; Undo.
  """
  use RockcutApi.DataCase

  import RockcutApi.AccountsFixtures
  import RockcutApi.ProductionFixtures

  alias RockcutApi.Production
  alias RockcutApi.Production.{Batches, Parts, Phase, Schedule, Splits, Steps, TaskLink, Undo}

  # Brew Wed Dec 2: Prepare grain Dec 1 (day −1), Order yeast Nov 28
  # (day −4); FDH Dec 9, Set temp 58° Dec 12, Carb Dec 16, Package and CIP
  # Dec 22.
  @brew ~D[2026-12-02]

  setup do
    {:ok, grain} = Production.create_step_type(%{"name" => "Prepare grain"})
    {:ok, yeast} = Production.create_step_type(%{"name" => "Order yeast"})
    t = ale_template!()
    t = add!(t, "Prepare grain", -1, [])
    t = add!(t, "Order yeast", -4, [])
    [] = t.issues

    %{
      template: t,
      grain: grain,
      yeast: yeast,
      fv3: tank!("FV3"),
      brewer: user_with_role("employee", "brewery")
    }
  end

  defp plan(ctx, extra \\ %{}),
    do:
      plan!(
        brand!("Galactic"),
        ctx.template,
        @brew,
        Map.merge(%{"tank_ids" => [ctx.fv3.id]}, extra)
      )

  defp dates(batch), do: Enum.map(layout(batch), fn {name, day, _} -> {name, day} end)

  defp due(batch, name), do: named(batch, name).due_on

  # A template with Prepare grain leading to Brew day ("move all").
  defp linked_template do
    {:ok, t} =
      Production.create_template(%{"name" => "Linked #{System.unique_integer([:positive])}"})

    [brew] = t.steps
    t = add!(t, "FDH", 7, after: brew)
    t = add!(t, "Package", 20, after: entry(t, "FDH"))

    {:ok, t} =
      Production.add_step(t, %{
        "step_type_id" => type!("Prepare grain").id,
        "day_offset" => -1,
        "leads_to_id" => brew.id
      })

    [] = t.issues
    t
  end

  describe "template entries (decisions 7, 10)" do
    test "a plain step from day −30; no phase, the first tank", ctx do
      grain = entry(ctx.template, "Prepare grain")
      assert %{day_offset: -1, vessel_index: 0, phase_id: nil} = grain

      # Sorted before brew day.
      assert hd(ctx.template.steps).day_offset == -4

      {:ok, t} =
        Production.add_step(ctx.template, %{"step_type_id" => ctx.yeast.id, "day_offset" => -30})

      assert Enum.any?(t.steps, &(&1.day_offset == -30))

      assert {:error, %Ecto.Changeset{errors: [day_offset: _]}} =
               Production.add_step(ctx.template, %{
                 "step_type_id" => ctx.yeast.id,
                 "day_offset" => -31
               })

      assert {:error, %Ecto.Changeset{errors: [day_offset: _]}} =
               Production.add_step(ctx.template, %{
                 "step_type_id" => ctx.yeast.id,
                 "day_offset" => 366
               })
    end

    test "a type's own phase doesn't apply before brew day; a phase picked is refused", ctx do
      lag = Repo.get_by!(Phase, name: "Lag")

      {:ok, phased} =
        Production.create_step_type(%{"name" => "Mill", "starts_phase_id" => lag.id})

      {:ok, t} =
        Production.add_step(ctx.template, %{"step_type_id" => phased.id, "day_offset" => "-2"})

      assert entry(t, "Mill").phase_id == nil

      assert {:error, {:not_before_brew, "Mill"}} =
               Production.add_step(ctx.template, %{
                 "step_type_id" => phased.id,
                 "day_offset" => -2,
                 "phase_id" => lag.id
               })

      # A phase marker can't go there either.
      assert {:error, {:not_before_brew, "phase marker"}} =
               Production.add_step(ctx.template, %{"phase_id" => lag.id, "day_offset" => -1})
    end

    test "Transfer, Split, Package, Set temp and CIP are refused (not_before_brew)", ctx do
      for {name, extra} <- [
            {"Transfer", %{"vessel_index" => 1}},
            {"Split", %{}},
            {"Package", %{}},
            {"Set temp", %{"temperature" => 60}},
            {"CIP & Sanitize", %{}}
          ] do
        type = type!(name)

        assert {:error, {:not_before_brew, ^name}} =
                 Production.add_step(
                   ctx.template,
                   Map.merge(%{"step_type_id" => type.id, "day_offset" => -1}, extra)
                 ),
               name
      end

      # A ramp can't start before day 0 (D47).
      assert {:error, :ramp_days} =
               Production.add_ramp(ctx.template, %{
                 "start" => 66,
                 "target" => 60,
                 "change_per_day" => 3,
                 "first_day" => -2
               })
    end

    test "a plain step in a later tank can't go before brew day", ctx do
      t = lager_template!()

      assert {:error, {:not_before_brew, "Prepare grain"}} =
               Production.add_step(t, %{
                 "step_type_id" => ctx.grain.id,
                 "day_offset" => -1,
                 "vessel_index" => 1
               })
    end

    test "changing the day of an entry: a plain step may go before brew day, others not", ctx do
      t = ctx.template
      carb = entry(t, "Carb")

      # Carb follows Set temp, so it can't come before it (D46).
      assert {:error, :link_order} = Production.update_step(t, carb, %{"day_offset" => -2})

      {:ok, t} = Production.add_step(t, %{"step_type_id" => type!("Carb").id, "day_offset" => 3})
      loose = Enum.find(t.steps, &(&1.day_offset == 3))
      {:ok, t} = Production.update_step(t, loose, %{"day_offset" => -2, "phase_id" => nil})
      assert Enum.find(t.steps, &(&1.id == loose.id)).day_offset == -2

      assert {:error, {:not_before_brew, "Package"}} =
               Production.update_step(t, entry(t, "Package"), %{"day_offset" => -1})

      # Brew day stays on day 0 (D46): the template's first Brew day.
      assert {:error, :brew_day_fixed} =
               Production.update_step(t, entry(t, "Brew day"), %{"day_offset" => -1})
    end
  end

  describe "copying (Plan batch, Change template)" do
    test "due on brew day + offset; no CIP and no second brew day picked up", ctx do
      batch = plan(ctx, %{"brew_two_days" => true})

      assert dates(batch) == [
               {"Order yeast", ~D[2026-11-28]},
               {"Prepare grain", ~D[2026-12-01]},
               {"Brew day - 1 of 2", @brew},
               {"Brew day - 2 of 2", ~D[2026-12-03]},
               {"FDH", ~D[2026-12-09]},
               {"Set temp - 58°", ~D[2026-12-12]},
               {"Carb", ~D[2026-12-16]},
               {"Package", ~D[2026-12-22]},
               {"CIP & Sanitize", ~D[2026-12-22]}
             ]

      assert Enum.all?(steps_of(batch), &(&1.vessel_index == 0))
    end

    test "Change template copies them from the same brew day", ctx do
      batch = plan!(brand!("Galactic"), ale_template!("Plain"), @brew)
      assert {:ok, _} = RockcutApi.Production.BatchChanges.change_template(batch, ctx.template.id)
      assert due(batch, "Prepare grain") == ~D[2026-12-01]
      assert due(batch, "Order yeast") == ~D[2026-11-28]
    end
  end

  describe "moves with brew day (decision 2)" do
    test "a brew-day move takes them along under either answer, not as following steps", ctx do
      batch = plan(ctx)
      brew = named(batch, "Brew day")

      assert {:ok, {:preview, pre}} = Steps.move([brew.id], 2, preview: true)

      assert Enum.map(pre.following, & &1.name) == [
               "FDH",
               "Set temp - 58°",
               "Carb",
               "Package",
               "CIP & Sanitize"
             ]

      for a <- ~w(move_all move_only) do
        assert Enum.map(pre.pre_brew[a], &{&1.name, &1.new_due_on}) == [
                 {"Order yeast", ~D[2026-11-30]},
                 {"Prepare grain", ~D[2026-12-03]}
               ]
      end

      assert {:ok, _} = Steps.move([brew.id], 2, answer: "move_only")
      assert due(batch, "Brew day") == ~D[2026-12-04]
      assert due(batch, "Prepare grain") == ~D[2026-12-03]
      assert due(batch, "Order yeast") == ~D[2026-11-30]
      assert due(batch, "FDH") == ~D[2026-12-09]

      assert {:ok, _} = Steps.move([brew.id], -5, answer: "move_all")
      assert due(batch, "Prepare grain") == ~D[2026-11-28]
      assert due(batch, "Order yeast") == ~D[2026-11-25]
      assert due(batch, "FDH") == ~D[2026-12-04]
    end

    test "with nothing following there's no prompt; a finished one stays put", ctx do
      batch = plan(ctx)
      yeast = named(batch, "Order yeast")
      assert {:ok, _} = Steps.complete(yeast.id, %{}, ctx.brewer, today: yeast.due_on)

      # Brew day and everything after it: nothing left to follow.
      ids = for s <- steps_of(batch), Date.compare(s.due_on, @brew) != :lt, do: s.id
      assert {:ok, {:preview, pre}} = Steps.move(ids, 1, preview: true)
      assert pre.following == []
      assert pre.default_answer == nil
      assert Enum.map(pre.pre_brew["move_only"], & &1.name) == ["Prepare grain"]

      assert {:ok, _} = Steps.move(ids, 1)
      assert due(batch, "Prepare grain") == ~D[2026-12-02]
      assert due(batch, "Order yeast") == ~D[2026-11-28]
    end

    test "the date box (a move of brew day) and Undo puts both back", ctx do
      batch = plan(ctx)
      brew = named(batch, "Brew day")

      {:ok, {_, token}} =
        Undo.track(ctx.brewer, Undo.step_scope([brew.id]), fn ->
          Steps.move([brew.id], 3, answer: "move_only")
        end)

      assert due(batch, "Prepare grain") == ~D[2026-12-04]
      assert {:ok, _} = Undo.undo(ctx.brewer, token)
      assert due(batch, "Brew day") == @brew
      assert due(batch, "Prepare grain") == ~D[2026-12-01]
      assert due(batch, "Order yeast") == ~D[2026-11-28]
    end

    test "the whole-batch drag moves the unfinished ones; a finished one stays", ctx do
      batch = plan(ctx)
      yeast = named(batch, "Order yeast")
      assert {:ok, _} = Steps.complete(yeast.id, %{}, ctx.brewer, today: yeast.due_on)

      assert {:ok, %{moved: 7, kept: 1}} = Batches.shift(reload(batch), 3)
      assert due(batch, "Brew day") == ~D[2026-12-05]
      assert due(batch, "Prepare grain") == ~D[2026-12-04]
      assert due(batch, "Order yeast") == ~D[2026-11-28]
    end

    test "brew day checked off on another day moves them, even with Move only; Mark not done puts them back",
         ctx do
      batch = plan(ctx)
      brew = named(batch, "Brew day")

      assert {:ok, {:preview, %{move: move}}} =
               Steps.complete(brew.id, %{"done_on" => "2026-12-04"}, ctx.brewer,
                 preview: true,
                 today: ~D[2026-12-10]
               )

      assert Enum.map(move.pre_brew["move_only"], & &1.name) == ["Order yeast", "Prepare grain"]

      assert {:ok, _} =
               Steps.complete(
                 brew.id,
                 %{"done_on" => "2026-12-04", "answer" => "move_only", "batch_number" => "40"},
                 ctx.brewer,
                 today: ~D[2026-12-10]
               )

      assert due(batch, "Prepare grain") == ~D[2026-12-03]
      assert due(batch, "Order yeast") == ~D[2026-11-30]
      assert due(batch, "FDH") == ~D[2026-12-09]

      assert {:ok, _} = Steps.uncomplete(brew.id)
      assert due(batch, "Brew day") == @brew
      assert due(batch, "Prepare grain") == ~D[2026-12-01]
      assert due(batch, "Order yeast") == ~D[2026-11-28]
    end

    test "a split part's moves leave them; the root's brew day takes them", ctx do
      fv6 = tank!("FV6")
      batch = plan(ctx)

      {:ok, %{part_ids: [p1, _]}} =
        Splits.split(reload(batch), %{
          "due_on" => "2026-12-13",
          "parts" => [
            %{"stays" => true, "volume_bbl" => "12"},
            %{"tank_id" => fv6.id, "volume_bbl" => "8"}
          ]
        })

      part_carb = named(%{id: p1}, "Carb")
      assert {:ok, _} = Steps.move([part_carb.id], 1, answer: "move_all")
      assert due(batch, "Prepare grain") == ~D[2026-12-01]

      assert {:ok, _} = Steps.move([named(batch, "Brew day").id], 2, answer: "move_all")
      assert due(batch, "Prepare grain") == ~D[2026-12-03]
      assert due(batch, "Order yeast") == ~D[2026-11-30]
      assert named(%{id: p1}, "Carb").due_on == ~D[2026-12-19]
    end
  end

  describe "a pre-brew step stays before brew day (before_brew_day)" do
    test "moving it onto brew day or later is refused, the preview too; earlier is fine", ctx do
      batch = plan(ctx)
      grain = named(batch, "Prepare grain")

      for days <- [1, 3] do
        assert {:error, {:before_brew_day, :pre_brew}} =
                 Steps.move([grain.id], days, preview: true)

        assert {:error, {:before_brew_day, :pre_brew}} = Steps.move([grain.id], days)
      end

      assert {:ok, _} = Steps.move([grain.id], -2)
      assert due(batch, "Prepare grain") == ~D[2026-11-29]

      # Moving brew day earlier than an unfinished one (both moved by the drag) is fine:
      # they keep their distance.
      assert {:ok, _} = Steps.move([named(batch, "Brew day").id], -10, answer: "move_all")
      assert due(batch, "Prepare grain") == ~D[2026-11-19]
    end

    test "linked to brew day: Move all takes brew day along; Move only is refused" do
      batch = plan!(brand!("Galactic"), linked_template(), @brew)
      grain = named(batch, "Prepare grain")

      assert {:ok, {:preview, pre}} = Steps.move([grain.id], 2, preview: true)
      assert pre.default_answer == "move_all"
      assert "Brew day" in Enum.map(pre.following, & &1.name)

      assert {:error, {:before_brew_day, :pre_brew}} =
               Steps.move([grain.id], 2, answer: "move_only")

      assert {:ok, _} = Steps.move([grain.id], 2, answer: "move_all")
      assert due(batch, "Prepare grain") == ~D[2026-12-03]
      assert due(batch, "Brew day") == ~D[2026-12-04]
    end
  end

  describe "check-off (decision 11)" do
    test "on a planned batch: no number, no fill, the batch stays planned", ctx do
      batch = plan(ctx)
      grain = named(batch, "Prepare grain")

      assert {:ok, {:preview, %{needs_batch_number: false, move: nil}}} =
               Steps.complete(grain.id, %{}, ctx.brewer, preview: true, today: grain.due_on)

      assert {:ok, _} = Steps.complete(grain.id, %{}, ctx.brewer, today: grain.due_on)
      assert %{status: "planned", batch_number: nil} = reload(batch)
      assert named(batch, "Prepare grain").done_on == ~D[2026-12-01]
    end

    test "a pencilled batch: schedule first", ctx do
      batch = plan(ctx, %{"pencilled" => true})
      grain = named(batch, "Prepare grain")

      assert {:error, :schedule_first} =
               Steps.complete(grain.id, %{}, ctx.brewer, today: grain.due_on)
    end

    test "on brew day or after: stays on its planned day, nothing moves, no prompt", ctx do
      batch = plan!(brand!("Galactic"), linked_template(), @brew)

      for {done_on, b} <- [{"2026-12-02", batch}, {"2026-12-03", nil}] do
        b = b || plan!(brand!("Altruism"), linked_template(), @brew)
        grain = named(b, "Prepare grain")

        assert {:ok, {:preview, %{move: nil}}} =
                 Steps.complete(grain.id, %{"done_on" => done_on}, ctx.brewer,
                   preview: true,
                   today: ~D[2026-12-10]
                 )

        assert {:ok, _} =
                 Steps.complete(grain.id, %{"done_on" => done_on}, ctx.brewer,
                   today: ~D[2026-12-10]
                 )

        assert %{due_on: ~D[2026-12-01], done_on: done, checkoff_move: nil} =
                 named(b, "Prepare grain")

        assert Date.to_iso8601(done) == done_on
        assert due(b, "Brew day") == @brew
        assert reload(b).status == "planned"

        # Mark not done: still on its day.
        assert {:ok, _} = Steps.uncomplete(grain.id)
        assert %{due_on: ~D[2026-12-01], done_on: nil} = named(b, "Prepare grain")
      end
    end

    test "earlier, still before brew day: moves to that day, with its links' prompt", ctx do
      batch = plan(ctx)
      grain = named(batch, "Prepare grain")

      assert {:ok, _} =
               Steps.complete(grain.id, %{"done_on" => "2026-11-30"}, ctx.brewer,
                 today: ~D[2026-12-10]
               )

      assert %{due_on: ~D[2026-11-30], done_on: ~D[2026-11-30]} = named(batch, "Prepare grain")

      linked = plan!(brand!("Altruism"), linked_template(), @brew)
      grain = named(linked, "Prepare grain")

      assert {:error, {:answer_required, _}} =
               Steps.complete(grain.id, %{"done_on" => "2026-11-30"}, ctx.brewer,
                 today: ~D[2026-12-10]
               )

      assert {:ok, _} =
               Steps.complete(
                 grain.id,
                 %{"done_on" => "2026-11-30", "answer" => "move_only"},
                 ctx.brewer,
                 today: ~D[2026-12-10]
               )

      assert due(linked, "Prepare grain") == ~D[2026-11-30]
      assert due(linked, "Brew day") == @brew
    end
  end

  describe "no tank time" do
    test "the part starts on brew day; no overlap with the batch leaving the day before; tank status unchanged",
         ctx do
      # Altruism leaves FV3 (Package and CIP) on Dec 1, the day of Prepare grain.
      altruism =
        plan!(brand!("Altruism"), ale_template!("Plain"), ~D[2026-11-11], %{
          "tank_ids" => [ctx.fv3.id]
        })

      assert due(altruism, "Package") == ~D[2026-12-01]
      batch = plan(ctx)

      [part] = [batch.id] |> Schedule.batches() |> Parts.build()
      assert part.start == @brew
      assert part.fill.id == named(batch, "Brew day").id

      today = ~D[2026-12-01]
      {:ok, s} = Schedule.load(~D[2026-11-01], ~D[2026-12-31], today)
      assert Enum.filter(s.flags, &(&1.kind in ~w(tank_overlap dirty_fill))) == []
      status = Enum.find(s.statuses, &(&1.tank_id == ctx.fv3.id))

      Repo.delete!(named(batch, "Prepare grain"))
      Repo.delete!(named(batch, "Order yeast"))
      {:ok, s2} = Schedule.load(~D[2026-11-01], ~D[2026-12-31], today)
      assert Enum.find(s2.statuses, &(&1.tank_id == ctx.fv3.id)) == status
    end
  end

  describe "the Brewery task" do
    test "worded with the first tank's name, or No tank; the batch's P-number", ctx do
      batch = plan(ctx)
      grain = named(batch, "Prepare grain")

      assert %{title: "FV3 · Galactic P1 · Prepare grain", due_on: ~D[2026-12-01]} =
               TaskLink.want(grain)

      {:ok, _} = Batches.set_vessel_tank(batch, 0, nil)
      assert TaskLink.want(grain).title == "No tank · Galactic P1 · Prepare grain"

      TaskLink.sync!()
      task = Repo.get_by!(RockcutApi.Tasks.Task, production_step_id: grain.id)
      assert %{step_name: "Prepare grain", batch_label: "Galactic P1"} = TaskLink.describe(task)
    end
  end
end
