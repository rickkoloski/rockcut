defmodule RockcutApi.Production.BatchChangesTest do
  @moduledoc """
  D48 §3.11 (task 1): adding and removing steps, ramps and Change ramp…,
  adding and removing transfers, and changing a planned batch's template
  and brand (P65–P74, P83–P84). The template never changes.
  """
  use RockcutApi.DataCase

  import RockcutApi.AccountsFixtures
  import RockcutApi.ProductionFixtures

  alias RockcutApi.Production
  alias RockcutApi.Production.{BatchChanges, Schedule, Step, Steps, TemplateStep}

  # Brew Nov 2: FDH Nov 9, Set temp 58° Nov 12, Carb Nov 16, Package and CIP Nov 22.
  @brew ~D[2026-11-02]

  setup do
    template = ale_template!()
    batch = plan!(brand!("Galactic"), template, @brew, %{"tank_ids" => [tank!("FV2").id]})
    %{template: template, batch: batch}
  end

  defp add(batch, attrs), do: BatchChanges.add_step(batch, attrs)

  defp template_entries(t),
    do: Repo.aggregate(from(s in TemplateStep, where: s.template_id == ^t.id), :count)

  describe "add step" do
    test "an addition after FDH: Added, follows FDH, the template unchanged (P65)", ctx do
      before = template_entries(ctx.template)
      fdh = named(ctx.batch, "FDH")

      assert {:ok, %{step_ids: [id]}} =
               add(ctx.batch, %{
                 "step_type_id" => type!("Addition").id,
                 "detail" => "raspberry puree",
                 "due_on" => "2026-11-10",
                 "comes_after_id" => fdh.id
               })

      step = Repo.get!(Step, id) |> Repo.preload(:step_type)
      assert Steps.name(step) == "Addition - raspberry puree"
      assert step.added
      assert step.vessel_index == 0
      assert {"FDH", "Addition - raspberry puree", "move_all"} in links(ctx.batch)
      assert template_entries(ctx.template) == before

      # Moving FDH offers to move it.
      {:ok, {:preview, preview}} = Steps.move([fdh.id], 1, preview: true)
      assert id in Enum.map(preview.following, & &1.id)
    end

    test "with comes after and leads to it slots in, replacing the direct link (P66)", ctx do
      fdh = named(ctx.batch, "FDH")
      t58 = named(ctx.batch, "Set temp - 58°")

      {:ok, _} =
        add(ctx.batch, %{
          "step_type_id" => type!("Rouse").id,
          "due_on" => "2026-11-10",
          "comes_after_id" => fdh.id,
          "leads_to_id" => t58.id,
          "leads_to_answer" => "move_only"
        })

      l = links(ctx.batch)
      assert {"FDH", "Rouse", "move_all"} in l
      assert {"Rouse", "Set temp - 58°", "move_only"} in l
      refute Enum.any?(l, &match?({"FDH", "Set temp - 58°", _}, &1))
    end

    test "Something else needs a name (P67); with one it's a custom step, not a marker", ctx do
      assert {:error, :name_required} =
               add(ctx.batch, %{"name" => "  ", "due_on" => "2026-11-10"})

      assert {:error, :name_too_long} =
               add(ctx.batch, %{"name" => String.duplicate("x", 41), "due_on" => "2026-11-10"})

      {:ok, %{step_ids: [id]}} =
        add(ctx.batch, %{"name" => "Check the valve", "due_on" => "2026-11-10"})

      step = Repo.get!(Step, id) |> Repo.preload([:step_type, :phase])
      assert Steps.name(step) == "Check the valve"
      refute Step.marker?(step)
      assert step.on_task_list
    end

    test "refusals: day, tank, Brew day, Split, Set temp without a temperature", ctx do
      assert {:error, :due_on_invalid} = add(ctx.batch, %{"step_type_id" => type!("Rouse").id})

      assert {:error, :no_such_tank} =
               add(ctx.batch, %{
                 "step_type_id" => type!("Rouse").id,
                 "due_on" => "2026-11-10",
                 "vessel_index" => 1
               })

      assert {:error, :brew_day} =
               add(ctx.batch, %{"step_type_id" => type!("Brew day").id, "due_on" => "2026-11-10"})

      assert {:error, :use_split} =
               add(ctx.batch, %{"step_type_id" => type!("Split").id, "due_on" => "2026-11-10"})

      assert {:error, %Ecto.Changeset{} = cs} =
               add(ctx.batch, %{"step_type_id" => type!("Set temp").id, "due_on" => "2026-11-10"})

      assert %{temperature: ["Enter the temperature."]} = errors_on(cs)
      assert length(steps_of(ctx.batch)) == 6
    end

    test "an assignee must be a Brewery member", ctx do
      office = user_with_role("employee", "office")

      assert {:error, %Ecto.Changeset{}} =
               add(ctx.batch, %{
                 "step_type_id" => type!("Rouse").id,
                 "due_on" => "2026-11-10",
                 "assignee_id" => office.id
               })
    end
  end

  describe "ramps" do
    test "60° → 40° at 10° a day: three chained Set temp steps in one group (P68)", ctx do
      carb = named(ctx.batch, "Carb")

      {:ok, %{step_ids: ids}} =
        BatchChanges.add_ramp(ctx.batch, %{
          "start" => 60,
          "target" => 40,
          "change_per_day" => 10,
          "first_on" => "2026-11-13",
          "comes_after_id" => named(ctx.batch, "Set temp - 58°").id,
          "leads_to_id" => carb.id
        })

      steps =
        Repo.all(from(s in Step, where: s.id in ^ids, order_by: s.due_on))
        |> Repo.preload([:step_type, :phase])

      assert Enum.map(steps, &{Steps.name(&1), &1.due_on}) == [
               {"Set temp - 60°", ~D[2026-11-13]},
               {"Set temp - 50°", ~D[2026-11-14]},
               {"Set temp - 40°", ~D[2026-11-15]}
             ]

      assert steps |> Enum.map(& &1.ramp_group) |> Enum.uniq() |> length() == 1
      assert Enum.all?(steps, & &1.added)
      assert hd(steps).phase.name == "Crash"
      assert Enum.map(tl(steps), & &1.phase_id) == [nil, nil]

      l = links(ctx.batch)
      assert {"Set temp - 60°", "Set temp - 50°", "move_all"} in l
      assert {"Set temp - 40°", "Carb", "move_all"} in l
      refute Enum.any?(l, &match?({"Set temp - 58°", "Carb", _}, &1))

      assert {:error, :ramp_flat} =
               BatchChanges.add_ramp(ctx.batch, %{
                 "start" => 40,
                 "target" => 40,
                 "change_per_day" => 1,
                 "first_on" => "2026-11-13"
               })

      assert {:error, {:ramp_change, 20}} =
               BatchChanges.add_ramp(ctx.batch, %{
                 "start" => 60,
                 "target" => 40,
                 "change_per_day" => 25,
                 "first_on" => "2026-11-13"
               })
    end

    test "a template's ramp keeps its group on the batch" do
      {:ok, t} = Production.create_template(%{"name" => "Ramped"})

      {:ok, t} =
        Production.add_ramp(t, %{
          "start" => 58,
          "target" => 38,
          "change_per_day" => 10,
          "first_day" => 5,
          "comes_after_id" => hd(t.steps).id
        })

      {:ok, t} =
        Production.add_step(t, %{
          "step_type_id" => type!("Package").id,
          "day_offset" => 10,
          "comes_after_id" => List.last(Enum.sort_by(t.steps, & &1.day_offset)).id
        })

      batch = plan!(brand!("Enos"), t, @brew)

      groups =
        steps_of(batch)
        |> Enum.filter(&(&1.temperature && &1.step_type.behavior == "set_temp"))
        |> Enum.map(& &1.ramp_group)

      assert length(groups) == 3
      assert [g] = Enum.uniq(groups)
      assert is_binary(g)
    end

    test "Change ramp… regenerates only the unfinished steps (P69)", ctx do
      {:ok, %{step_ids: [first | _]}} =
        BatchChanges.add_ramp(ctx.batch, %{
          "start" => 60,
          "target" => 40,
          "change_per_day" => 10,
          "first_on" => "2026-11-13",
          "comes_after_id" => named(ctx.batch, "Set temp - 58°").id,
          "leads_to_id" => named(ctx.batch, "Carb").id
        })

      done!(Repo.get!(Step, first))
      second = named(ctx.batch, "Set temp - 50°")

      assert {:ok, %{step_ids: new}} =
               BatchChanges.change_ramp(second, %{"target" => 34, "change_per_day" => 7})

      ramp =
        steps_of(ctx.batch)
        |> Enum.filter(&(&1.ramp_group == second.ramp_group))
        |> Enum.map(&{Steps.name(&1), &1.due_on, &1.done_on != nil})

      assert ramp == [
               {"Set temp - 60°", ~D[2026-11-13], true},
               {"Set temp - 53°", ~D[2026-11-14], false},
               {"Set temp - 46°", ~D[2026-11-15], false},
               {"Set temp - 39°", ~D[2026-11-16], false},
               {"Set temp - 34°", ~D[2026-11-17], false}
             ]

      assert length(new) == 4
      l = links(ctx.batch)
      # Into the group from the finished step, and out of it to Carb, kept.
      assert {"Set temp - 60°", "Set temp - 53°", "move_all"} in l
      assert {"Set temp - 34°", "Carb", "move_all"} in l
      refute Repo.get(Step, second.id)

      # Only the target: the change per day stays 7.
      {:ok, _} = BatchChanges.change_ramp(named(ctx.batch, "Set temp - 53°"), %{"target" => 46})

      assert ctx.batch
             |> steps_of()
             |> Enum.filter(&(&1.ramp_group == second.ramp_group))
             |> Enum.map(& &1.temperature) == [60, 53, 46]

      assert {:error, :not_ramp} =
               BatchChanges.change_ramp(named(ctx.batch, "FDH"), %{"target" => 40})
    end
  end

  describe "remove step" do
    test "links pass through (P70); Brew day and done steps stay (P71)", ctx do
      {:ok, %{step_ids: [amylo]}} =
        add(ctx.batch, %{
          "step_type_id" => type!("Amylo").id,
          "due_on" => "2026-11-05",
          "comes_after_id" => named(ctx.batch, "Brew day").id,
          "leads_to_id" => named(ctx.batch, "FDH").id
        })

      assert {:ok, %{batch_ids: [_]}} = BatchChanges.remove_step(Repo.get!(Step, amylo))
      assert {"Brew day", "FDH", "move_all"} in links(ctx.batch)
      refute Repo.get(Step, amylo)

      assert {:error, :brew_day} = BatchChanges.remove_step(named(ctx.batch, "Brew day"))
      done = done!(named(ctx.batch, "FDH"))
      assert {:error, :step_done} = BatchChanges.remove_step(done)
      # A template step can go too, the template unchanged.
      assert {:ok, _} = BatchChanges.remove_step(named(ctx.batch, "Carb"))
      assert {"Set temp - 58°", "Package", "move_only"} in links(ctx.batch)
    end
  end

  describe "transfers" do
    test "Filter on Nov 14 into Serving 1: later steps move, a CIP for the first tank (P72); remove it (P74)",
         ctx do
      fv2 = vessels(ctx.batch)[0]
      s1 = tank!("Serving 1")

      assert {:ok, %{moved: 3}} =
               BatchChanges.add_transfer(ctx.batch, %{
                 "step_type_id" => type!("Filter").id,
                 "due_on" => "2026-11-14",
                 "tank_id" => s1.id
               })

      assert vessels(ctx.batch) == %{0 => fv2, 1 => s1.id}

      assert layout(ctx.batch) == [
               {"Brew day", ~D[2026-11-02], 0},
               {"FDH", ~D[2026-11-09], 0},
               {"Set temp - 58°", ~D[2026-11-12], 0},
               {"Filter", ~D[2026-11-14], 1},
               {"CIP & Sanitize", ~D[2026-11-14], 0},
               {"Carb", ~D[2026-11-16], 1},
               {"Package", ~D[2026-11-22], 1},
               {"CIP & Sanitize", ~D[2026-11-22], 1}
             ]

      l = links(ctx.batch)
      assert {"Filter", "CIP & Sanitize", "move_all"} in l
      assert {"Set temp - 58°", "Filter", "move_all"} in l
      assert {"Filter", "Carb", "move_all"} in l
      refute Enum.any?(l, &match?({"Set temp - 58°", "Carb", _}, &1))
      assert named(ctx.batch, "Filter").added

      # The parts on the schedule: the first tank's ends at the filter.
      [entry] = Schedule.batches([ctx.batch.id])
      [p0, p1] = RockcutApi.Production.Parts.build([entry])
      assert p0.exit.due_on == ~D[2026-11-14]
      assert p1.fill.due_on == ~D[2026-11-14]

      assert {:ok, _} = BatchChanges.remove_step(named(ctx.batch, "Filter"))
      assert vessels(ctx.batch) == %{0 => fv2}

      assert layout(ctx.batch) == [
               {"Brew day", ~D[2026-11-02], 0},
               {"FDH", ~D[2026-11-09], 0},
               {"Set temp - 58°", ~D[2026-11-12], 0},
               {"Carb", ~D[2026-11-16], 0},
               {"Package", ~D[2026-11-22], 0},
               {"CIP & Sanitize", ~D[2026-11-22], 0}
             ]

      assert {"Set temp - 58°", "Carb", "move_all"} in links(ctx.batch)
    end

    test "refused when a step after that day is done (P73)", ctx do
      done!(named(ctx.batch, "Carb"))

      assert {:error, :step_done_after} =
               BatchChanges.add_transfer(ctx.batch, %{"due_on" => "2026-11-14"})

      assert vessels(ctx.batch) |> map_size() == 1
      # On the day of a done step or later is fine.
      assert {:ok, _} = BatchChanges.add_transfer(ctx.batch, %{"due_on" => "2026-11-17"})
    end

    test "a transfer before an existing one: the later tanks move up one, keeping their tanks" do
      fv1 = tank!("FV1")
      bb1 = tank!("BBT1")
      batch = plan!(brand!("Enos"), lager_template!(), @brew, %{"tank_ids" => [fv1.id, bb1.id]})
      un = tank!("FV9")

      {:ok, _} = BatchChanges.add_transfer(batch, %{"due_on" => "2026-11-07", "tank_id" => un.id})
      assert vessels(batch) == %{0 => fv1.id, 1 => un.id, 2 => bb1.id}

      assert layout(batch) == [
               {"Brew day", ~D[2026-11-02], 0},
               {"Transfer", ~D[2026-11-07], 1},
               {"CIP & Sanitize", ~D[2026-11-07], 0},
               {"Transfer", ~D[2026-11-12], 2},
               {"CIP & Sanitize", ~D[2026-11-12], 1},
               {"Package", ~D[2026-11-22], 2},
               {"CIP & Sanitize", ~D[2026-11-22], 2}
             ]

      # Through add step too, Unassigned.
      {:ok, _} =
        BatchChanges.add_step(batch, %{
          "step_type_id" => type!("Filter").id,
          "due_on" => "2026-11-15"
        })

      assert vessels(batch) == %{0 => fv1.id, 1 => un.id, 2 => bb1.id, 3 => nil}

      {:ok, _} =
        BatchChanges.remove_step(
          Enum.find(steps_of(batch), &(&1.due_on == ~D[2026-11-07] and &1.vessel_index == 1))
        )

      assert vessels(batch) == %{0 => fv1.id, 1 => bb1.id, 2 => nil}
    end
  end

  describe "when the beer is there (DEV QA M1, M3)" do
    test "a transfer falls after its tank's fill and before its exit, into another tank", ctx do
      assert {:error, :before_fill} =
               BatchChanges.add_transfer(ctx.batch, %{"due_on" => "2026-10-25"})

      assert {:error, :before_fill} =
               BatchChanges.add_transfer(ctx.batch, %{"due_on" => "2026-11-02"})

      assert {:error, :after_exit} =
               BatchChanges.add_transfer(ctx.batch, %{"due_on" => "2026-11-22"})

      assert {:error, :after_exit} =
               BatchChanges.add_transfer(ctx.batch, %{"due_on" => "2026-12-20"})

      assert {:error, {:same_tank, "FV2"}} =
               BatchChanges.add_transfer(ctx.batch, %{
                 "due_on" => "2026-11-14",
                 "tank_id" => vessels(ctx.batch)[0]
               })

      # Through Add step too.
      assert {:error, :before_fill} =
               add(ctx.batch, %{"step_type_id" => type!("Filter").id, "due_on" => "2026-10-25"})

      # Into a later tank: after the transfer into it.
      {:ok, _} =
        BatchChanges.add_transfer(ctx.batch, %{
          "due_on" => "2026-11-14",
          "tank_id" => tank!("Q1C").id
        })

      assert {:error, :before_fill} =
               BatchChanges.add_transfer(ctx.batch, %{"due_on" => "2026-11-14"})

      assert {:error, {:same_tank, "Q1C"}} =
               BatchChanges.add_transfer(ctx.batch, %{
                 "due_on" => "2026-11-16",
                 "tank_id" => Repo.get_by!(RockcutApi.Production.Tank, name: "Q1C").id
               })

      assert {:ok, _} = BatchChanges.add_transfer(ctx.batch, %{"due_on" => "2026-11-16"})
      assert map_size(vessels(ctx.batch)) == 3
    end

    test "added steps and ramps start on brew day or later", ctx do
      assert {:error, :before_brew_day} =
               add(ctx.batch, %{"name" => "Early", "due_on" => "2026-11-01"})

      assert {:ok, _} = add(ctx.batch, %{"name" => "Brew-day check", "due_on" => "2026-11-02"})

      assert {:error, :before_brew_day} =
               BatchChanges.add_ramp(ctx.batch, %{
                 "start" => 60,
                 "target" => 50,
                 "change_per_day" => 10,
                 "first_on" => "2026-10-30"
               })
    end
  end

  describe "template and brand" do
    test "a kept ramp and a kept step stay linked into the rebuilt chain, both ways (QA minor 7b)",
         ctx do
      {:ok, %{step_ids: ramp}} =
        BatchChanges.add_ramp(ctx.batch, %{
          "start" => 60,
          "target" => 40,
          "change_per_day" => 10,
          "first_on" => "2026-11-10",
          "comes_after_id" => named(ctx.batch, "FDH").id
        })

      {:ok, _} =
        add(ctx.batch, %{
          "step_type_id" => type!("Rouse").id,
          "due_on" => "2026-11-05",
          "comes_after_id" => named(ctx.batch, "Brew day").id
        })

      [head | _] = ramp

      for t <- [lager_template!(), ctx.template] do
        {:ok, _} = BatchChanges.change_template(reload(ctx.batch), t.id)
        l = links(ctx.batch)

        into_head =
          Repo.all(
            from(x in RockcutApi.Production.StepLink,
              where: x.to_step_id == ^head,
              select: x.from_step_id
            )
          )

        assert [from] = into_head
        refute from in ramp
        assert {"Set temp - 60°", "Set temp - 50°", "move_all"} in l
        assert {"Set temp - 50°", "Set temp - 40°", "move_all"} in l
        assert Enum.any?(l, &match?({_, "Rouse", "move_all"}, &1))
      end
    end

    test "a kept step dated before brew day (checked off early) is still linked in (QA minor 7b)",
         ctx do
      {:ok, %{step_ids: [early | _]}} =
        BatchChanges.add_ramp(ctx.batch, %{
          "start" => 60,
          "target" => 50,
          "change_per_day" => 10,
          "first_on" => "2026-11-10"
        })

      Repo.get!(Step, early)
      |> Ecto.Changeset.change(due_on: ~D[2026-10-21], done_on: ~D[2026-10-21])
      |> Repo.update!()

      {:ok, _} = BatchChanges.change_template(reload(ctx.batch), lager_template!().id)
      assert {"Brew day", "Set temp - 60°", "move_all"} in links(ctx.batch)
    end

    test "Standard ale → Lager with transfer keeps the added step (P83)", ctx do
      {:ok, _} = add(ctx.batch, %{"step_type_id" => type!("Rouse").id, "due_on" => "2026-11-05"})

      {:ok, _} =
        BatchChanges.add_transfer(ctx.batch, %{
          "due_on" => "2026-11-18",
          "tank_id" => tank!("Q1D").id
        })

      lager = lager_template!()
      fv2 = vessels(ctx.batch)[0]

      # QA minor 7a: the dropped transfer is named.
      assert {:ok,
              %{
                message:
                  "Standard ale → Lager with transfer. Kept 1 added step; dropped the added transfer into Q1D."
              }} =
               BatchChanges.change_template(reload(ctx.batch), lager.id)

      assert reload(ctx.batch).template_id == lager.id
      assert vessels(ctx.batch) == %{0 => fv2, 1 => nil}

      assert layout(ctx.batch) == [
               {"Brew day", @brew, 0},
               {"Rouse", ~D[2026-11-05], 0},
               {"Transfer", ~D[2026-11-12], 1},
               {"CIP & Sanitize", ~D[2026-11-12], 0},
               {"Package", ~D[2026-11-22], 1},
               {"CIP & Sanitize", ~D[2026-11-22], 1}
             ]

      assert {"Brew day", "Rouse", "move_all"} in links(ctx.batch)

      # And back: the later tank goes.
      assert {:ok, %{message: "Lager with transfer → Standard ale. Kept 1 added step."}} =
               BatchChanges.change_template(reload(ctx.batch), ctx.template.id)

      assert vessels(ctx.batch) == %{0 => fv2}
    end

    test "two-day brews stay two days; brewed or split batches can't change", ctx do
      batch = plan!(brand!("Enos"), ctx.template, @brew, %{"brew_two_days" => true})
      {:ok, _} = BatchChanges.change_template(reload(batch), lager_template!().id)
      assert {"Brew day - 2 of 2", ~D[2026-11-03], 0} in layout(batch)

      ctx.batch
      |> Ecto.Changeset.change(status: "fermenting", batch_number: "40")
      |> Repo.update!()

      assert {:error, :not_planned} =
               BatchChanges.change_template(reload(ctx.batch), ctx.template.id)

      assert {:error, :not_planned} = BatchChanges.change_brand(reload(ctx.batch), brand!("X").id)

      Repo.insert!(%RockcutApi.Brewing.Batch{
        brand_id: batch.brand_id,
        status: "planned",
        split_parent_id: batch.id,
        part_number: 1
      })

      assert {:error, :split} = BatchChanges.change_template(reload(batch), ctx.template.id)
    end

    test "change brand: the label follows, parts too (P84)", ctx do
      enos = brand!("Enos")

      part =
        Repo.insert!(%RockcutApi.Brewing.Batch{
          brand_id: ctx.batch.brand_id,
          status: "planned",
          split_parent_id: ctx.batch.id,
          part_number: 1
        })

      assert {:ok, _} = BatchChanges.change_brand(reload(ctx.batch), enos.id)
      assert [%{label: "Enos P1"}] = Schedule.batches([ctx.batch.id])
      assert reload(part).brand_id == enos.id

      retired = Repo.insert!(%RockcutApi.Brewing.Brand{name: "Old", status: "retired"})
      assert {:error, :brand_invalid} = BatchChanges.change_brand(reload(ctx.batch), retired.id)
    end
  end
end
