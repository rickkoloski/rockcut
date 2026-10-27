defmodule RockcutApi.Production.TaskLinkTest do
  @moduledoc """
  D49 task 3 (§3.12, plan decisions 5, 6, 12): production steps as Brewery
  board tasks. `want/1` for every kind of step, and `sync!/1` after every
  kind of schedule write (through `Undo.track/4`), a rename, and Undo, in
  the write's own transaction. Plus the cost of a move with ~30 batches.
  """
  use RockcutApi.DataCase

  import Ecto.Query, only: [from: 2]
  import RockcutApi.AccountsFixtures
  import RockcutApi.ProductionFixtures

  alias RockcutApi.{Brewing, Production, Repo}
  alias RockcutApi.Brewing.Batch
  alias RockcutApi.Production.{BatchChanges, Batches, Cips, Splits, Step, Steps, TaskLink, Undo}
  alias RockcutApi.Tasks.Task

  setup do
    brewer = user_with_role("employee", "brewery")
    brewery = Repo.get_by!(RockcutApi.Accounts.Department, key: "brewery")
    %{brewer: brewer, brewery: brewery, template: ale_template!()}
  end

  # A schedule write as the Gantt makes it: through Undo.track.
  defp write(ctx, scope, fun, after_scope \\ fn _ -> %{} end) do
    {:ok, {result, token}} = Undo.track(ctx.brewer, scope, fun, after_scope)
    {result, token}
  end

  defp plan(ctx, brand, brew_on, extra) do
    {{batch, _}, _} =
      write(
        ctx,
        %{},
        fn ->
          Batches.plan(
            Map.merge(
              %{
                "brand_id" => brand.id,
                "template_id" => ctx.template.id,
                "brew_on" => Date.to_iso8601(brew_on),
                "volume_bbl" => "20"
              },
              extra
            )
          )
        end,
        fn {b, _} -> %{batches: [b.id]} end
      )

    batch
  end

  defp batch_write(ctx, batch, fun), do: write(ctx, %{batches: [batch.id]}, fun)

  defp linked,
    do:
      Repo.all(
        from(t in Task,
          where: not is_nil(t.production_step_id),
          order_by: [t.due_on, t.id]
        )
      )

  defp titles, do: Enum.map(linked(), & &1.title)

  defp task_of(step), do: Repo.get_by(Task, production_step_id: step.id)

  describe "want/1" do
    test "every kind of step", ctx do
      fv3 = tank!("FV3")
      batch = plan(ctx, brand!("Galactic"), ~D[2026-11-02], %{"tank_ids" => [fv3.id]})
      fdh = named(batch, "FDH")

      assert %{
               title: "FV3 · Galactic P1 · FDH",
               due_on: ~D[2026-11-09],
               department_id: dept,
               completed_at: nil
             } = TaskLink.want(fdh)

      assert dept == ctx.brewery.id

      assert TaskLink.want(named(batch, "Set temp - 58°")).title ==
               "FV3 · Galactic P1 · Set temp - 58°"

      # Unassigned.
      {:ok, _} = Batches.set_vessel_tank(batch, 0, nil)
      assert TaskLink.want(fdh).title == "No tank · Galactic P1 · FDH"

      # A phase marker never has one, nor a step off the list.
      lag = Repo.get_by!(RockcutApi.Production.Phase, name: "Lag")
      marker = Repo.insert!(%Step{batch_id: batch.id, phase_id: lag.id, due_on: ~D[2026-11-03]})
      assert TaskLink.want(marker) == nil
      assert TaskLink.want(%{fdh | on_task_list: false}) == nil

      # A custom step has its own name.
      custom =
        Repo.insert!(%Step{
          batch_id: batch.id,
          name: "Check the valve",
          due_on: ~D[2026-11-04],
          added: true
        })

      assert TaskLink.want(custom).title == "No tank · Galactic P1 · Check the valve"

      # The batch number once brewed; done carries over.
      batch |> Ecto.Changeset.change(status: "fermenting", batch_number: "33") |> Repo.update!()

      done =
        fdh
        |> Ecto.Changeset.change(done_on: ~D[2026-11-09], done_by_id: ctx.brewer.id)
        |> Repo.update!()

      assert %{
               title: "No tank · Galactic #33 · FDH",
               completed_on: ~D[2026-11-09],
               completed_by_id: by,
               completed_display: "planned_day",
               completed_at: %DateTime{}
             } = TaskLink.want(done)

      assert by == ctx.brewer.id
    end

    test "standalone CIPs (P103, P125) and a pencilled batch (none)", ctx do
      fv6 = tank!("FV6")
      serving = tank!("Serving 1")
      {:ok, cip} = Cips.create(%{"tank_id" => fv6.id, "due_on" => "2026-11-02"}, ctx.brewer)
      assert TaskLink.want(cip).title == "FV6 · CIP & Sanitize"

      {:ok, no_sani} =
        Cips.create(
          %{"tank_id" => serving.id, "due_on" => "2026-11-02", "cip_method" => "no_sani"},
          ctx.brewer
        )

      assert TaskLink.want(no_sani).title == "Serving 1 · CIP - no sani"

      {:ok, sani} =
        Cips.create(
          %{"tank_id" => fv6.id, "due_on" => "2026-11-03", "cip_method" => "sanitize"},
          ctx.brewer
        )

      assert TaskLink.want(sani).title == "FV6 · Sanitize"

      x = plan(ctx, brand!("Oktoberfest"), ~D[2026-11-09], %{"pencilled" => true})
      assert TaskLink.want(named(x, "FDH")) == nil
    end

    test "a split's part", ctx do
      fv2 = tank!("FV2")
      fv6 = tank!("FV6")
      batch = plan(ctx, brand!("Galactic"), ~D[2026-11-02], %{"tank_ids" => [fv2.id]})

      {{:ok, %{part_ids: [_, p2]}}, _} =
        batch_write(ctx, batch, fn ->
          {:ok, r} =
            Splits.split(reload(batch), %{
              "due_on" => "2026-11-13",
              "parts" => [
                %{"stays" => true, "volume_bbl" => "12"},
                %{"tank_id" => fv6.id, "volume_bbl" => "8"}
              ]
            })

          {:ok, {:ok, r}}
        end)

      part = Repo.get!(Batch, p2)
      assert TaskLink.want(named(part, "Carb")).title == "FV6 · Galactic P1.2 · Carb"
    end
  end

  describe "sync!/1 after schedule writes" do
    test "plan (P90): one task per task-list step on its day; a pencilled batch gets none", ctx do
      fv3 = tank!("FV3")
      plan(ctx, brand!("Galactic"), ~D[2026-11-02], %{"tank_ids" => [fv3.id]})

      assert Enum.map(linked(), &{&1.title, &1.due_on}) == [
               {"FV3 · Galactic P1 · Brew day", ~D[2026-11-02]},
               {"FV3 · Galactic P1 · FDH", ~D[2026-11-09]},
               {"FV3 · Galactic P1 · Set temp - 58°", ~D[2026-11-12]},
               {"FV3 · Galactic P1 · Carb", ~D[2026-11-16]},
               {"FV3 · Galactic P1 · Package", ~D[2026-11-22]},
               {"FV3 · Galactic P1 · CIP & Sanitize", ~D[2026-11-22]}
             ]

      assert Enum.all?(linked(), &(&1.department_id == ctx.brewery.id))

      # P130: pencilled, nothing on the board.
      plan(ctx, brand!("Oktoberfest"), ~D[2026-11-05], %{"pencilled" => true})
      assert length(linked()) == 6
    end

    test "move, renumbering and the batch number retitle and redate (P92, P101)", ctx do
      fv3 = tank!("FV3")
      galactic = plan(ctx, brand!("Galactic"), ~D[2026-11-10], %{"tank_ids" => [fv3.id]})
      fdh = named(galactic, "FDH")

      # Something else already on FDH's new day keeps its spot.
      {:ok, other} =
        RockcutApi.Tasks.create(
          ctx.brewery,
          %{"title" => "Keg wash", "due_on" => "2026-11-19"},
          ctx.brewer
        )

      batch_write(ctx, galactic, fn -> Steps.move([fdh.id], 2, answer: "move_only") end)
      task = task_of(fdh)
      assert task.due_on == ~D[2026-11-19]
      assert task.position == 2
      assert Repo.get!(Task, other.id).position == 1

      # An earlier batch takes P1: every Galactic title follows.
      plan(ctx, brand!("Crusher"), ~D[2026-11-02], %{"tank_ids" => [nil]})
      assert task_of(fdh).title == "FV3 · Galactic P2 · FDH"

      # Into another tank (P101).
      fv6 = tank!("FV6")

      batch_write(ctx, galactic, fn -> Batches.set_vessel_tank(reload(galactic), 0, fv6.id) end)
      assert task_of(fdh).title == "FV6 · Galactic P2 · FDH"

      # Brew day checked off with its number: "#44", done on the board.
      brew = named(galactic, "Brew day")

      batch_write(ctx, galactic, fn ->
        Steps.complete(brew.id, %{"batch_number" => "44", "done_on" => "2026-11-10"}, ctx.brewer,
          today: ~D[2026-11-10]
        )
      end)

      assert task_of(fdh).title == "FV6 · Galactic #44 · FDH"
      brew_task = task_of(brew)
      assert brew_task.title == "FV6 · Galactic #44 · Brew day"
      assert brew_task.completed_on == ~D[2026-11-10]
      assert brew_task.completed_by_id == ctx.brewer.id
    end

    test "tank, step type and brand renames retitle every batch's tasks", ctx do
      fv3 = tank!("FV3")
      brand = brand!("Galactic")
      batch = plan(ctx, brand, ~D[2026-11-02], %{"tank_ids" => [fv3.id]})
      fdh = named(batch, "FDH")

      {:ok, _} = Production.update_tank(fv3, %{"name" => "Fermenter 3"})
      assert task_of(fdh).title == "Fermenter 3 · Galactic P1 · FDH"

      {:ok, _} = Production.update_step_type(type!("FDH"), %{"name" => "Final hop"})
      assert task_of(fdh).title == "Fermenter 3 · Galactic P1 · Final hop"

      {:ok, _} = Brewing.update_brand(brand, %{"name" => "Galactic Haze"})
      assert task_of(fdh).title == "Fermenter 3 · Galactic Haze P1 · Final hop"

      # A refused rename changes nothing.
      tank!("FV9")
      assert {:error, _} = Production.update_tank(Production.get_tank(fv3.id), %{"name" => "FV9"})
      assert task_of(fdh).title == "Fermenter 3 · Galactic Haze P1 · Final hop"
    end

    test "split and Undo split", ctx do
      fv2 = tank!("FV2")
      fv6 = tank!("FV6")
      batch = plan(ctx, brand!("Galactic"), ~D[2026-11-02], %{"tank_ids" => [fv2.id]})
      before = titles()

      {_, token} =
        batch_write(ctx, batch, fn ->
          Splits.split(reload(batch), %{
            "due_on" => "2026-11-13",
            "parts" => [
              %{"stays" => true, "volume_bbl" => "12"},
              %{"tank_id" => fv6.id, "volume_bbl" => "8"}
            ]
          })
        end)

      after_split = titles()
      assert "FV6 · Galactic P1.2 · Package" in after_split
      assert "FV2 · Galactic P1.1 · Package" in after_split
      assert "FV2 · Galactic P1 · Split - Transfer" in after_split
      refute "FV2 · Galactic P1 · Package" in after_split

      # Undo puts the steps back; the tasks follow.
      assert {:ok, _} = Undo.undo(ctx.brewer, token)
      assert titles() == before

      # And the other way, through Undo split.
      batch_write(ctx, batch, fn ->
        Splits.split(reload(batch), %{
          "due_on" => "2026-11-13",
          "parts" => [
            %{"stays" => true, "volume_bbl" => "12"},
            %{"tank_id" => fv6.id, "volume_bbl" => "8"}
          ]
        })
      end)

      batch_write(ctx, batch, fn -> Splits.undo_split(reload(batch)) end)
      assert titles() == before
    end

    test "change template", ctx do
      fv1 = tank!("FV1")
      batch = plan(ctx, brand!("Galactic"), ~D[2026-11-02], %{"tank_ids" => [fv1.id]})
      lager = lager_template!()
      batch_write(ctx, batch, fn -> BatchChanges.change_template(reload(batch), lager.id) end)

      # The beer goes into vessel 1 (Unassigned) on day 10; each tank gets its CIP.
      assert MapSet.new(titles()) ==
               MapSet.new([
                 "FV1 · Galactic P1 · Brew day",
                 "No tank · Galactic P1 · Transfer",
                 "FV1 · Galactic P1 · CIP & Sanitize",
                 "No tank · Galactic P1 · Package",
                 "No tank · Galactic P1 · CIP & Sanitize"
               ])
    end

    test "pencil in and schedule (P132, P133), with Undo", ctx do
      fv3 = tank!("FV3")
      batch = plan(ctx, brand!("Galactic"), ~D[2026-11-02], %{"tank_ids" => [fv3.id]})
      assert length(linked()) == 6

      {_, token} = batch_write(ctx, batch, fn -> Batches.pencil(reload(batch)) end)
      assert linked() == []

      {:ok, _} = Undo.undo(ctx.brewer, token)
      assert length(linked()) == 6

      batch_write(ctx, batch, fn -> Batches.pencil(reload(batch)) end)
      batch_write(ctx, batch, fn -> Batches.schedule(reload(batch)) end)
      assert hd(titles()) == "FV3 · Galactic P1 · Brew day"
    end

    test "on_task_list off and on (P99, P100); notes and assignee follow (P97, P98)", ctx do
      fv3 = tank!("FV3")
      batch = plan(ctx, brand!("Galactic"), ~D[2026-11-02], %{"tank_ids" => [fv3.id]})
      fdh = named(batch, "FDH")

      {_, token} =
        batch_write(ctx, batch, fn -> Steps.update(fdh, %{"on_task_list" => false}) end)

      assert task_of(fdh) == nil

      {:ok, _} = Undo.undo(ctx.brewer, token)
      assert task_of(fdh).title == "FV3 · Galactic P1 · FDH"

      batch_write(ctx, batch, fn -> Steps.update(fdh, %{"on_task_list" => false}) end)

      batch_write(ctx, batch, fn ->
        Steps.update(Repo.get!(Step, fdh.id), %{"on_task_list" => true})
      end)

      assert task_of(fdh)

      batch_write(ctx, batch, fn ->
        Steps.update(Repo.get!(Step, fdh.id), %{
          "notes" => "Use the Citra",
          "assignee_id" => ctx.brewer.id
        })
      end)

      assert %{notes: "Use the Citra", assignee_id: id} = task_of(fdh)
      assert id == ctx.brewer.id
    end

    test "a refused write leaves the tasks as they were (one transaction)", ctx do
      fv3 = tank!("FV3")
      batch = plan(ctx, brand!("Galactic"), ~D[2026-11-02], %{"tank_ids" => [fv3.id]})
      before = linked()

      assert {:error, :nope} =
               Undo.track(ctx.brewer, %{batches: [batch.id]}, fn ->
                 {:ok, _} = Steps.update(named(batch, "FDH"), %{"on_task_list" => false})
                 TaskLink.sync!()
                 {:error, :nope}
               end)

      assert linked() == before

      # A move that needs an answer changes nothing either.
      assert {:error, {:answer_required, _}} =
               Undo.track(ctx.brewer, %{batches: [batch.id]}, fn ->
                 Steps.move([named(batch, "FDH").id], 2)
               end)

      assert linked() == before
    end

    test "deleting a planned batch takes its tasks", ctx do
      batch = plan(ctx, brand!("Galactic"), ~D[2026-11-02], %{"tank_ids" => [nil]})
      batch_write(ctx, batch, fn -> Batches.delete_planned(reload(batch)) end)
      assert linked() == []
    end

    test "standalone CIP done, Undo, and finished tasks left alone", ctx do
      fv6 = tank!("FV6")

      {cip, _} =
        write(
          ctx,
          %{},
          fn -> Cips.create(%{"tank_id" => fv6.id, "due_on" => "2026-10-20"}, ctx.brewer) end,
          &%{steps: [&1.id]}
        )

      assert task_of(cip).title == "FV6 · CIP & Sanitize"

      {_, token} =
        write(ctx, %{steps: [cip.id]}, fn ->
          Steps.complete(cip.id, %{}, ctx.brewer, today: ~D[2026-10-21])
        end)

      # Done today, so it moved to today (P94's rule) and is checked off.
      assert %{due_on: ~D[2026-10-21], completed_on: ~D[2026-10-21]} = task_of(cip)

      {:ok, _} = Undo.undo(ctx.brewer, token)
      assert %{due_on: ~D[2026-10-20], completed_at: nil} = task_of(cip)
    end
  end

  @tag timeout: 120_000
  test "performance: a move with 30 batches syncs within the 500 ms budget", ctx do
    today = ~D[2026-10-21]
    tanks = for i <- 1..10, do: tank!("FV#{i}", "30")

    # About as big as the seeded templates: 20 steps, each after the one before.
    t =
      Enum.reduce(1..15, ctx.template, fn i, t ->
        prev = Enum.max_by(Enum.filter(t.steps, &(&1.day_offset <= i)), & &1.id)

        {:ok, t} =
          Production.add_step(t, %{
            "step_type_id" => type!("Gravity check").id,
            "day_offset" => i,
            "detail" => "##{i}",
            "comes_after_id" => prev.id
          })

        t
      end)

    ctx = %{ctx | template: t}
    brands = for i <- 0..5, do: brand!("Brand #{i}")

    batches =
      for i <- 0..29 do
        plan(ctx, Enum.at(brands, rem(i, 6)), Date.add(today, -28 + i * 2), %{
          "tank_ids" => [Enum.at(tanks, rem(i, 10)).id]
        })
      end

    count = length(linked())
    assert count >= 500

    batch = List.last(batches)
    step = named(batch, "Gravity check - #3")

    {sync_us, _} = :timer.tc(fn -> TaskLink.sync!([step.id]) end)

    {move_us, _} =
      :timer.tc(fn ->
        batch_write(ctx, batch, fn -> Steps.move([step.id], 1, answer: "move_all") end)
      end)

    # A rename touches every unfinished batch's titles.
    {rename_us, _} =
      :timer.tc(fn -> Production.update_tank(Enum.at(tanks, 0), %{"name" => "Fermenter 1"}) end)

    IO.puts(
      "\n[perf] D49 TaskLink (30 batches, #{count} linked tasks): sync! alone #{div(sync_us, 1000)} ms, " <>
        "move with sync! #{div(move_us, 1000)} ms, tank rename #{div(rename_us, 1000)} ms"
    )

    assert move_us < 500_000
  end
end
