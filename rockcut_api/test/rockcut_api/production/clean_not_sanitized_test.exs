defmodule RockcutApi.Production.CleanNotSanitizedTest do
  @moduledoc """
  D49 task 1: Clean not sanitized (§3.12a, P122–P129): the `cleaned` mark,
  the CIP variants (CIP & Sanitize, CIP - no sani, Sanitize), the one
  cleanliness timeline (`Parts.condition_events/4`), the "Clean no sani"
  status line and the soft "Filling a tank that isn't sanitized" flag.
  """
  use RockcutApi.DataCase

  import RockcutApi.AccountsFixtures
  import RockcutApi.ProductionFixtures

  alias RockcutApi.Production

  alias RockcutApi.Production.{
    Cips,
    ConditionMarks,
    Schedule,
    Signoffs,
    Steps,
    Undo
  }

  @today ~D[2026-10-21]

  setup do
    %{brewer: user_with_role("employee", "brewery")}
  end

  defp schedule do
    {:ok, s} = Schedule.load(Date.add(@today, -30), Date.add(@today, 60), @today)
    s
  end

  defp status(sched, tank), do: Enum.find(sched.statuses, &(&1.tank_id == tank.id))

  defp tank_flags(sched, tank), do: Enum.filter(sched.flags, &(&1.tank_id == tank.id))
  defp kinds(sched, tank), do: tank |> then(&tank_flags(sched, &1)) |> Enum.map(& &1.kind)

  defp mark(tank, state, day, ctx) do
    ConditionMarks.create(tank, %{"state" => state, "marked_on" => day}, ctx.brewer, @today)
  end

  defp cip(tank, day, ctx, method, done \\ false) do
    {:ok, c} =
      Cips.create(
        %{
          "tank_id" => tank.id,
          "due_on" => Date.to_iso8601(day),
          "cip_method" => method,
          "already_done" => done
        },
        ctx.brewer,
        @today
      )

    c
  end

  # A tank sanitized `days` ago by a done standalone CIP & Sanitize.
  defp sanitized_tank!(name, days, ctx) do
    tank = tank!(name)
    cip(tank, Date.add(@today, -days), ctx, nil, true)
    tank
  end

  # A tank a batch left on Oct 10 (packaged; its CIP removed): dirty, with
  # "Dirty, no CIP planned".
  defp emptied_tank!(name) do
    tank = tank!(name)

    old =
      plan!(brand!("Old #{name}"), ale_template!("Old #{name}"), ~D[2026-09-20], %{
        "tank_ids" => [tank.id]
      })

    for s <- steps_of(old),
        s.step_type && Date.compare(s.due_on, ~D[2026-10-10]) != :gt,
        do: done!(s)

    Repo.delete!(Enum.find(steps_of(old), &(Steps.behavior(&1) == "cip")))
    old |> Ecto.Changeset.change(status: "completed", batch_number: "30") |> Repo.update!()
    tank
  end

  defp fill!(tank, brew_on, name),
    do: plan!(brand!(name), ale_template!(name), brew_on, %{"tank_ids" => [tank.id]})

  describe "the Clean not sanitized mark" do
    test "P122: a long-sanitized tank marked clean not sanitized; Undo puts it back", ctx do
      s1 = sanitized_tank!("Serving 1", 40, ctx)
      assert %{state: "sani", line: "Sani 40 days"} = status(schedule(), s1)

      {:ok, {m, token}} =
        Undo.track(
          ctx.brewer,
          %{},
          fn -> mark(s1, "cleaned", @today, ctx) end,
          &%{marks: [&1.id]}
        )

      assert m.state == "cleaned"

      assert %{state: "cleaned", line: "Clean no sani 0 days", alert: false} =
               status(schedule(), s1)

      assert [%{state: "cleaned"}] = Enum.filter(schedule().marks, &(&1.tank_id == s1.id))

      {:ok, _} = Undo.undo(ctx.brewer, token)
      assert status(schedule(), s1).line == "Sani 40 days"
    end

    test "P123: a fill after it is flagged, soft; sign-off; a CIP & Sanitize or a clean mark before it clears it",
         ctx do
      s1 = sanitized_tank!("Serving 1", 40, ctx)
      {:ok, _} = mark(s1, "cleaned", @today, ctx)
      fill!(s1, Date.add(@today, 7), "Oktoberfest")

      sched = schedule()
      assert kinds(sched, s1) == ["unsanitized_fill"]
      [flag] = tank_flags(sched, s1)
      assert flag.message == "Oktoberfest P1 fills Serving 1, which isn't sanitized."

      {:ok, _} =
        Signoffs.sign_off(%{"key" => flag.key, "signature" => flag.signature}, ctx.brewer)

      assert [%{signed_off: true}] = tank_flags(schedule(), s1)

      # A planned CIP & Sanitize before the fill counts; a Sanitize too.
      c = cip(s1, Date.add(@today, 2), ctx, "sanitize_full")
      assert tank_flags(schedule(), s1) == []
      Repo.delete!(c)
      c = cip(s1, Date.add(@today, 2), ctx, "sanitize")
      assert tank_flags(schedule(), s1) == []
      Repo.delete!(c)

      {:ok, _} = mark(s1, "clean", @today, ctx)
      sched = schedule()
      assert tank_flags(sched, s1) == []
      assert status(sched, s1).line == "Sani 0 days"
    end

    test "P124: a dirty tank marked clean not sanitized: the dirty flags clear", ctx do
      fv5 = emptied_tank!("FV5")
      sched = schedule()
      assert status(sched, fv5).line == "Empty · dirty 11 days · no CIP planned"
      assert kinds(sched, fv5) == ["dirty_no_cip"]

      {:ok, _} = mark(fv5, "cleaned", @today, ctx)
      sched = schedule()
      assert status(sched, fv5).line == "Clean no sani 0 days"
      assert kinds(sched, fv5) == []

      # A fill after it: not sanitized, not dirty.
      fill!(fv5, Date.add(@today, 5), "Enos")
      assert kinds(schedule(), fv5) == ["unsanitized_fill"]
    end

    test "latest wins across marks, CIPs and exits", ctx do
      fv3 = tank!("FV3")
      {:ok, _} = mark(fv3, "dirty", ~D[2026-10-15], ctx)
      {:ok, _} = mark(fv3, "cleaned", ~D[2026-10-17], ctx)
      assert status(schedule(), fv3).line == "Clean no sani 4 days"
      cip(fv3, ~D[2026-10-19], ctx, "sanitize_full", true)
      assert status(schedule(), fv3).line == "Sani 2 days"
      {:ok, _} = mark(fv3, "cleaned", ~D[2026-10-20], ctx)
      assert status(schedule(), fv3).line == "Clean no sani 1 day"
    end

    test "the state is checked", ctx do
      assert {:error, %Ecto.Changeset{errors: [state: {msg, _}]}} =
               mark(tank!("FV9"), "shiny", @today, ctx)

      assert msg == "Pick Clean & sanitized, Clean not sanitized or Dirty."
    end
  end

  describe "CIP variants" do
    test "P125: a done CIP - no sani on a dirty tank: Clean no sani; the dirty flags clear",
         ctx do
      s1 = emptied_tank!("Serving 1")
      c = cip(s1, @today, ctx, "no_sani", true)
      assert Steps.name(Repo.preload(c, [:step_type, :phase])) == "CIP - no sani"

      sched = schedule()
      assert status(sched, s1).line == "Clean no sani 0 days"
      assert kinds(sched, s1) == []
      assert [%{cip_method: "no_sani"}] = Enum.filter(sched.cips, &(&1.id == c.id))
    end

    test "a planned CIP - no sani counts as a planned CIP; a Sanitize doesn't", ctx do
      fv5 = emptied_tank!("FV5")
      c = cip(fv5, Date.add(@today, 1), ctx, "sanitize")
      sched = schedule()
      assert status(sched, fv5).line == "Empty · dirty 11 days · no CIP planned"
      assert kinds(sched, fv5) == ["dirty_no_cip"]

      Repo.delete!(c)
      cip(fv5, Date.add(@today, 1), ctx, "no_sani")
      sched = schedule()
      assert status(sched, fv5).line == "Empty · dirty 11 days"
      assert kinds(sched, fv5) == []
    end

    test "P126: a batch's exit CIP switched to CIP - no sani; the next fill isn't sanitized, not dirty",
         ctx do
      fv6 = tank!("FV6")
      first = fill!(fv6, ~D[2026-10-25], "Galactic")
      exit_cip = named(first, "CIP & Sanitize")

      {:ok, switched} = Steps.update(exit_cip, %{"cip_method" => "no_sani"})
      assert switched.cip_method == "no_sani"
      assert named(first, "CIP - no sani")

      fill!(fv6, Date.add(exit_cip.due_on, 1), "Crusher")
      sched = schedule()
      assert kinds(sched, fv6) == ["unsanitized_fill"]

      # Back to CIP & Sanitize: no flag. A done CIP doesn't switch.
      {:ok, _} = Steps.update(named(first, "CIP - no sani"), %{"cip_method" => "sanitize_full"})
      assert kinds(schedule(), fv6) == []
      done = done!(named(first, "CIP & Sanitize"))
      assert {:error, :step_done} = Steps.update(done, %{"cip_method" => "no_sani"})
      assert {:ok, _} = Steps.update(done, %{"cip_method" => "sanitize_full"})

      # Only a CIP has one.
      carb = named(first, "Carb")
      {:ok, carb} = Steps.update(carb, %{"cip_method" => "no_sani"})
      assert is_nil(carb.cip_method)

      assert {:error, %Ecto.Changeset{errors: [cip_method: _]}} =
               Steps.update(cip(fv6, ~D[2026-12-01], ctx, nil), %{"cip_method" => "bleach"})
    end

    test "P127: Sanitize on a Clean no sani tank: Sani 0 days, and a fill after it has no flags",
         ctx do
      s1 = emptied_tank!("Serving 1")
      cip(s1, Date.add(@today, -2), ctx, "no_sani", true)
      assert status(schedule(), s1).line == "Clean no sani 2 days"

      cip(s1, @today, ctx, "sanitize", true)
      fill!(s1, Date.add(@today, 3), "Oktoberfest")
      sched = schedule()
      assert status(sched, s1).line == "Sani 0 days"
      assert kinds(sched, s1) == []
      assert sched.sanitize_on_dirty == []
    end

    test "P128: planned CIP - no sani Mon, Sanitize Tue, a fill Wed: no flags; without the Sanitize, not sanitized",
         ctx do
      fv7 = emptied_tank!("FV7")
      # Mon Oct 26, Tue Oct 27, Wed Oct 28.
      cip(fv7, ~D[2026-10-26], ctx, "no_sani")
      sanitize = cip(fv7, ~D[2026-10-27], ctx, "sanitize")
      fill!(fv7, ~D[2026-10-28], "Enos")
      assert kinds(schedule(), fv7) == []

      Repo.delete!(sanitize)
      assert kinds(schedule(), fv7) == ["unsanitized_fill"]
    end

    test "P129: a Sanitize done on a dirty tank leaves it dirty, and says so", ctx do
      fv5 = emptied_tank!("FV5")
      s = cip(fv5, @today, ctx, "sanitize", true)
      sched = schedule()
      assert status(sched, fv5).line == "Empty · dirty 11 days · no CIP planned"
      assert sched.sanitize_on_dirty == [s.id]
      assert kinds(sched, fv5) == ["dirty_no_cip"]

      # A fill after it is still a dirty fill.
      fill!(fv5, Date.add(@today, 4), "Enos")
      assert "dirty_fill" in kinds(schedule(), fv5)
    end

    test "a standalone CIP's variant is checked", ctx do
      assert {:error, :cip_method_invalid} =
               Cips.create(
                 %{"tank_id" => tank!("FV9").id, "due_on" => "2026-10-22", "cip_method" => "x"},
                 ctx.brewer,
                 @today
               )
    end
  end

  describe "templates" do
    test "a CIP entry's variant is named, checked and copied onto a planned batch", _ctx do
      {:ok, t} = Production.create_template(%{"name" => "No-sani ale"})
      t = add!(t, "Package", 20, after: hd(t.steps))
      cip_type = Repo.get_by!(RockcutApi.Production.StepType, behavior: "cip")

      {:ok, t} =
        Production.add_step(t, %{
          "step_type_id" => cip_type.id,
          "day_offset" => 20,
          "cip_method" => "no_sani",
          "comes_after_id" => entry(t, "Package").id
        })

      e = entry(t, "CIP - no sani")
      assert e.cip_method == "no_sani"

      assert {:error, %Ecto.Changeset{}} =
               Production.update_step(t, e, %{"cip_method" => "bleach"})

      # A new CIP entry is CIP & Sanitize; other entries have none.
      {:ok, t} = Production.update_step(t, e, %{"cip_method" => "sanitize"})
      assert entry(t, "Sanitize")
      assert is_nil(entry(t, "Package").cip_method)

      batch = plan!(brand!("Galactic"), t, ~D[2026-11-02], %{"tank_ids" => [tank!("FV1").id]})
      assert named(batch, "Sanitize").cip_method == "sanitize"
    end
  end
end
