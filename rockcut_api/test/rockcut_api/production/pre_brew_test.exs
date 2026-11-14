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

  alias RockcutApi.Production.{
    BatchChanges,
    Batches,
    Parts,
    Phase,
    Schedule,
    Splits,
    Steps,
    TaskLink,
    Undo
  }

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

      # DEV gap 5: refused for the phase, not the type.
      assert {:error, {:not_before_brew, :phase}} =
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

      # DEV gap 5: refused for the tank, not the type.
      assert {:error, {:not_before_brew, :tank}} =
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

  describe "brew day not before a finished pre-brew step (decision 21, DEV gaps 3, 9)" do
    # Order yeast (Nov 28) done on its day; brew day Dec 2.
    defp yeast_done(ctx) do
      batch = plan(ctx)
      yeast = named(batch, "Order yeast")
      assert {:ok, _} = Steps.complete(yeast.id, %{}, ctx.brewer, today: yeast.due_on)
      batch
    end

    @refused {:before_brew_day, {:pre_brew_done, "Order yeast", ~D[2026-11-28]}}

    test "the message" do
      assert Steps.refusal(@refused) == %{
               error: "before_brew_day",
               message: "Order yeast was done Sat Nov 28; brew day can't be before it."
             }
    end

    test "the date box or a drag of brew day: the day before its done day refused, under both answers and in the preview; the same day works (gap 9)",
         ctx do
      batch = yeast_done(ctx)
      brew = named(batch, "Brew day")

      for answer <- ~w(move_all move_only) do
        assert {:error, @refused} = Steps.move([brew.id], -5, answer: answer)
      end

      assert {:error, @refused} = Steps.move([brew.id], -5, preview: true)
      assert {:error, @refused} = Steps.move([brew.id], -6, answer: "move_only")
      assert due(batch, "Brew day") == @brew

      assert {:ok, {:preview, %{refused: refused}}} = Steps.move([brew.id], -4, preview: true)
      assert Enum.all?(Map.values(refused), &is_nil/1)
      assert {:ok, _} = Steps.move([brew.id], -4, answer: "move_only")
      assert due(batch, "Brew day") == ~D[2026-11-28]
      assert due(batch, "Order yeast") == ~D[2026-11-28]
    end

    test "a multi-select move with brew day in it", ctx do
      batch = yeast_done(ctx)
      ids = [named(batch, "Brew day").id, named(batch, "FDH").id]
      assert {:error, @refused} = Steps.move(ids, -5, answer: "move_only")
      assert due(batch, "Brew day") == @brew
    end

    test "brew day checked off before that day (off-plan) refused, the preview too; on it works (gap 9)",
         ctx do
      batch = yeast_done(ctx)
      brew = named(batch, "Brew day")

      assert {:error, @refused} =
               Steps.complete(brew.id, %{"done_on" => "2026-11-27"}, ctx.brewer,
                 preview: true,
                 today: ~D[2026-11-28]
               )

      assert {:error, @refused} =
               Steps.complete(
                 brew.id,
                 %{"done_on" => "2026-11-27", "answer" => "move_only", "batch_number" => "40"},
                 ctx.brewer,
                 today: ~D[2026-11-28]
               )

      assert named(batch, "Brew day").done_on == nil

      assert {:ok, {:preview, _}} =
               Steps.complete(brew.id, %{"done_on" => "2026-11-28"}, ctx.brewer,
                 preview: true,
                 today: ~D[2026-11-28]
               )

      assert {:ok, _} =
               Steps.complete(
                 brew.id,
                 %{"done_on" => "2026-11-28", "answer" => "move_only", "batch_number" => "40"},
                 ctx.brewer,
                 today: ~D[2026-11-28]
               )

      assert %{due_on: ~D[2026-11-28], done_on: ~D[2026-11-28]} = named(batch, "Brew day")
    end

    # QA's gap 9: brew day overdue, the pre-brew step ticked late (it stays
    # on its day, decision 11), then brew day done the same day. Either
    # order works.
    test "gap 9: a pre-brew step ticked late and brew day done that same day, in either order",
         ctx do
      for {ticks, brand, tank} <- [
            {[:pre_brew, :brew], "Galactic", "FV4"},
            {[:brew, :pre_brew], "Altruism", "FV5"}
          ] do
        batch = plan!(brand!(brand), ctx.template, @brew, %{"tank_ids" => [tank!(tank).id]})
        brew = named(batch, "Brew day")
        late = ~D[2026-12-09]
        attrs = %{"done_on" => "2026-12-09", "answer" => "move_all"}

        for tick <- ticks do
          case tick do
            :pre_brew ->
              for name <- ["Order yeast", "Prepare grain"] do
                assert {:ok, _} =
                         Steps.complete(named(batch, name).id, attrs, ctx.brewer, today: late)
              end

            :brew ->
              assert {:ok, {:preview, _}} =
                       Steps.complete(brew.id, attrs, ctx.brewer, preview: true, today: late)

              number = to_string(Batches.next_batch_number())

              assert {:ok, _} =
                       Steps.complete(
                         brew.id,
                         Map.put(attrs, "batch_number", number),
                         ctx.brewer,
                         today: late
                       )
          end
        end

        assert %{due_on: ^late, done_on: ^late} = named(batch, "Brew day")
        assert named(batch, "Prepare grain").done_on == late
        assert named(batch, "Order yeast").done_on == late
      end
    end

    test "the whole-batch drag: the day before refused, the same day works (gap 9); its preview writes nothing",
         ctx do
      batch = yeast_done(ctx)
      assert {:error, @refused} = Batches.shift(reload(batch), -5)
      assert {:error, @refused} = Batches.shift(reload(batch), -5, preview: true)
      assert due(batch, "Brew day") == @brew

      assert {:ok, {:preview, %{moved: 7, kept: 1}}} =
               Batches.shift(reload(batch), -4, preview: true)

      assert due(batch, "Brew day") == @brew
      assert {:ok, %{moved: 7}} = Batches.shift(reload(batch), -4)
      assert due(batch, "Brew day") == ~D[2026-11-28]
    end

    test "later is fine, and an unfinished pre-brew step keeps its own rule", ctx do
      batch = yeast_done(ctx)
      brew = named(batch, "Brew day")
      assert {:ok, _} = Steps.move([brew.id], 2, answer: "move_only")
      assert due(batch, "Brew day") == ~D[2026-12-04]
    end
  end

  describe "pre-brew because it was planned that way (decision 22, DEV gap 11)" do
    defp out_of_order(batch) do
      {:ok, s} = Schedule.load(Date.add(@brew, -30), Date.add(@brew, 60), @brew)
      for f <- s.flags, f.kind == "out_of_order", batch.id in f.batch_ids, do: f.message
    end

    test "set where the step comes from: a template's negative day, Add step before brew day; not a later step",
         ctx do
      batch = plan(ctx)
      flags = Map.new(steps_of(batch), &{Steps.name(&1), &1.pre_brew})

      assert flags == %{
               "Order yeast" => true,
               "Prepare grain" => true,
               "Brew day" => false,
               "FDH" => false,
               "Set temp - 58°" => false,
               "Carb" => false,
               "Package" => false,
               "CIP & Sanitize" => false
             }

      for {day, pre_brew} <- [{~D[2026-11-30], true}, {~D[2026-12-05], false}] do
        {:ok, %{step_ids: [id]}} =
          BatchChanges.add_step(batch, %{"name" => "Mill #{day.day}", "due_on" => day})

        assert Repo.get!(RockcutApi.Production.Step, id).pre_brew == pre_brew
      end
    end

    test "a step a Move only left before brew day stays when brew day moves again, and is flagged",
         ctx do
      batch = plan(ctx)
      brew = named(batch, "Brew day")

      # Brew day to Dec 12 alone: FDH (Dec 9, plain) is left before it.
      assert {:ok, _} = Steps.move([brew.id], 10, answer: "move_only")
      assert due(batch, "FDH") == ~D[2026-12-09]
      assert "Galactic P1: FDH is before Brew day, the step it follows." in out_of_order(batch)

      # Moved again, FDH doesn't go with it: it isn't pre-brew.
      for {days, on} <- [{-1, ~D[2026-12-11]}, {-1, ~D[2026-12-10]}] do
        assert {:ok, {:preview, pre}} = Steps.move([brew.id], days, preview: true)
        refute "FDH" in Enum.map(pre.pre_brew["move_only"], & &1.name)
        assert {:ok, _} = Steps.move([brew.id], days, answer: "move_only")
        assert due(batch, "Brew day") == on
        assert due(batch, "FDH") == ~D[2026-12-09]
        assert "Galactic P1: FDH is before Brew day, the step it follows." in out_of_order(batch)
      end

      # Not pre-brew, so it can't be checked off there before brew day (decision 26).
      fdh = named(batch, "FDH")

      assert {:error, {:brew_first, "FDH"}} =
               Steps.complete(fdh.id, %{}, ctx.brewer, today: fdh.due_on)
    end

    test "the migration's backfill", ctx do
      alias RockcutApi.Production.Step

      [mod | _] =
        Code.require_file(
          "priv/repo/migrations/20261114120001_add_pre_brew_to_production_steps.exs"
        )

      {mod, _} = mod

      batch = plan(ctx)
      brew = named(batch, "Brew day")
      {:ok, check} = Production.create_step_type(%{"name" => "Water check", "has_result" => true})

      add = fn attrs ->
        {:ok, %{step_ids: [id]}} = BatchChanges.add_step(batch, attrs)
        Repo.get!(Step, id)
      end

      mill = add.(%{"name" => "Mill", "due_on" => ~D[2026-11-30]})
      water = add.(%{"step_type_id" => check.id, "due_on" => ~D[2026-11-29]})
      late = add.(%{"name" => "Rack", "due_on" => ~D[2026-12-05]})

      # A retest of the pre-brew check, before brew day, that an earlier draft
      # of this migration marked pre-brew (decision 25: it isn't).
      {:ok, _} =
        Steps.complete(
          water.id,
          %{"result" => "fail", "fail_action" => "retest", "retest_days" => 1},
          ctx.brewer,
          today: water.due_on
        )

      r1 = Repo.get_by!(Step, retest_of_id: water.id)

      # FDH left before brew day (data from before decision 22), a retest of it there too.
      fdh = named(batch, "FDH")
      Repo.update_all(from(s in Step, where: s.id == ^fdh.id), set: [due_on: ~D[2026-11-27]])

      fdh_retest =
        Repo.insert!(%Step{
          batch_id: batch.id,
          step_type_id: check.id,
          due_on: ~D[2026-11-26],
          added: true,
          retest_of_id: fdh.id
        })

      Repo.update_all(from(s in Step, where: s.batch_id == ^batch.id), set: [pre_brew: false])
      Repo.update_all(from(s in Step, where: s.id == ^r1.id), set: [pre_brew: true])
      for sql <- mod.backfill(), do: Repo.query!(sql)

      pre = for s <- steps_of(batch), s.pre_brew, into: MapSet.new(), do: s.id

      assert pre ==
               MapSet.new([
                 named(batch, "Order yeast").id,
                 named(batch, "Prepare grain").id,
                 mill.id,
                 water.id
               ])

      refute Enum.any?([brew, late, r1, fdh, fdh_retest], &(&1.id in pre))
    end

    test "Change template keeps a kept step's flag", ctx do
      batch = plan(ctx)
      yeast = named(batch, "Order yeast")
      assert {:ok, _} = Steps.complete(yeast.id, %{}, ctx.brewer, today: yeast.due_on)
      other = ale_template!("Other ale")
      other = add!(other, "Order yeast", -2, [])
      assert {:ok, _} = BatchChanges.change_template(reload(batch), other.id)
      assert %{pre_brew: true, done_on: ~D[2026-11-28]} = named(batch, "Order yeast")
    end
  end

  # D56 decision 26 (DEV gap 13): nothing after brew day is done before the
  # first Brew day. Brew Wed Dec 2: FDH Dec 9, Set temp 58° Dec 12.
  describe "brew day comes first (decision 26)" do
    test "QA's gap 13: FDH early on a planned batch is refused, the preview too; nothing changes",
         ctx do
      batch = plan(ctx)
      fdh = named(batch, "FDH")

      for preview <- [true, false] do
        assert {:error, {:brew_first, "FDH"}} =
                 Steps.complete(fdh.id, %{"answer" => "move_only"}, ctx.brewer,
                   preview: preview,
                   today: ~D[2026-11-28]
                 )
      end

      assert %{done_on: nil, due_on: ~D[2026-12-09]} = named(batch, "FDH")

      # Once brewed, it works.
      brew = named(batch, "Brew day")
      {:ok, _} = Steps.complete(brew.id, %{"batch_number" => "40"}, ctx.brewer, today: @brew)
      assert {:ok, _} = Steps.complete(fdh.id, %{}, ctx.brewer, today: fdh.due_on)
    end

    test "pre-brew steps are exempt; a pencilled batch still says schedule first", ctx do
      batch = plan(ctx)
      grain = named(batch, "Prepare grain")
      assert {:ok, _} = Steps.complete(grain.id, %{}, ctx.brewer, today: grain.due_on)

      pencilled =
        plan!(brand!("Altruism"), ctx.template, @brew, %{
          "tank_ids" => [tank!("FV9").id],
          "pencilled" => true
        })

      fdh = named(pencilled, "FDH")

      assert {:error, :schedule_first} =
               Steps.complete(fdh.id, %{}, ctx.brewer, today: fdh.due_on)
    end

    test "a standalone CIP isn't held by any brew day", ctx do
      {:ok, cip} =
        RockcutApi.Production.Cips.create(
          %{"tank_id" => ctx.fv3.id, "due_on" => "2026-11-20"},
          ctx.brewer,
          ~D[2026-11-20]
        )

      assert {:ok, _} = Steps.complete(cip.id, %{}, ctx.brewer, today: ~D[2026-11-20])
    end

    test "Undo doesn't bring back a step done before brew day", ctx do
      batch = plan(ctx)
      brew = named(batch, "Brew day")
      fdh = named(batch, "FDH")
      {:ok, _} = Steps.complete(brew.id, %{"batch_number" => "40"}, ctx.brewer, today: @brew)
      {:ok, _} = Steps.complete(fdh.id, %{}, ctx.brewer, today: fdh.due_on)

      # FDH marked not done (Undo-able), then brew day marked not done.
      {:ok, {_, token}} =
        Undo.track(ctx.brewer, Undo.step_scope([fdh.id]), fn -> Steps.uncomplete(fdh.id) end)

      {:ok, _} = Steps.uncomplete(brew.id)
      assert {:error, {:brew_first, "FDH"}} = Undo.undo(ctx.brewer, token)
      assert named(batch, "FDH").done_on == nil
    end

    # The lead's mirror: brew day stays done while a step after it is.
    test "Mark brew day not done while later steps are done: names the earliest; pre-brew ones don't count",
         ctx do
      batch = plan(ctx)
      brew = named(batch, "Brew day")
      grain = named(batch, "Prepare grain")
      {:ok, _} = Steps.complete(grain.id, %{}, ctx.brewer, today: grain.due_on)
      {:ok, _} = Steps.complete(brew.id, %{"batch_number" => "40"}, ctx.brewer, today: @brew)

      for name <- ["Set temp - 58°", "FDH"] do
        s = named(batch, name)
        {:ok, _} = Steps.complete(s.id, %{"answer" => "move_only"}, ctx.brewer, today: s.due_on)
      end

      assert {:error, {:done_after_brew, "FDH"}} = Steps.uncomplete(brew.id)
      {:ok, _} = Steps.uncomplete(named(batch, "FDH").id)
      assert {:error, {:done_after_brew, "Set temp - 58°"}} = Steps.uncomplete(brew.id)
      {:ok, _} = Steps.uncomplete(named(batch, "Set temp - 58°").id)

      # Only the pre-brew step is done now: that doesn't hold it.
      assert {:ok, _} = Steps.uncomplete(brew.id)

      assert named(batch, "Brew day").done_on == nil
      assert reload(batch).status == "planned"
    end

    test "Undo of a brew-day check-off is a plain row restore", ctx do
      batch = plan(ctx)
      brew = named(batch, "Brew day")

      {:ok, {_, token}} =
        Undo.track(ctx.brewer, Undo.step_scope([brew.id]), fn ->
          Steps.complete(brew.id, %{"batch_number" => "40"}, ctx.brewer, today: @brew)
        end)

      assert {:ok, _} = Undo.undo(ctx.brewer, token)
      assert named(batch, "Brew day").done_on == nil
      assert reload(batch).status == "planned"
    end

    # Matt's case: a two-day brew, "1 of 2" done; a Set temp between the
    # two checked off before "2 of 2", then "2 of 2" moved later past it.
    test "a two-day brew: only \"1 of 2\" counts", ctx do
      batch = plan(ctx, %{"brew_two_days" => true})
      [one, two] = ["Brew day - 1 of 2", "Brew day - 2 of 2"] |> Enum.map(&named(batch, &1))
      set_temp = named(batch, "Set temp - 58°")

      # "2 of 2" (Dec 3) moved to Dec 14 alone: the Set temp (Dec 12) sits between.
      assert {:ok, _} = Steps.move([two.id], 11, answer: "move_only")

      assert {:error, {:brew_first, "Set temp - 58°"}} =
               Steps.complete(set_temp.id, %{}, ctx.brewer, today: ~D[2026-12-12])

      {:ok, _} = Steps.complete(one.id, %{"batch_number" => "40"}, ctx.brewer, today: @brew)
      assert {:ok, _} = Steps.complete(set_temp.id, %{}, ctx.brewer, today: ~D[2026-12-12])
      assert {:ok, _} = Steps.move([two.id], 2, answer: "move_only")
      assert %{due_on: ~D[2026-12-16], done_on: nil} = named(batch, "Brew day - 2 of 2")
      assert named(batch, "Set temp - 58°").done_on == ~D[2026-12-12]

      # The mirror counts only "1 of 2": it stays done while the Set temp is.
      assert {:error, {:done_after_brew, "Set temp - 58°"}} = Steps.uncomplete(one.id)
    end
  end

  # D56 decision 24 (DEV gap 12): QA's path.
  describe "Mark not done on a brew day a finished pre-brew step holds (decision 24)" do
    test "says to mark that step not done first; after it, it works", ctx do
      batch = plan(ctx)
      late = ~D[2026-12-09]

      for name <- ["Order yeast", "Prepare grain"] do
        s = named(batch, name)

        assert {:ok, _} =
                 Steps.complete(s.id, %{"done_on" => "2026-12-09"}, ctx.brewer, today: late)
      end

      brew = named(batch, "Brew day")

      assert {:ok, _} =
               Steps.complete(
                 brew.id,
                 %{"done_on" => "2026-12-09", "answer" => "move_all", "batch_number" => "44"},
                 ctx.brewer,
                 today: late
               )

      assert {:error, {:pre_brew_done, "Order yeast"}} = Steps.uncomplete(brew.id)
      assert named(batch, "Brew day").done_on == late

      for name <- ["Order yeast", "Prepare grain"],
          do: assert({:ok, _} = Steps.uncomplete(named(batch, name).id))

      assert {:ok, _} = Steps.uncomplete(brew.id)
      assert %{due_on: @brew, done_on: nil} = named(batch, "Brew day")
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

  describe "Change template keeps a finished pre-brew step (decision 12)" do
    defp done_on_day!(ctx, step),
      do: {:ok, _} = Steps.complete(step.id, %{}, ctx.brewer, today: step.due_on)

    test "the new template's step of its type: it takes its place, entry and links", ctx do
      batch = plan(ctx)
      done_on_day!(ctx, named(batch, "Prepare grain"))
      linked = linked_template()

      {:ok, _} = BatchChanges.change_template(reload(batch), linked.id)

      assert [grain] = Enum.filter(steps_of(batch), &(Steps.name(&1) == "Prepare grain"))
      assert %{due_on: ~D[2026-12-01], done_on: ~D[2026-12-01], added: false} = grain
      assert grain.template_step_id == entry(linked, "Prepare grain").id
      assert {"Prepare grain", "Brew day", "move_all"} in links(batch)
      # Order yeast wasn't done: rebuilt, and the new template has none.
      refute named(batch, "Order yeast")
    end

    test "no step of its type: an added step with no links", ctx do
      batch = plan(ctx)
      done_on_day!(ctx, named(batch, "Prepare grain"))

      {:ok, _} = BatchChanges.change_template(reload(batch), ale_template!("Plain").id)

      grain = named(batch, "Prepare grain")
      assert %{done_on: ~D[2026-12-01], added: true, template_step_id: nil} = grain
      refute Enum.any?(links(batch), fn {from, to, _} -> "Prepare grain" in [from, to] end)
    end

    test "two finished of one type against one entry: the earliest takes it", ctx do
      batch = plan(ctx)
      grain = named(batch, "Prepare grain")

      {:ok, %{step_ids: [extra]}} =
        BatchChanges.add_step(batch, %{"step_type_id" => ctx.grain.id, "due_on" => "2026-11-29"})

      done_on_day!(ctx, Repo.get!(RockcutApi.Production.Step, extra))
      done_on_day!(ctx, grain)
      linked = linked_template()

      {:ok, _} = BatchChanges.change_template(reload(batch), linked.id)

      assert [first, second] =
               Enum.filter(steps_of(batch), &(Steps.name(&1) == "Prepare grain"))

      assert %{id: ^extra, due_on: ~D[2026-11-29], added: false} = first
      assert first.template_step_id == entry(linked, "Prepare grain").id
      assert %{due_on: ~D[2026-12-01], added: true, template_step_id: nil} = second
      assert second.done_on == ~D[2026-12-01]

      assert Enum.filter(links(batch), fn {from, _, _} -> from == "Prepare grain" end) == [
               {"Prepare grain", "Brew day", "move_all"}
             ]
    end

    test "Undo puts the whole change back", ctx do
      batch = plan(ctx)
      done_on_day!(ctx, named(batch, "Prepare grain"))
      before = {layout(batch), links(batch), Enum.map(steps_of(batch), &{&1.done_on, &1.added})}

      {:ok, {_, token}} =
        Undo.track(ctx.brewer, %{batches: [batch.id]}, fn ->
          BatchChanges.change_template(reload(batch), linked_template().id)
        end)

      assert {:ok, _} = Undo.undo(ctx.brewer, token)

      assert {layout(batch), links(batch), Enum.map(steps_of(batch), &{&1.done_on, &1.added})} ==
               before
    end
  end

  describe "only plain and custom steps before brew day, on batches too (decision 13)" do
    test "a move of another type, alone or several, is refused; the preview too", ctx do
      batch = plan(ctx)
      set_temp = named(batch, "Set temp - 58°")

      assert {:error, {:not_before_brew, "Set temp"}} =
               Steps.move([set_temp.id], -11, preview: true)

      assert {:error, {:not_before_brew, "Set temp"}} =
               Steps.move([set_temp.id], -11, answer: "move_only")

      fdh = named(batch, "FDH")

      assert {:error, {:not_before_brew, "Set temp"}} =
               Steps.move([fdh.id, set_temp.id], -11, answer: "move_only")

      # A plain step may go there (it's now a pre-brew step); so may a custom one.
      assert {:ok, _} = Steps.move([fdh.id], -9, answer: "move_only")

      {:ok, %{step_ids: [custom]}} =
        BatchChanges.add_step(batch, %{"name" => "Check the mill", "due_on" => "2026-12-05"})

      assert {:ok, _} = Steps.move([custom], -4)
    end

    test "Move all carrying a follower before brew day: only Move only works", ctx do
      batch = plan(ctx)
      fdh = named(batch, "FDH")

      assert {:ok, {:preview, pre}} = Steps.move([fdh.id], -12, preview: true)

      assert pre.refused == %{
               "move_all" => %{
                 error: "not_before_brew",
                 message: "A Set temp can't be before brew day."
               },
               "move_only" => nil
             }

      assert {:error, {:not_before_brew, "Set temp"}} =
               Steps.move([fdh.id], -12, answer: "move_all")

      assert {:ok, _} = Steps.move([fdh.id], -12, answer: "move_only")
    end

    test "brew day moved past one with Move only is refused; Move all works", ctx do
      batch = plan(ctx)
      brew = named(batch, "Brew day")

      assert {:ok, {:preview, %{refused: refused}}} = Steps.move([brew.id], 11, preview: true)
      assert refused["move_only"].error == "not_before_brew"
      assert refused["move_all"] == nil

      assert {:error, {:not_before_brew, "Set temp"}} =
               Steps.move([brew.id], 11, answer: "move_only")

      assert {:ok, _} = Steps.move([brew.id], 11, answer: "move_all")
    end

    test "a phase marker counts as not plain", ctx do
      batch = plan(ctx)
      lag = Repo.get_by!(Phase, name: "Lag")

      marker =
        Repo.insert!(%RockcutApi.Production.Step{
          batch_id: batch.id,
          phase_id: lag.id,
          due_on: ~D[2026-12-05]
        })

      assert {:error, {:not_before_brew, "phase marker"}} = Steps.move([marker.id], -4)
    end

    test "an off-plan check-off before brew day; the preview too", ctx do
      batch = plan(ctx)
      set_temp = named(batch, "Set temp - 58°")
      attrs = %{"done_on" => "2026-12-01", "answer" => "move_only"}

      # Decision 26 first: not before brew day is done.
      assert {:error, {:brew_first, "Set temp - 58°"}} =
               Steps.complete(set_temp.id, attrs, ctx.brewer, today: ~D[2026-12-10])

      brew = named(batch, "Brew day")
      {:ok, _} = Steps.complete(brew.id, %{"batch_number" => "40"}, ctx.brewer, today: @brew)

      for preview <- [true, false] do
        assert {:error, {:not_before_brew, "Set temp"}} =
                 Steps.complete(
                   set_temp.id,
                   %{"done_on" => "2026-12-01", "answer" => "move_only"},
                   ctx.brewer,
                   preview: preview,
                   today: ~D[2026-12-10]
                 )
      end
    end

    test "a split part's step counts against its parent's brew day", ctx do
      batch = plan(ctx)

      {:ok, %{part_ids: [_, p2]}} =
        Splits.split(reload(batch), %{
          "due_on" => "2026-12-13",
          "parts" => [
            %{"stays" => true, "volume_bbl" => "12"},
            %{"tank_id" => tank!("FV6").id, "volume_bbl" => "8"}
          ]
        })

      package = named(%{id: p2}, "Package")

      assert {:error, {:not_before_brew, "Package"}} =
               Steps.move([package.id], -25, answer: "move_only")
    end

    test "Add step: plain and custom before brew day (first tank, no phase); others refused",
         ctx do
      batch = plan(ctx)
      lag = Repo.get_by!(Phase, name: "Lag")
      {:ok, mill} = Production.create_step_type(%{"name" => "Mill", "starts_phase_id" => lag.id})

      {:ok, %{step_ids: [id]}} =
        BatchChanges.add_step(batch, %{"step_type_id" => mill.id, "due_on" => "2026-11-30"})

      assert %{vessel_index: 0, phase_id: nil, added: true} =
               Repo.get!(RockcutApi.Production.Step, id)

      assert {:ok, _} =
               BatchChanges.add_step(batch, %{
                 "name" => "Clean the mill",
                 "due_on" => "2026-11-30"
               })

      assert {:error, {:not_before_brew, "Package"}} =
               BatchChanges.add_step(batch, %{
                 "step_type_id" => type!("Package").id,
                 "due_on" => "2026-11-30"
               })
    end
  end
end
