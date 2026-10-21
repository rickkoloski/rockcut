defmodule RockcutApi.Production.ScheduleTest do
  @moduledoc """
  D47 §3.5–§3.7: planning batches, P-numbers and batch numbers, moving and
  checking off steps (with the server-side previews), the step dialog's
  edits, and the schedule payload.
  """
  use RockcutApi.DataCase

  import RockcutApi.AccountsFixtures

  alias RockcutApi.Production
  alias RockcutApi.Production.{Batches, Schedule, Step, StepType, Steps}
  alias RockcutApi.Brewing.{Batch, Brand}

  @brew ~D[2026-11-02]
  @today ~D[2026-10-21]

  setup do
    brewer = user_with_role("employee", "brewery")
    %{brewer: brewer}
  end

  defp type!(name), do: Repo.get_by!(StepType, name: name)

  defp brand!(name) do
    Repo.insert!(%Brand{name: name, status: "active"})
  end

  defp tank!(name, capacity \\ "20") do
    {:ok, t} = Production.create_tank(%{"name" => name, "capacity_bbl" => capacity})
    t
  end

  # Brew day; FDH day 7 (after brew); Set temp 58° day 10 (after FDH);
  # Carb day 14 (after Set temp); Package day 20 (after Carb, "move only").
  defp ale_template!(name \\ "Standard ale") do
    {:ok, t} = Production.create_template(%{"name" => name})
    [brew] = t.steps
    t = add!(t, "FDH", 7, after: brew)
    t = add!(t, "Set temp", 10, after: step(t, "FDH"), temperature: 58)
    t = add!(t, "Carb", 14, after: step(t, "Set temp - 58°"))
    t = add!(t, "Package", 20, after: step(t, "Carb"), answer: "move_only")
    [] = t.issues
    t
  end

  # Brew day; Transfer day 10 into tank 1 (its CIP on tank 0); Package day 20 in tank 1.
  defp lager_template! do
    {:ok, t} = Production.create_template(%{"name" => "Lager with transfer"})
    t = add!(t, "Transfer", 10, vessel: 1, after: hd(t.steps))
    t = add!(t, "Package", 20, vessel: 1, after: step(t, "Transfer"))
    [] = t.issues
    t
  end

  defp add!(t, type, day, opts) do
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

  defp step(t, name), do: Enum.find(t.steps, &(Production.step_name(&1) == name))

  defp plan!(brand, template, brew_on, extra \\ %{}) do
    {:ok, {batch, renumbered}} =
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

    {batch, renumbered}
  end

  defp steps_of(batch) do
    Repo.all(from(s in Step, where: s.batch_id == ^batch.id, order_by: [s.due_on, s.id]))
    |> Repo.preload([:step_type, :phase])
  end

  defp named(batch, name), do: Enum.find(steps_of(batch), &(Steps.name(&1) == name))
  defp dates(batch), do: Enum.map(steps_of(batch), &{Steps.name(&1), &1.due_on})
  defp reload(batch), do: Repo.get!(Batch, batch.id)

  describe "planning" do
    test "copies the template's steps and links from the brew day, with a CIP after the Package" do
      fv3 = tank!("FV3")
      {batch, []} = plan!(brand!("Galactic"), ale_template!(), @brew, %{"tank_ids" => [fv3.id]})

      assert %Batch{status: "planned", batch_number: nil, brew_two_days: false} = reload(batch)
      assert Decimal.equal?(reload(batch).volume_bbl, 20)

      assert dates(batch) == [
               {"Brew day", @brew},
               {"FDH", ~D[2026-11-09]},
               {"Set temp - 58°", ~D[2026-11-12]},
               {"Carb", ~D[2026-11-16]},
               {"Package", ~D[2026-11-22]},
               {"CIP & Sanitize", ~D[2026-11-22]}
             ]

      [vessel] = Repo.all(from(v in Production.BatchVessel, where: v.batch_id == ^batch.id))
      assert {vessel.vessel_index, vessel.tank_id} == {0, fv3.id}

      # Plan decision 3: the CIP is linked "move all" from the Package.
      [entry] = Schedule.batches([batch.id])
      package = named(batch, "Package")
      cip = named(batch, "CIP & Sanitize")

      assert Enum.any?(
               entry.links,
               &(&1.from_step_id == package.id and &1.to_step_id == cip.id and
                   &1.default_answer == "move_all")
             )

      assert length(entry.links) == 5
      assert entry.label == "Galactic P1"
    end

    test "a transfer template: two vessels, the second Unassigned by default" do
      {batch, _} = plan!(brand!("Fest"), lager_template!(), @brew)

      assert Repo.all(
               from(v in Production.BatchVessel,
                 where: v.batch_id == ^batch.id,
                 order_by: v.vessel_index,
                 select: {v.vessel_index, v.tank_id}
               )
             ) == [{0, nil}, {1, nil}]

      # The template's CIP for tank 0, and decision 3's for tank 1.
      cips = steps_of(batch) |> Enum.filter(&(Steps.behavior(&1) == "cip"))

      assert Enum.map(cips, &{&1.vessel_index, &1.due_on}) == [
               {0, ~D[2026-11-12]},
               {1, ~D[2026-11-22]}
             ]
    end

    test "a two-day brew: Brew day - 1 of 2 and 2 of 2 the next day, linked (P24)" do
      {batch, _} = plan!(brand!("Galactic"), ale_template!(), @brew, %{"brew_two_days" => true})
      assert reload(batch).brew_two_days
      first = named(batch, "Brew day - 1 of 2")
      second = named(batch, "Brew day - 2 of 2")
      assert {first.due_on, second.due_on} == {@brew, ~D[2026-11-03]}
      steps = steps_of(batch)
      assert Steps.first_brew?(first, steps)
      refute Steps.first_brew?(second, steps)
      assert named(batch, "FDH").due_on == ~D[2026-11-09]
    end

    test "refusals: missing fields, an incomplete template, a retired tank, a retired brand" do
      brand = brand!("Galactic")
      template = ale_template!()

      assert {:error, cs} = Batches.plan(%{})

      assert errors_on(cs) == %{
               brand_id: ["Pick a brand."],
               template_id: ["Pick a template."],
               brew_on: ["Pick the brew day."],
               volume_bbl: ["Enter the volume."]
             }

      base = %{"brand_id" => brand.id, "template_id" => template.id, "brew_on" => "2026-11-02"}
      assert {:error, cs} = Batches.plan(Map.put(base, "volume_bbl", "0"))
      assert errors_on(cs).volume_bbl == ["Enter a volume more than 0 and under 10,000 bbl."]

      {:ok, empty} = Production.create_template(%{"name" => "Empty"})

      assert {:error, :template_incomplete} =
               Batches.plan(base |> Map.put("template_id", empty.id) |> Map.put("volume_bbl", 20))

      old = tank!("Old")
      {:ok, _} = Production.retire_tank(old)

      assert {:error, :tank_invalid} =
               Batches.plan(base |> Map.put("volume_bbl", 20) |> Map.put("tank_ids", [old.id]))

      assert {:error, :tank_invalid} =
               Batches.plan(base |> Map.put("volume_bbl", 20) |> Map.put("tank_ids", [nil, nil]))

      retired = Repo.insert!(%Brand{name: "Gone", status: "retired"})

      assert {:error, cs} =
               Batches.plan(base |> Map.put("volume_bbl", 20) |> Map.put("brand_id", retired.id))

      assert errors_on(cs).brand_id == ["Pick a brand."]
      assert Repo.aggregate(Batch, :count) == 0
    end
  end

  describe "P-numbers and batch numbers" do
    test "by first brew day, then id; planning earlier renumbers the later ones (P21, P23)" do
      t = ale_template!()
      {late, []} = plan!(brand!("Enos"), t, ~D[2026-11-20])
      {later, []} = plan!(brand!("Fest"), t, ~D[2026-11-25])
      {same_day, []} = plan!(brand!("Altruism"), t, ~D[2026-11-25])
      assert Batches.p_numbers() == %{late.id => 1, later.id => 2, same_day.id => 3}

      {galactic, renumbered} = plan!(brand!("Galactic"), t, ~D[2026-10-22])
      assert Batches.p_numbers()[galactic.id] == 1

      assert renumbered == [
               %{batch_id: late.id, brand: "Enos", from: "P1", to: "P2"},
               %{batch_id: later.id, brand: "Fest", from: "P2", to: "P3"},
               %{batch_id: same_day.id, brand: "Altruism", from: "P3", to: "P4"}
             ]

      # Deleting a planned batch renumbers too (P60).
      assert {:ok, [%{batch_id: _, from: "P2", to: "P1"} | _]} = Batches.delete_planned(galactic)
      refute Repo.get(Batch, galactic.id)
    end

    test "the next number counts plain numbers only; duplicates are refused ignoring case" do
      brand = brand!("Galactic")

      for n <- ["42", "43", "44b", "x9"],
          do: Repo.insert!(%Batch{brand_id: brand.id, batch_number: n, status: "completed"})

      assert Batches.next_batch_number() == "44"

      assert {:error, {:batch_number_taken, "44B", "Galactic #44b"}} =
               Batches.check_number(" 44B ")

      assert {:error, :batch_number_required} = Batches.check_number("  ")
      assert {:error, :batch_number_invalid} = Batches.check_number(String.duplicate("9", 21))
      assert {:ok, "45"} = Batches.check_number("45")
    end

    test "checking off the first brew day takes the number; un-checking frees it (P36–P39)", %{
      brewer: brewer
    } do
      t = ale_template!()
      galactic = brand!("Galactic")
      Repo.insert!(%Batch{brand_id: galactic.id, batch_number: "40", status: "fermenting"})
      Repo.insert!(%Batch{brand_id: galactic.id, batch_number: "43", status: "completed"})
      {altruism, _} = plan!(brand!("Altruism"), t, @today)
      {other, _} = plan!(brand!("Enos"), t, ~D[2026-10-25])
      brew = named(altruism, "Brew day")

      assert {:ok, {:preview, %{needs_batch_number: true, next_batch_number: "44", move: nil}}} =
               Steps.complete(brew.id, %{}, brewer, preview: true, today: @today)

      assert {:error, :batch_number_required} =
               Steps.complete(brew.id, %{"done_on" => "2026-10-21"}, brewer, today: @today)

      assert {:error, {:batch_number_taken, "40", "Galactic #40"}} =
               Steps.complete(brew.id, %{"batch_number" => "40"}, brewer, today: @today)

      assert {:ok, %{renumbered: renumbered}} =
               Steps.complete(brew.id, %{"batch_number" => "44b"}, brewer, today: @today)

      assert renumbered == [%{batch_id: other.id, brand: "Enos", from: "P2", to: "P1"}]
      assert %Batch{status: "fermenting", batch_number: "44b"} = reload(altruism)
      assert named(altruism, "Brew day").done_by_id == brewer.id

      # P37: still 44; "44B" is taken.
      assert Batches.next_batch_number() == "44"
      other_brew = named(other, "Brew day")

      assert {:error, {:batch_number_taken, "44B", "Altruism #44b"}} =
               Steps.complete(other_brew.id, %{"batch_number" => "44B"}, brewer,
                 today: ~D[2026-10-25]
               )

      # P38
      assert {:ok, %{message: "Altruism #44b is planned again; its number is freed."}} =
               Steps.uncomplete(brew.id)

      assert %Batch{status: "planned", batch_number: nil} = reload(altruism)
      assert Batches.p_numbers()[altruism.id] == 1
    end

    test "a brewed batch's number changes with the same rules; a planned one's can't (P40)" do
      t = ale_template!()
      galactic = brand!("Galactic")
      Repo.insert!(%Batch{brand_id: galactic.id, batch_number: "40", status: "fermenting"})
      {batch, _} = plan!(brand!("Crusher"), t, @today)
      assert {:error, :not_brewed} = Batches.update(batch, %{"batch_number" => "45"})
      batch |> Ecto.Changeset.change(status: "fermenting", batch_number: "42") |> Repo.update!()
      batch = reload(batch)
      assert {:ok, _} = Batches.update(batch, %{"batch_number" => "45", "volume_bbl" => "18.5"})
      assert %Batch{batch_number: "45"} = reload(batch)
      assert Decimal.equal?(reload(batch).volume_bbl, Decimal.new("18.5"))

      assert {:error, {:batch_number_taken, "40", _}} =
               Batches.update(batch, %{"batch_number" => "40"})

      assert {:error, :volume_invalid} = Batches.update(batch, %{"volume_bbl" => "-1"})
    end
  end

  describe "moving steps" do
    setup do
      {batch, _} = plan!(brand!("Galactic"), ale_template!(), @brew)
      %{batch: batch}
    end

    test "FDH: the default moves everything after it; the preview lists it (P25)", %{batch: batch} do
      fdh = named(batch, "FDH")

      assert {:ok, {:preview, p}} = Steps.move([fdh.id], 2, preview: true)
      assert p.default_answer == "move_all"
      assert p.batch_label == "Galactic P1"
      assert [%{name: "FDH", new_due_on: ~D[2026-11-11]}] = p.moved

      assert Enum.map(p.following, &{&1.name, &1.new_due_on}) == [
               {"Set temp - 58°", ~D[2026-11-14]},
               {"Carb", ~D[2026-11-18]},
               {"Package", ~D[2026-11-24]},
               {"CIP & Sanitize", ~D[2026-11-24]}
             ]

      assert p.out_of_order["move_all"] == []
      # Nothing written by the preview.
      assert named(batch, "FDH").due_on == ~D[2026-11-09]

      assert {:error, {:answer_required, ^p}} = Steps.move([fdh.id], 2)

      assert {:ok, %{batch_ids: [_], renumbered: []}} =
               Steps.move([fdh.id], 2, answer: "move_all")

      assert named(batch, "Package").due_on == ~D[2026-11-24]
      assert named(batch, "Brew day").due_on == @brew
    end

    test "move only: the following steps stay; out of order is reported (P26)", %{batch: batch} do
      fdh = named(batch, "FDH")
      {:ok, {:preview, p}} = Steps.move([fdh.id], 4, preview: true)

      assert [%{from_name: "FDH", to_name: "Set temp - 58°"}] = p.out_of_order["move_only"]

      assert {:ok, %{out_of_order: [%{to_name: "Set temp - 58°"}]}} =
               Steps.move([fdh.id], 4, answer: "move_only")

      assert named(batch, "FDH").due_on == ~D[2026-11-13]
      assert named(batch, "Set temp - 58°").due_on == ~D[2026-11-12]
    end

    test "Carb's only link is 'move only', so that's the default (P27)", %{batch: batch} do
      carb = named(batch, "Carb")
      {:ok, {:preview, p}} = Steps.move([carb.id], 1, preview: true)
      assert p.default_answer == "move_only"
      assert Enum.map(p.following, & &1.name) == ["Package", "CIP & Sanitize"]
    end

    test "nothing follows: no answer needed", %{batch: batch} do
      cip = named(batch, "CIP & Sanitize")

      {:ok, {:preview, %{default_answer: nil, following: []}}} =
        Steps.move([cip.id], 1, preview: true)

      assert {:ok, _} = Steps.move([cip.id], 1)
    end

    test "finished steps never move, and nothing is pulled past them", %{
      batch: batch,
      brewer: brewer
    } do
      set_temp = named(batch, "Set temp - 58°")

      Repo.update!(
        Ecto.Changeset.change(set_temp, done_on: ~D[2026-11-12], done_by_id: brewer.id)
      )

      fdh = named(batch, "FDH")

      {:ok, {:preview, p}} = Steps.move([fdh.id], 1, preview: true)
      assert p.following == []
      assert {:error, :step_done} = Steps.move([set_temp.id], 1, answer: "move_all")
      assert {:error, :days_invalid} = Steps.move([fdh.id], 0)
      assert {:error, :not_found} = Steps.move([fdh.id, 999_999], 1)
      assert {:error, :answer_invalid} = Steps.move([fdh.id], 1, answer: "everything")
    end

    test "moving a first brew day renumbers in the preview and for real", %{batch: batch} do
      {other, _} = plan!(brand!("Enos"), ale_template!("Another ale"), ~D[2026-11-04])
      brew = named(batch, "Brew day")

      {:ok, {:preview, p}} = Steps.move([brew.id], 3, preview: true)

      assert p.renumbered["move_only"] == [
               %{batch_id: other.id, brand: "Enos", from: "P2", to: "P1"},
               %{batch_id: batch.id, brand: "Galactic", from: "P1", to: "P2"}
             ]

      assert {:ok, %{renumbered: [_, _]}} = Steps.move([brew.id], 3, answer: "move_all")
    end
  end

  describe "checking off" do
    setup do
      {batch, _} = plan!(brand!("Galactic"), ale_template!(), @brew)
      %{batch: batch}
    end

    test "done 2 days late: the step moves to that day and the prompt applies (P35)", %{
      batch: batch,
      brewer: brewer
    } do
      fdh = named(batch, "FDH")
      today = ~D[2026-11-11]

      assert {:ok,
              {:preview,
               %{move: %{days: 2, default_answer: "move_all"}, needs_batch_number: false}}} =
               Steps.complete(fdh.id, %{"done_on" => "2026-11-11"}, brewer,
                 preview: true,
                 today: today
               )

      assert {:error, {:answer_required, %{days: 2}}} =
               Steps.complete(fdh.id, %{"done_on" => "2026-11-11"}, brewer, today: today)

      assert {:ok, _} =
               Steps.complete(
                 fdh.id,
                 %{"done_on" => "2026-11-11", "answer" => "move_all"},
                 brewer,
                 today: today
               )

      fdh = named(batch, "FDH")
      assert {fdh.due_on, fdh.done_on} == {~D[2026-11-11], ~D[2026-11-11]}
      assert named(batch, "Set temp - 58°").due_on == ~D[2026-11-14]

      assert {:error, :step_done} = Steps.complete(fdh.id, %{}, brewer, today: today)

      assert {:error, :done_on_future} =
               Steps.complete(named(batch, "Carb").id, %{"done_on" => "2026-11-12"}, brewer,
                 today: today
               )
    end

    test "on plan: no prompt; a full Package completes the batch, a partial one doesn't (P112)",
         %{
           batch: batch,
           brewer: brewer
         } do
      batch |> Ecto.Changeset.change(status: "fermenting", batch_number: "40") |> Repo.update!()
      package = named(batch, "Package")

      # Switched to partial first: checking it off changes nothing.
      {:ok, _} = Steps.update(package, %{"package_partial" => true})
      assert named(batch, "Package - Partial")
      today = package.due_on
      assert {:ok, _} = Steps.complete(package.id, %{}, brewer, today: today)
      assert reload(batch).status == "fermenting"

      assert {:error, :step_done} =
               Steps.update(named(batch, "Package - Partial"), %{"package_partial" => false})

      {:ok, _} = Steps.uncomplete(package.id)

      {:ok, _} = Steps.update(named(batch, "Package - Partial"), %{"package_partial" => false})
      assert {:ok, _} = Steps.complete(package.id, %{}, brewer, today: today)
      assert reload(batch).status == "completed"

      assert {:ok, %{message: nil}} = Steps.uncomplete(package.id)
      assert reload(batch).status == "fermenting"
      assert {:error, :not_done} = Steps.uncomplete(package.id)
    end
  end

  describe "batch changes" do
    test "shift: a planned batch's every step; a brewed one's unfinished steps (P30, P31)", %{
      brewer: brewer
    } do
      t = ale_template!()
      {planned, _} = plan!(brand!("Galactic"), t, @brew)
      assert {:ok, %{moved: 6, kept: 0}} = Batches.shift(planned, 3)
      assert named(planned, "Brew day").due_on == ~D[2026-11-05]

      {brewed, _} = plan!(brand!("Crusher"), t, ~D[2026-10-03])
      brew = named(brewed, "Brew day")

      {:ok, _} =
        Steps.complete(brew.id, %{"batch_number" => "42", "done_on" => "2026-10-03"}, brewer,
          today: @today
        )

      assert {:ok, %{moved: 5, kept: 1}} = Batches.shift(reload(brewed), 2)
      assert named(brewed, "Brew day").due_on == ~D[2026-10-03]
      assert named(brewed, "FDH").due_on == ~D[2026-10-12]
      assert {:error, :days_invalid} = Batches.shift(planned, 0)
    end

    test "a vessel's tank changes only that part (P32, P33)" do
      fv7 = tank!("FV7")
      s2 = tank!("Serving 2")
      s1 = tank!("Serving 1")

      {batch, _} =
        plan!(brand!("Fest"), lager_template!(), @brew, %{"tank_ids" => [fv7.id, s2.id]})

      assert {:ok, _} = Batches.set_vessel_tank(batch, 1, s1.id)
      assert {:ok, _} = Batches.set_vessel_tank(batch, "0", nil)

      assert Repo.all(
               from(v in Production.BatchVessel,
                 where: v.batch_id == ^batch.id,
                 order_by: v.vessel_index,
                 select: v.tank_id
               )
             ) == [nil, s1.id]

      assert {:error, :not_found} = Batches.set_vessel_tank(batch, 2, s1.id)
      assert {:error, :tank_invalid} = Batches.set_vessel_tank(batch, 1, 999_999)
    end

    test "deleting a brewed batch is refused" do
      {batch, _} = plan!(brand!("Galactic"), ale_template!(), @brew)
      batch |> Ecto.Changeset.change(status: "fermenting", batch_number: "40") |> Repo.update!()
      assert {:error, :not_planned} = Batches.delete_planned(reload(batch))
    end
  end

  describe "the step dialog" do
    setup do
      {batch, _} = plan!(brand!("Galactic"), ale_template!(), @brew)
      %{batch: batch}
    end

    test "addition, temperature, notes, assignee (P41–P44)", %{batch: batch, brewer: brewer} do
      {:ok, _} =
        Steps.update(named(batch, "FDH"), %{"detail" => " #2 ", "notes" => "Watch the glycol"})

      fdh = named(batch, "FDH - #2")
      assert fdh.notes == "Watch the glycol"

      {:ok, _} = Steps.update(named(batch, "Set temp - 58°"), %{"temperature" => 52})
      assert named(batch, "Set temp - 52°")

      assert {:error, cs} = Steps.update(named(batch, "Set temp - 52°"), %{"temperature" => nil})
      assert errors_on(cs).temperature == ["Enter the temperature."]

      # Other steps take no temperature.
      {:ok, carb} = Steps.update(named(batch, "Carb"), %{"temperature" => 40})
      assert is_nil(carb.temperature)

      {:ok, fdh} = Steps.update(fdh, %{"assignee_id" => brewer.id})
      assert fdh.assignee_id == brewer.id

      bartender = user_with_role("employee", "bar")
      assert {:error, cs} = Steps.update(fdh, %{"assignee_id" => bartender.id})
      assert errors_on(cs).assignee_id == ["must be a Brewery member"]

      assert {:ok, _} = Steps.assign([fdh.id, carb.id], nil)
      assert is_nil(named(batch, "FDH - #2").assignee_id)
      assert {:error, :assignee_invalid} = Steps.assign([fdh.id], bartender.id)
    end

    test "renaming a step type renames every batch's step", %{batch: batch} do
      {:ok, _} = Production.update_step_type(type!("FDH"), %{"name" => "Final dry hop"})
      assert named(batch, "Final dry hop")
    end
  end

  describe "the schedule" do
    test "loads the batches reaching into the range, with P-numbers and the next number" do
      t = ale_template!()
      fv3 = tank!("FV3")
      {in_range, _} = plan!(brand!("Galactic"), t, @brew, %{"tank_ids" => [fv3.id]})
      # Ends (its CIP) on Oct 21: reaches into a range from Oct 21.
      {edge, _} = plan!(brand!("Enos"), t, ~D[2026-10-01])
      {_outside, _} = plan!(brand!("Fest"), t, ~D[2027-03-01])

      assert {:ok, sched} = Schedule.load(~D[2026-10-21], ~D[2026-12-01], @today)
      assert Enum.map(sched.batches, & &1.batch.id) == [edge.id, in_range.id]
      assert sched.next_batch_number == "1"
      assert Enum.map(sched.tanks, & &1.name) |> Enum.member?("FV3")
      [_edge, entry] = sched.batches
      assert entry.label == "Galactic P2"
      assert length(entry.steps) == 6

      assert {:error, :range_invalid} = Schedule.load(~D[2026-10-21], ~D[2026-10-20], @today)
      assert {:error, :range_invalid} = Schedule.load(~D[2026-01-01], ~D[2028-01-02], @today)
    end
  end
end
