defmodule RockcutApi.Production.TestResultsTest do
  @moduledoc """
  D56 §3.2 (decisions 3–5, 8, 10; was D57): test results and retests.
  `has_result` types, `retest_days`, Pass / Fail at check-off, a retest that
  takes the test's links with one move prompt, Continue as planned, Undo,
  Mark not done, a changed result, the "3 failed" flag and a pre-brew test.
  """
  use RockcutApi.DataCase

  import RockcutApi.AccountsFixtures
  import RockcutApi.ProductionFixtures

  alias RockcutApi.Production

  alias RockcutApi.Production.{
    Batches,
    Schedule,
    Signoffs,
    Step,
    StepType,
    Steps,
    TemplateStep,
    Undo
  }

  alias RockcutApi.Tasks.Task

  # Brew Wed Dec 2: FDH Dec 9, Diacetyl test Dec 14, Set temp 34° Dec 16
  # (follows the test, "move all"), Package Dec 22 (follows the Set temp).
  @brew ~D[2026-12-02]
  @test_day ~D[2026-12-14]

  setup do
    {:ok, t} = Production.create_template(%{"name" => "Lager D-test"})
    [brew] = t.steps
    t = add!(t, "FDH", 7, after: brew)
    t = add!(t, "Diacetyl test", 12, after: entry(t, "FDH"))
    t = add!(t, "Set temp", 14, after: entry(t, "Diacetyl test"), temperature: 34)
    t = add!(t, "Package", 20, after: entry(t, "Set temp - 34°"))
    [] = t.issues

    %{template: t, fv3: tank!("FV3"), brewer: user_with_role("employee", "brewery")}
  end

  # A scheduled batch with brew day checked off on its day.
  defp brewed(ctx, extra \\ %{}) do
    batch =
      plan!(
        brand!("Galactic"),
        ctx.template,
        @brew,
        Map.merge(%{"tank_ids" => [ctx.fv3.id]}, extra)
      )

    brew = named(batch, "Brew day")

    {:ok, _} =
      Steps.complete(brew.id, %{"batch_number" => "40"}, ctx.brewer, today: @brew)

    batch
  end

  defp step(s), do: Repo.get!(Step, s.id) |> Repo.preload(:step_type)
  defp due(batch, name), do: named(batch, name).due_on

  # Checked off as `ctx.brewer` through `Undo.track`, as the controller does.
  defp complete(ctx, s, attrs, today \\ @test_day) do
    Undo.track(ctx.brewer, Undo.step_scope([s.id]), fn ->
      Steps.complete(s.id, attrs, ctx.brewer, today: today)
    end)
  end

  defp fail_retest(ctx, s, extra \\ %{}, today \\ @test_day),
    do:
      complete(
        ctx,
        s,
        Map.merge(
          %{"result" => "fail", "fail_action" => "retest", "answer" => "move_all"},
          extra
        ),
        today
      )

  defp retest_of(s), do: Repo.get_by(Step, retest_of_id: s.id)

  # D56 decision 26 and its mirror: a test is done after brew day, and brew
  # day stays done while it is. A planned batch with a done test is data
  # from before them (DEV), written here: brewed on its day, the Fail, then
  # brew day not done and the batch planned again. The layout before
  # anything was done.
  defp failed_then_unbrewed(ctx) do
    batch = brewed(ctx)
    before = layout(batch)
    {:ok, {%{retest_id: rid}, _}} = fail_retest(ctx, named(batch, "Diacetyl test"))
    unbrew!(batch)
    {batch, before, rid}
  end

  defp unbrew!(batch) do
    brew = named(batch, "Brew day")

    Repo.update_all(from(s in Step, where: s.id == ^brew.id),
      set: [done_on: nil, done_by_id: nil, completed_at: nil, checkoff_move: nil]
    )

    Repo.update_all(from(b in RockcutApi.Brewing.Batch, where: b.id == ^batch.id),
      set: [status: "planned", batch_number: nil]
    )
  end

  describe "types and templates (decisions 3, 5)" do
    test "the migration switches on Diacetyl test and Gravity check only" do
      on = Repo.all(from(t in StepType, where: t.has_result, select: t.name))
      assert Enum.sort(on) == ["Diacetyl test", "Gravity check"]
    end

    test "has_result is editable on any type, built in too" do
      {:ok, set_temp} = Production.update_step_type(type!("Set temp"), %{"has_result" => true})
      assert set_temp.has_result and set_temp.behavior == "set_temp"
      {:ok, rouse} = Production.update_step_type(type!("Rouse"), %{"has_result" => true})
      assert rouse.has_result
    end

    test "retest_days 1–30 on a template step, copied into a batch", ctx do
      dt = entry(ctx.template, "Diacetyl test")
      assert dt.retest_days == 2

      {:ok, t} = Production.update_step(ctx.template, dt, %{"retest_days" => 3})
      assert entry(t, "Diacetyl test").retest_days == 3

      for bad <- [0, 31] do
        assert {:error, %Ecto.Changeset{errors: [retest_days: _]}} =
                 Production.update_step(ctx.template, dt, %{"retest_days" => bad})
      end

      batch = plan!(brand!("Galactic"), t, @brew, %{"tank_ids" => [ctx.fv3.id]})
      assert named(batch, "Diacetyl test").retest_days == 3
      assert named(batch, "FDH").retest_days == 2
      assert TemplateStep.retest_days() == 1..30
    end
  end

  describe "check-off (§3.2)" do
    test "a has-result step needs a result; the preview says so", ctx do
      batch = brewed(ctx)
      dt = named(batch, "Diacetyl test")

      assert {:ok,
              {:preview,
               %{
                 needs_result: true,
                 retest_days: 2,
                 retest_allowed: true,
                 retest_on: nil,
                 move: nil
               }}} = Steps.complete(dt.id, %{}, ctx.brewer, preview: true, today: @test_day)

      assert {:error, :result_required} = complete(ctx, dt, %{})
      assert {:error, :result_invalid} = complete(ctx, dt, %{"result" => "maybe"})
      assert {:error, :fail_action_required} = complete(ctx, dt, %{"result" => "fail"})

      assert {:error, :fail_action_invalid} =
               complete(ctx, dt, %{"result" => "fail", "fail_action" => "later"})

      for bad <- [0, 31, "x"] do
        assert {:error, :retest_days_invalid} = fail_retest(ctx, dt, %{"retest_days" => bad})
      end

      assert step(dt).done_on == nil

      # A step without a result: no question, and a result sent is ignored.
      fdh = named(batch, "FDH")

      assert {:ok, {:preview, %{needs_result: false, retest_days: nil, retest_allowed: false}}} =
               Steps.complete(fdh.id, %{}, ctx.brewer, preview: true, today: fdh.due_on)

      assert {:ok, _} = complete(ctx, fdh, %{"result" => "fail"}, fdh.due_on)
      assert step(fdh).result == nil
    end

    test "Pass: done as today, with its result", ctx do
      batch = brewed(ctx)
      dt = named(batch, "Diacetyl test")
      assert {:ok, {%{retest_id: nil}, _}} = complete(ctx, dt, %{"result" => "pass"})
      assert %{result: "pass", done_on: @test_day} = step(dt)
      assert due(batch, "Set temp - 34°") == ~D[2026-12-16]
    end

    test "S9 Fail → Continue as planned: done with Fail, nothing else changes", ctx do
      batch = brewed(ctx)
      before = layout(batch)
      dt = named(batch, "Diacetyl test")

      assert {:ok, _} = complete(ctx, dt, %{"result" => "fail", "fail_action" => "continue"})
      assert %{result: "fail", done_on: @test_day} = step(dt)
      assert retest_of(dt) == nil
      assert layout(batch) == before
    end

    test "S8 Fail → Retest in 2 days → Move all", ctx do
      batch = brewed(ctx)
      dt = named(batch, "Diacetyl test")

      # The preview: one move prompt, the steps after the test by 2 days.
      assert {:ok, {:preview, p}} =
               Steps.complete(
                 dt.id,
                 %{"result" => "fail", "fail_action" => "retest"},
                 ctx.brewer,
                 preview: true,
                 today: @test_day
               )

      assert p.retest_on == ~D[2026-12-16]
      assert p.move.days == 2
      assert [%{id: id, new_due_on: @test_day}] = p.move.moved
      assert id == dt.id

      assert Enum.map(p.move.following, &{&1.name, &1.new_due_on}) == [
               {"Set temp - 34°", ~D[2026-12-18]},
               {"Package", ~D[2026-12-24]},
               {"CIP & Sanitize", ~D[2026-12-24]}
             ]

      # No answer with steps following: the prompt.
      assert {:error, {:answer_required, %{following: [_ | _]}}} =
               complete(ctx, dt, %{"result" => "fail", "fail_action" => "retest"})

      assert {:ok, {%{retest_id: retest_id}, token}} = fail_retest(ctx, dt)
      assert token

      assert %{result: "fail", done_on: @test_day, due_on: @test_day} = step(dt)
      retest = step(%{id: retest_id})

      assert %{
               retest_of_id: retest_of_id,
               due_on: ~D[2026-12-16],
               added: true,
               detail: "retest",
               retest_days: 2,
               done_on: nil,
               result: nil
             } = retest

      assert retest_of_id == dt.id
      assert Steps.name(retest) == "Diacetyl test - retest"
      assert retest.vessel_index == dt.vessel_index and retest.phase_id == dt.phase_id

      # The Set temp now follows the retest, and moved 2 days with Package.
      assert {"Diacetyl test - retest", "Set temp - 34°", "move_all"} in links(batch)
      refute Enum.any?(links(batch), &match?({"Diacetyl test", "Set temp - 34°", _}, &1))
      assert {"FDH", "Diacetyl test", "move_all"} in links(batch)
      assert due(batch, "Set temp - 34°") == ~D[2026-12-18]
      assert due(batch, "Package") == ~D[2026-12-24]

      # Its Brewery task, like any added step's.
      assert %Task{title: title, due_on: ~D[2026-12-16]} =
               Repo.get_by(Task, production_step_id: retest.id)

      assert title =~ "Diacetyl test - retest"
    end

    test "a late check-off and the retest are one shift, from the planned day", ctx do
      batch = brewed(ctx)
      dt = named(batch, "Diacetyl test")
      late = ~D[2026-12-15]

      {:ok, {:preview, p}} =
        Steps.complete(
          dt.id,
          %{"result" => "fail", "fail_action" => "retest", "retest_days" => 3, "done_on" => late},
          ctx.brewer,
          preview: true,
          today: late
        )

      # Dec 14 → retest Dec 18: 4 days for the steps after it; the test to Dec 15.
      assert p.retest_on == ~D[2026-12-18] and p.move.days == 4
      assert [%{new_due_on: ^late}] = p.move.moved

      {:ok, {%{retest_id: id}, _}} =
        fail_retest(ctx, dt, %{"retest_days" => 3, "done_on" => late}, late)

      assert %{due_on: ^late, done_on: ^late} = step(dt)
      assert step(%{id: id}).due_on == ~D[2026-12-18]
      assert due(batch, "Set temp - 34°") == ~D[2026-12-20]
    end

    test "Move only: the steps stay and run backwards from the retest", ctx do
      batch = brewed(ctx)
      dt = named(batch, "Diacetyl test")

      {:ok, {:preview, p}} =
        Steps.complete(
          dt.id,
          %{"result" => "fail", "fail_action" => "retest", "retest_days" => 5},
          ctx.brewer,
          preview: true,
          today: @test_day
        )

      assert [%{to_name: "Set temp - 34°"}] = p.move.out_of_order["move_only"]
      assert p.move.out_of_order["move_all"] == []

      {:ok, {result, _}} =
        fail_retest(ctx, dt, %{"retest_days" => 5, "answer" => "move_only"})

      assert due(batch, "Set temp - 34°") == ~D[2026-12-16]

      assert [%{from_name: "Diacetyl test - retest", to_name: "Set temp - 34°"}] =
               result.out_of_order
    end

    test "a retest of a retest is \"retest 2\", and so on", ctx do
      batch = brewed(ctx)
      dt = named(batch, "Diacetyl test")
      {:ok, {%{retest_id: r1}, _}} = fail_retest(ctx, dt)
      r1 = step(%{id: r1})
      {:ok, {%{retest_id: r2}, _}} = fail_retest(ctx, r1, %{}, r1.due_on)
      r2 = step(%{id: r2})
      {:ok, {%{retest_id: r3}, _}} = fail_retest(ctx, r2, %{}, r2.due_on)
      r3 = step(%{id: r3})

      assert Steps.name(r2) == "Diacetyl test - retest 2"
      assert Steps.name(r3) == "Diacetyl test - retest 3"
      assert r3.retest_of_id == r2.id and r2.retest_of_id == r1.id
      assert r3.due_on == ~D[2026-12-20]
      assert {"Diacetyl test - retest 3", "Set temp - 34°", "move_all"} in links(batch)
      assert due(batch, "Set temp - 34°") == ~D[2026-12-22]
    end

    test "a retest is only for a plain step or a Set temp; Continue works for any", ctx do
      {:ok, _} = Production.update_step_type(type!("Package"), %{"has_result" => true})
      batch = brewed(ctx)
      pkg = named(batch, "Package")

      # Decision 15: the preview tells the prompt to offer only Continue.
      assert {:ok, {:preview, %{needs_result: true, retest_allowed: false}}} =
               Steps.complete(pkg.id, %{}, ctx.brewer, preview: true, today: pkg.due_on)

      assert {:error, :retest_not_here} = fail_retest(ctx, pkg, %{}, pkg.due_on)

      assert {:ok, _} =
               complete(ctx, pkg, %{"result" => "fail", "fail_action" => "continue"}, pkg.due_on)

      assert step(pkg).result == "fail"
    end

    test "a has-result step on a pencilled batch still gets schedule_first", ctx do
      batch =
        plan!(brand!("Galactic"), ctx.template, @brew, %{
          "tank_ids" => [ctx.fv3.id],
          "pencilled" => true
        })

      dt = named(batch, "Diacetyl test")
      assert {:error, :schedule_first} = fail_retest(ctx, dt)
      assert {:error, :schedule_first} = complete(ctx, dt, %{})
    end
  end

  describe "Undo and Mark not done (decision 8)" do
    test "S10 Undo of Fail → Retest removes the retest, puts the links and steps back", ctx do
      batch = brewed(ctx)
      before = {layout(batch), links(batch)}
      dt = named(batch, "Diacetyl test")
      {:ok, {%{retest_id: retest_id}, token}} = fail_retest(ctx, dt)
      assert Repo.get_by(Task, production_step_id: retest_id)

      assert {:ok, _} = Undo.undo(ctx.brewer, token)

      assert Repo.get(Step, retest_id) == nil
      assert Repo.get_by(Task, production_step_id: retest_id) == nil
      assert {layout(batch), links(batch)} == before
      assert %{done_on: nil, result: nil} = step(dt)
    end

    test "Mark not done removes the retest the same way", ctx do
      batch = brewed(ctx)
      before = {layout(batch), links(batch)}
      dt = named(batch, "Diacetyl test")

      {:ok, {%{retest_id: retest_id}, _}} =
        fail_retest(ctx, dt, %{"done_on" => "2026-12-15"}, ~D[2026-12-15])

      assert {:ok, _} = Steps.uncomplete(dt.id)
      assert Repo.get(Step, retest_id) == nil
      assert {layout(batch), links(batch)} == before
      assert %{done_on: nil, result: nil, due_on: @test_day} = step(dt)
    end

    # D56 decision 20 (DEV gap 4): Fail → Retest → the retest dragged a day
    # later with Move all, so the following steps are +3, not where the Fail
    # put them.
    defp fail_then_drag(ctx) do
      batch = brewed(ctx)
      before = layout(batch)
      dt = named(batch, "Diacetyl test")
      {:ok, {%{retest_id: rid}, _}} = fail_retest(ctx, dt)
      {:ok, _} = Steps.move([rid], 1, answer: "move_all")
      assert due(batch, "Set temp - 34°") == ~D[2026-12-19]
      assert due(batch, "Package") == ~D[2026-12-25]
      {batch, before, dt, rid}
    end

    test "decision 20: Mark not done after the retest was moved: every following step back to its date before the Fail",
         ctx do
      {batch, before, dt, rid} = fail_then_drag(ctx)
      assert {:ok, _} = Steps.uncomplete(dt.id)
      assert Repo.get(Step, rid) == nil
      assert layout(batch) == before
      assert %{done_on: nil, result: nil, checkoff_move: nil} = step(dt)
    end

    test "decision 20: Fail → Pass after the retest was moved: the same", ctx do
      {batch, before, dt, rid} = fail_then_drag(ctx)
      assert {:ok, _} = Steps.change_result(dt.id, %{"result" => "pass"})
      assert Repo.get(Step, rid) == nil
      assert layout(batch) == before
      assert %{result: "pass", done_on: @test_day} = step(dt)
    end

    test "decision 20: a following step done since stays on its day; the others go back", ctx do
      {batch, before, dt, _rid} = fail_then_drag(ctx)
      set_temp = named(batch, "Set temp - 34°")
      # Set temp ticked on the day the drag left it (Dec 19).
      {:ok, _} =
        Steps.complete(
          set_temp.id,
          %{"done_on" => "2026-12-19", "answer" => "move_only"},
          ctx.brewer,
          today: ~D[2026-12-19]
        )

      assert {:ok, _} = Steps.uncomplete(dt.id)
      assert %{due_on: ~D[2026-12-19], done_on: ~D[2026-12-19]} = step(set_temp)

      assert Enum.reject(layout(batch), &(elem(&1, 0) == "Set temp - 34°")) ==
               Enum.reject(before, &(elem(&1, 0) == "Set temp - 34°"))
    end

    test "D49 QA 1 unchanged: an off-plan check-off without a retest still leaves steps moved since",
         ctx do
      batch = brewed(ctx)
      fdh = named(batch, "FDH")
      # FDH done 2 days late, Move all: the steps after it +2; then Set temp moved 1 more.
      {:ok, _} =
        Steps.complete(fdh.id, %{"done_on" => "2026-12-11", "answer" => "move_all"}, ctx.brewer,
          today: ~D[2026-12-11]
        )

      {:ok, _} = Steps.move([named(batch, "Set temp - 34°").id], 1, answer: "move_only")
      assert {:ok, _} = Steps.uncomplete(fdh.id)
      assert due(batch, "FDH") == ~D[2026-12-09]
      assert due(batch, "Diacetyl test") == ~D[2026-12-14]
      assert due(batch, "Set temp - 34°") == ~D[2026-12-19]
    end

    # D56 decision 20 clarified (DEV gap 8): a planned batch (its done steps
    # move with a whole-batch drag), the test failed on its day with a
    # retest, then the batch bar dragged 10 days later.
    defp fail_then_shift(ctx) do
      {batch, before, rid} = failed_then_unbrewed(ctx)
      dt = named(batch, "Diacetyl test")
      assert due(batch, "Set temp - 34°") == ~D[2026-12-18]
      {:ok, _} = Batches.shift(reload(batch), 10)
      assert %{due_on: ~D[2026-12-24], done_on: @test_day} = step(dt)
      {batch, shifted(before, 10), dt, rid}
    end

    defp shifted(layout, days),
      do: Enum.map(layout, fn {n, d, v} -> {n, Date.add(d, days), v} end)

    test "gap 8: Mark not done after the whole batch moved: the steps back to their distance from the test",
         ctx do
      {batch, expected, dt, rid} = fail_then_shift(ctx)
      assert {:ok, _} = Steps.uncomplete(dt.id)
      assert Repo.get(Step, rid) == nil
      assert layout(batch) == expected
      assert %{due_on: ~D[2026-12-24], done_on: nil, checkoff_move: nil} = step(dt)
    end

    test "gap 8: Fail → Pass after the whole batch moved: the same, the test where it is", ctx do
      {batch, expected, dt, rid} = fail_then_shift(ctx)
      assert {:ok, _} = Steps.change_result(dt.id, %{"result" => "pass"})
      assert Repo.get(Step, rid) == nil
      assert layout(batch) == expected
      assert %{due_on: ~D[2026-12-24], result: "pass", checkoff_move: nil} = step(dt)
    end

    # Brew day's Move all stops at the done test (the steps after it stay),
    # so they go back to their dates before the Fail, their distance from it.
    test "gap 8: brew day moved with Move all in the date box since the Fail", ctx do
      {batch, before, rid} = failed_then_unbrewed(ctx)
      dt = named(batch, "Diacetyl test")
      {:ok, _} = Steps.move([named(batch, "Brew day").id], 10, answer: "move_all")
      assert %{due_on: @test_day} = step(dt)
      assert due(batch, "Set temp - 34°") == ~D[2026-12-18]

      assert {:ok, _} = Steps.uncomplete(dt.id)
      assert Repo.get(Step, rid) == nil

      assert Enum.sort(layout(batch)) ==
               Enum.sort(
                 Enum.map(before, fn
                   {n, d, v} when n in ["Brew day", "FDH"] -> {n, Date.add(d, 10), v}
                   other -> other
                 end)
               )
    end

    test "gap 8: a restore that would put a Set temp before brew day is refused, nothing changed",
         ctx do
      {batch, _before, rid} = failed_then_unbrewed(ctx)
      dt = named(batch, "Diacetyl test")
      brew = named(batch, "Brew day")

      # Decision 23 refuses moving brew day past the done test now...
      assert {:error, {:after_done_step, "Diacetyl test", @test_day}} =
               Steps.move([brew.id], 15, answer: "move_only")

      # ... so brew day on Dec 17 is data from before it (DEV): Set temp
      # (Dec 18 after the Fail) is still after it.
      Repo.update_all(from(s in Step, where: s.id == ^brew.id), set: [due_on: ~D[2026-12-17]])
      held = layout(batch)

      refused = {:not_before_brew, "Set temp"}
      assert {:error, ^refused} = Steps.uncomplete(dt.id)
      assert {:error, ^refused} = Steps.change_result(dt.id, %{"result" => "pass"})
      assert layout(batch) == held
      assert %{done_on: @test_day, result: "fail"} = step(dt)
      assert Repo.get(Step, rid)

      assert Steps.refusal(refused) == %{
               error: "not_before_brew",
               message: "A Set temp can't be before brew day."
             }
    end

    # QA's gap 7, on this template: Fail → retest dragged +1 (Move all), Set
    # temp checked off on its pre-Fail day (Move only), the test marked not
    # done (or changed to Pass), then Set temp marked not done.
    defp done_follower_then(ctx, undo_test) do
      {batch, before, dt, _rid} = fail_then_drag(ctx)
      set_temp = named(batch, "Set temp - 34°")

      {:ok, _} =
        Steps.complete(
          set_temp.id,
          %{"done_on" => "2026-12-16", "answer" => "move_only"},
          ctx.brewer,
          today: ~D[2026-12-16]
        )

      assert step(set_temp).checkoff_move
      assert {:ok, _} = undo_test.(dt.id)
      assert %{done_on: ~D[2026-12-16], checkoff_move: nil} = step(set_temp)
      assert {:ok, _} = Steps.uncomplete(set_temp.id)
      assert due(batch, "Set temp - 34°") == ~D[2026-12-16]
      assert layout(batch) == before
    end

    test "gap 7: a step done while the retest had moved it: Mark not done of the test puts its planned day back too",
         ctx do
      done_follower_then(ctx, &Steps.uncomplete/1)
    end

    test "gap 7: the same through Fail → Pass", ctx do
      done_follower_then(ctx, &Steps.change_result(&1, %{"result" => "pass"}))
    end

    test "a done retest blocks Mark not done and Undo-free Fail → Pass (retest_done)", ctx do
      batch = brewed(ctx)
      dt = named(batch, "Diacetyl test")
      {:ok, {%{retest_id: id}, _}} = fail_retest(ctx, dt)
      retest = step(%{id: id})
      {:ok, _} = complete(ctx, retest, %{"result" => "pass"}, retest.due_on)

      assert {:error, :retest_done} = Steps.uncomplete(dt.id)
      assert {:error, :retest_done} = Steps.change_result(dt.id, %{"result" => "pass"})
      assert step(dt).done_on == @test_day

      # Once the retest is open again, it goes.
      {:ok, _} = Steps.uncomplete(retest.id)
      assert {:ok, _} = Steps.uncomplete(dt.id)
      assert Repo.get(Step, id) == nil
    end

    test "Mark not done of a Pass clears the result", ctx do
      batch = brewed(ctx)
      dt = named(batch, "Diacetyl test")
      {:ok, _} = complete(ctx, dt, %{"result" => "pass"})
      {:ok, _} = Steps.uncomplete(dt.id)
      assert %{done_on: nil, result: nil} = step(dt)
    end
  end

  # D56 decision 23 (DEV gaps 10, 11): brew day can't move on or after a
  # finished step that comes after it. A planned batch, the test failed on
  # its day (Mon Dec 14) with a retest.
  describe "brew day not on or after a finished step after it (decision 23)" do
    defp planned_fail(ctx) do
      {batch, _before, rid} = failed_then_unbrewed(ctx)
      {batch, named(batch, "Brew day"), rid}
    end

    @after_test {:after_done_step, "Diacetyl test", @test_day}

    test "the message" do
      assert Steps.refusal(@after_test) == %{
               error: "after_done_step",
               message: "Diacetyl test was done Mon Dec 14; brew day can't be after it."
             }
    end

    test "gap 11, QA's path: the date box onto or past the done test is refused under both answers and in the preview; nothing moves",
         ctx do
      {batch, brew, rid} = planned_fail(ctx)
      before = layout(batch)

      assert {:error, @after_test} = Steps.move([brew.id], 12, preview: true)

      for answer <- ~w(move_all move_only) do
        assert {:error, @after_test} = Steps.move([brew.id], 12, answer: answer)
        assert {:error, @after_test} = Steps.move([brew.id], 14, answer: answer)
      end

      assert layout(batch) == before
      assert step(%{id: rid}).due_on == ~D[2026-12-16]
      # Short of it is fine.
      assert {:ok, _} = Steps.move([brew.id], 11, answer: "move_all")
      assert due(batch, "Brew day") == ~D[2026-12-13]
    end

    test "gap 10: the date box asks the move question when unfinished steps follow brew day",
         ctx do
      {_batch, brew, _rid} = planned_fail(ctx)
      assert {:ok, {:preview, pre}} = Steps.move([brew.id], 3, preview: true)
      assert Enum.map(pre.following, & &1.name) == ["FDH"]
      assert pre.default_answer == "move_all"
      assert {:error, {:answer_required, _}} = Steps.move([brew.id], 3)
    end

    test "a multi-select with brew day in it", ctx do
      {batch, brew, _rid} = planned_fail(ctx)
      ids = [brew.id, named(batch, "FDH").id]
      assert {:error, @after_test} = Steps.move(ids, 12, answer: "move_only")
      assert due(batch, "Brew day") == @brew
    end

    test "brew day checked off on or after it (off-plan) is refused, the preview too; the day before works",
         ctx do
      {batch, brew, _rid} = planned_fail(ctx)

      for done_on <- ["2026-12-14", "2026-12-15"] do
        assert {:error, {:after_done_step, "Diacetyl test", @test_day}} =
                 Steps.complete(brew.id, %{"done_on" => done_on}, ctx.brewer,
                   preview: true,
                   today: ~D[2026-12-15]
                 )

        assert {:error, @after_test} =
                 Steps.complete(
                   brew.id,
                   %{"done_on" => done_on, "answer" => "move_only", "batch_number" => "40"},
                   ctx.brewer,
                   today: ~D[2026-12-15]
                 )
      end

      assert {:ok, _} =
               Steps.complete(
                 brew.id,
                 %{"done_on" => "2026-12-13", "answer" => "move_only", "batch_number" => "40"},
                 ctx.brewer,
                 today: ~D[2026-12-15]
               )

      assert named(batch, "Brew day").done_on == ~D[2026-12-13]
    end

    test "Mark not done of an early brew day whose planned day is now after a done test: refused",
         ctx do
      batch = plan!(brand!("Galactic"), ctx.template, @brew, %{"tank_ids" => [ctx.fv3.id]})
      brew = named(batch, "Brew day")
      # Brew day to Tue Dec 15 alone, then brewed early on Dec 2 (Move only).
      assert {:ok, _} = Steps.move([brew.id], 13, answer: "move_only")

      {:ok, _} =
        Steps.complete(
          brew.id,
          %{"done_on" => "2026-12-02", "answer" => "move_only", "batch_number" => "40"},
          ctx.brewer,
          today: @brew
        )

      {:ok, _} = complete(ctx, named(batch, "Diacetyl test"), %{"result" => "pass"})

      # The mirror of decision 26 refuses it first (the done test is after brew day).
      assert {:error, {:done_after_brew, "Diacetyl test"}} = Steps.uncomplete(brew.id)
      assert named(batch, "Brew day").done_on == @brew
    end

    # D56 decision 27: the bar drag moves the whole plan, the done test's
    # planned day included, so brew day may land on the test's done day.
    test "decision 27: the bar drag takes brew day onto a finished step's done day; the date box can't",
         ctx do
      {batch, brew, _rid} = planned_fail(ctx)
      assert {:error, @after_test} = Steps.move([brew.id], 12, answer: "move_all")
      assert {:ok, {:preview, _}} = Batches.shift(reload(batch), 12, preview: true)
      assert {:ok, _} = Batches.shift(reload(batch), 12)
      assert due(batch, "Brew day") == ~D[2026-12-14]
      assert step(named(batch, "Diacetyl test")).due_on == ~D[2026-12-26]
    end
  end

  describe "changing a recorded result (§3.2)" do
    test "Fail → Pass removes the retest; the steps go where a Pass leaves them", ctx do
      batch = brewed(ctx)
      dt = named(batch, "Diacetyl test")
      # Done a day late: a Pass would have moved the Set temp a day (Dec 17).
      {:ok, {%{retest_id: id}, _}} =
        fail_retest(ctx, dt, %{"done_on" => "2026-12-15"}, ~D[2026-12-15])

      assert due(batch, "Set temp - 34°") == ~D[2026-12-19]

      assert {:ok, {%{retest_id: nil}, token}} =
               Undo.track(ctx.brewer, Undo.step_scope([dt.id]), fn ->
                 Steps.change_result(dt.id, %{"result" => "pass"})
               end)

      assert Repo.get(Step, id) == nil
      assert %{result: "pass", done_on: ~D[2026-12-15]} = step(dt)
      assert due(batch, "Set temp - 34°") == ~D[2026-12-17]
      assert {"Diacetyl test", "Set temp - 34°", "move_all"} in links(batch)

      # Undo brings the Fail and its retest back.
      {:ok, _} = Undo.undo(ctx.brewer, token)
      assert step(dt).result == "fail"
      assert Repo.get(Step, id)
      assert due(batch, "Set temp - 34°") == ~D[2026-12-19]

      # Then Mark not done puts everything where it was planned.
      {:ok, _} = Steps.uncomplete(dt.id)
      assert due(batch, "Set temp - 34°") == ~D[2026-12-16]
      assert step(dt).due_on == @test_day
    end

    test "Pass → Fail asks the Fail question and moves as at check-off", ctx do
      batch = brewed(ctx)
      dt = named(batch, "Diacetyl test")
      {:ok, _} = complete(ctx, dt, %{"result" => "pass"})

      assert {:error, :fail_action_required} = Steps.change_result(dt.id, %{"result" => "fail"})

      assert {:error, {:answer_required, %{days: 2}}} =
               Steps.change_result(dt.id, %{"result" => "fail", "fail_action" => "retest"})

      assert {:ok, {:preview, %{retest_on: ~D[2026-12-16], move: %{days: 2}}}} =
               Steps.change_result(dt.id, %{"result" => "fail", "fail_action" => "retest"},
                 preview: true
               )

      assert {:ok, %{retest_id: id}} =
               Steps.change_result(dt.id, %{
                 "result" => "fail",
                 "fail_action" => "retest",
                 "answer" => "move_all"
               })

      assert step(%{id: id}).due_on == ~D[2026-12-16]
      assert due(batch, "Set temp - 34°") == ~D[2026-12-18]

      # And back: Fail → Pass, then Mark not done restores the plan.
      {:ok, _} = Steps.change_result(dt.id, %{"result" => "pass"})
      assert due(batch, "Set temp - 34°") == ~D[2026-12-16]
      assert step(dt).checkoff_move == nil

      # Fail → Continue as planned is a result only.
      {:ok, _} = Steps.change_result(dt.id, %{"result" => "fail", "fail_action" => "continue"})
      assert step(dt).result == "fail" and retest_of(dt) == nil
    end

    test "only a done step with a result", ctx do
      batch = brewed(ctx)

      assert {:error, :not_done} =
               Steps.change_result(named(batch, "Diacetyl test").id, %{"result" => "pass"})

      fdh = named(batch, "FDH")
      {:ok, _} = complete(ctx, fdh, %{}, fdh.due_on)
      assert {:error, :result_not_here} = Steps.change_result(fdh.id, %{"result" => "pass"})
    end
  end

  describe "S11 the failed_tests flag" do
    defp flags(today \\ @test_day) do
      {:ok, s} = Schedule.load(Date.add(today, -30), Date.add(today, 30), today)
      Enum.filter(s.flags, &(&1.kind == "failed_tests"))
    end

    test "three Fails in a row flag the batch; a sign-off holds until a fourth", ctx do
      batch = brewed(ctx)
      dt = named(batch, "Diacetyl test")
      {:ok, {%{retest_id: r1}, _}} = fail_retest(ctx, dt)
      r1 = step(%{id: r1})
      {:ok, {%{retest_id: r2}, _}} = fail_retest(ctx, r1, %{}, r1.due_on)
      assert flags() == []

      r2 = step(%{id: r2})
      {:ok, {%{retest_id: r3}, _}} = fail_retest(ctx, r2, %{}, r2.due_on)

      key = "failed_tests:#{dt.id}"

      assert [
               %{key: ^key, message: "Galactic #40 · 3 failed Diacetyl tests", muted: false} =
                 flag
             ] = flags()

      assert flag.batch_ids == [batch.id]

      {:ok, _} = Signoffs.sign_off(%{key: key, signature: flag.signature}, ctx.brewer)
      assert [%{signed_off: true}] = flags()

      r3 = step(%{id: r3})
      {:ok, _} = complete(ctx, r3, %{"result" => "fail", "fail_action" => "continue"}, r3.due_on)

      assert [
               %{
                 message: "Galactic #40 · 4 failed Diacetyl tests",
                 signed_off: false,
                 was_signed_off: true
               }
             ] =
               flags()
    end

    test "a Pass ends the run", ctx do
      batch = brewed(ctx)
      dt = named(batch, "Diacetyl test")
      {:ok, {%{retest_id: r1}, _}} = fail_retest(ctx, dt)
      r1 = step(%{id: r1})
      {:ok, {%{retest_id: r2}, _}} = fail_retest(ctx, r1, %{}, r1.due_on)
      r2 = step(%{id: r2})
      {:ok, _} = complete(ctx, r2, %{"result" => "pass"}, r2.due_on)
      assert flags() == []
    end
  end

  describe "a pre-brew test (§3.1 with §3.2)" do
    # D56 decision 25 (DEV gap 14), QA's path: a pre-brew test failed early,
    # its retest, then brew day 8 days earlier with Move only.
    test "its retest isn't pre-brew: it stays on its day when brew day moves", ctx do
      {:ok, check} =
        Production.create_step_type(%{"name" => "Water check", "has_result" => true})

      {:ok, t} = Production.create_template(%{"name" => "With water check"})
      [brew] = t.steps
      t = add!(t, "Water check", -4, [])
      t = add!(t, "FDH", 7, after: brew)
      t = add!(t, "Package", 20, after: entry(t, "FDH"))
      [] = t.issues

      batch = plan!(brand!("Galactic"), t, @brew, %{"tank_ids" => [ctx.fv3.id]})
      water = named(batch, "Water check")
      assert %{step_type_id: id, due_on: ~D[2026-11-28], pre_brew: true} = water
      assert id == check.id

      # Done early (Nov 20) on the planned batch, failed, retest in 2 days.
      {:ok, {%{retest_id: rid}, _}} =
        fail_retest(ctx, water, %{"done_on" => "2026-11-20", "retest_days" => 2}, ~D[2026-11-20])

      retest = step(%{id: rid})
      assert %{due_on: ~D[2026-11-22], pre_brew: false} = retest
      assert reload(batch).status == "planned"
      assert Steps.pre_brew(steps_of(batch)) == []

      # Brew day 8 days earlier (Nov 24), Move only: the retest stays.
      brew_step = named(batch, "Brew day")
      assert {:ok, {:preview, pre}} = Steps.move([brew_step.id], -8, preview: true)
      assert pre.pre_brew["move_only"] == []
      assert {:ok, _} = Steps.move([brew_step.id], -8, answer: "move_only")
      assert due(batch, "Brew day") == ~D[2026-11-24]
      assert step(retest).due_on == ~D[2026-11-22]

      # Decision 26 (lead): the retest of a pre-brew test is exempt, though
      # not pre-brew; done, it doesn't hold brew day back (decision 23).
      assert {:ok, _} = complete(ctx, step(retest), %{"result" => "pass"}, ~D[2026-11-22])
      assert %{done_on: ~D[2026-11-22], pre_brew: false} = step(retest)

      assert {:ok, _} =
               Steps.complete(
                 brew_step.id,
                 %{"done_on" => "2026-11-24", "answer" => "move_only", "batch_number" => "40"},
                 ctx.brewer,
                 today: ~D[2026-11-24]
               )

      # The mirror leaves it out too: brew day can be marked not done again.
      assert {:ok, _} = Steps.uncomplete(brew_step.id)
    end
  end
end
