defmodule RockcutApi.Production.UndoCipsTest do
  @moduledoc """
  D47: Undo (plan decision 5), standalone CIPs (§3.10), sign-offs (§3.9),
  retiring a tank in use (P4), the schedule's statuses and flags, and the
  load time of a busy 12-week schedule.
  """
  use RockcutApi.DataCase

  import RockcutApi.AccountsFixtures

  alias RockcutApi.Production
  alias RockcutApi.Production.{Batches, Cips, Schedule, Signoffs, Step, StepType, Steps, Undo}
  alias RockcutApi.Brewing.{Batch, Brand}

  require Logger

  setup do
    %{brewer: user_with_role("employee", "brewery"), other: user_with_role("employee", "brewery")}
  end

  defp type!(name), do: Repo.get_by!(StepType, name: name)

  defp tank!(name, capacity \\ "20") do
    {:ok, t} = Production.create_tank(%{"name" => name, "capacity_bbl" => capacity})
    t
  end

  # Brew day; FDH day 7; Package day 20 (each after the one before).
  defp template!(name \\ "Ale") do
    {:ok, t} = Production.create_template(%{"name" => name})
    [brew] = t.steps

    {:ok, t} =
      Production.add_step(t, %{
        "step_type_id" => type!("FDH").id,
        "day_offset" => 7,
        "comes_after_id" => brew.id
      })

    fdh = Enum.find(t.steps, &(&1.day_offset == 7))

    {:ok, t} =
      Production.add_step(t, %{
        "step_type_id" => type!("Package").id,
        "day_offset" => 20,
        "comes_after_id" => fdh.id
      })

    t
  end

  defp plan!(template, brew_on, tank_ids, brand \\ "Galactic") do
    brand = Repo.get_by(Brand, name: brand) || Repo.insert!(%Brand{name: brand, status: "active"})

    {:ok, {batch, _}} =
      Batches.plan(%{
        "brand_id" => brand.id,
        "template_id" => template.id,
        "brew_on" => Date.to_iso8601(brew_on),
        "volume_bbl" => "20",
        "tank_ids" => tank_ids
      })

    batch
  end

  defp step_of(batch, name) do
    Repo.all(from(s in Step, where: s.batch_id == ^batch.id, preload: [:step_type, :phase]))
    |> Enum.find(&(Steps.name(&1) == name))
  end

  defp snapshot(batch_id) do
    Repo.all(
      from(s in Step,
        where: s.batch_id == ^batch_id,
        order_by: s.id,
        select: {s.id, s.due_on, s.done_on, s.assignee_id}
      )
    )
  end

  describe "undo" do
    test "puts a move back; a second undo of the same token is gone", %{brewer: b} do
      batch = plan!(template!(), ~D[2026-11-02], [nil])
      before = snapshot(batch.id)
      fdh = step_of(batch, "FDH")

      {:ok, {_, token}} =
        Undo.track(b, %{batches: [batch.id]}, fn ->
          Steps.move([fdh.id], 2, answer: "move_all")
        end)

      assert is_binary(token)
      refute snapshot(batch.id) == before
      assert {:ok, %{batch_ids: [id]}} = Undo.undo(b, token)
      assert id == batch.id
      assert snapshot(batch.id) == before
      assert {:error, :not_found} = Undo.undo(b, token)
    end

    test "puts a planned batch back after a delete, and removes one after a plan", %{brewer: b} do
      t = template!()
      batch = plan!(t, ~D[2026-11-02], [nil])
      before = snapshot(batch.id)

      {:ok, {_, token}} =
        Undo.track(b, %{batches: [batch.id]}, fn -> Batches.delete_planned(batch) end)

      refute Repo.get(Batch, batch.id)
      assert {:ok, _} = Undo.undo(b, token)
      assert Repo.get(Batch, batch.id)
      assert snapshot(batch.id) == before

      brand = Repo.get_by!(Brand, name: "Galactic")

      {:ok, {{planned, _}, token}} =
        Undo.track(
          b,
          %{},
          fn ->
            Batches.plan(%{
              "brand_id" => brand.id,
              "template_id" => t.id,
              "brew_on" => "2026-11-09",
              "volume_bbl" => 10
            })
          end,
          fn {p, _} -> %{batches: [p.id]} end
        )

      assert {:ok, _} = Undo.undo(b, token)
      refute Repo.get(Batch, planned.id)
      assert Repo.aggregate(from(s in Step, where: s.batch_id == ^planned.id), :count) == 0
    end

    test "stale after another change; expired after 2 minutes; only its author", %{
      brewer: b,
      other: o
    } do
      batch = plan!(template!(), ~D[2026-11-02], [nil])
      fdh = step_of(batch, "FDH")

      {:ok, {_, token}} =
        Undo.track(b, %{batches: [batch.id]}, fn -> Steps.update(fdh, %{"notes" => "One"}) end)

      assert {:error, :not_found} = Undo.undo(o, token)
      assert {:error, :undo_expired} = Undo.undo(b, token, DateTime.add(DateTime.utc_now(), 121))

      {:ok, _} = Steps.update(step_of(batch, "FDH"), %{"notes" => "Two"})
      assert {:error, :undo_stale} = Undo.undo(b, token)
      assert step_of(batch, "FDH").notes == "Two"
    end

    test "an error passes through and nothing is recorded", %{brewer: b} do
      batch = plan!(template!(), ~D[2026-11-02], [nil])

      assert {:error, :days_invalid} =
               Undo.track(b, %{batches: [batch.id]}, fn -> Batches.shift(batch, 0) end)

      assert Repo.aggregate(RockcutApi.Production.UndoRecord, :count) == 0
    end
  end

  describe "standalone CIP & Sanitize" do
    test "added as already done: Sani 0 days and the dirty flags clear (P51, P52)", %{brewer: b} do
      s1 = tank!("Serving 1", "30")
      today = ~D[2026-10-21]
      batch = plan!(template!(), Date.add(today, -28), [s1.id], "Crusher")
      brew = step_of(batch, "Brew day")

      {:ok, _} =
        Steps.complete(
          brew.id,
          %{"batch_number" => "43", "done_on" => Date.to_iso8601(brew.due_on)},
          b,
          today: today
        )

      for name <- ["FDH", "Package"] do
        s = step_of(batch, name)

        {:ok, _} =
          Steps.complete(s.id, %{"done_on" => Date.to_iso8601(s.due_on)}, b, today: today)
      end

      # The CIP planned after the Package is removed: nothing cleans the tank.
      Repo.delete!(step_of(batch, "CIP & Sanitize"))

      {:ok, sched} = Schedule.load(Date.add(today, -7), Date.add(today, 35), today)
      status = Enum.find(sched.statuses, &(&1.tank_id == s1.id))
      assert status.line == "Empty · dirty 8 days · no CIP planned"
      assert Enum.any?(sched.flags, &(&1.kind == "dirty_no_cip"))

      assert {:ok, cip} =
               Cips.create(
                 %{"tank_id" => s1.id, "due_on" => "2026-10-21", "already_done" => true},
                 b,
                 today
               )

      assert cip.done_on == today

      {:ok, sched} = Schedule.load(Date.add(today, -7), Date.add(today, 35), today)
      assert Enum.find(sched.statuses, &(&1.tank_id == s1.id)).line == "Sani 0 days"
      refute Enum.any?(sched.flags, &(&1.kind == "dirty_no_cip"))
      assert [%{id: id}] = sched.cips
      assert id == cip.id
    end

    test "a CIP while the beer is in the tank is flagged (P58); move, check off, delete", %{
      brewer: b
    } do
      fv4 = tank!("FV4", "30")
      today = ~D[2026-10-21]
      batch = plan!(template!(), Date.add(today, -5), [fv4.id], "Crusher")
      brew = step_of(batch, "Brew day")

      {:ok, _} =
        Steps.complete(
          brew.id,
          %{"batch_number" => "42", "done_on" => Date.to_iso8601(brew.due_on)},
          b,
          today: today
        )

      {:ok, cip} = Cips.create(%{"tank_id" => fv4.id, "due_on" => "2026-10-22"}, b, today)
      {:ok, sched} = Schedule.load(today, Date.add(today, 30), today)
      assert [%{kind: "cip_with_beer"}] = Enum.filter(sched.flags, &(&1.kind == "cip_with_beer"))

      assert {:error, :done_on_future} =
               Cips.create(
                 %{"tank_id" => fv4.id, "due_on" => "2026-10-25", "already_done" => true},
                 b,
                 today
               )

      assert {:error, :tank_invalid} =
               Cips.create(%{"tank_id" => nil, "due_on" => "2026-10-25"}, b, today)

      # P59: no prompt; nothing follows it.
      assert {:ok, _} = Steps.move([cip.id], 2)
      assert Repo.get!(Step, cip.id).due_on == ~D[2026-10-24]

      {:ok, cip} =
        Cips.update(Repo.get!(Step, cip.id), %{"notes" => "Caustic", "assignee_id" => b.id})

      assert {cip.notes, cip.assignee_id} == {"Caustic", b.id}
      assert {:ok, _} = Cips.delete(cip)
    end
  end

  describe "sign-offs" do
    test "sign, replace, remove", %{brewer: b, other: o} do
      {:ok, s} =
        Signoffs.sign_off(
          %{"key" => "no_tank:1.1", "signature" => "abc", "note" => "Decided on brew morning."},
          b
        )

      {:ok, s2} = Signoffs.sign_off(%{"key" => "no_tank:1.1", "signature" => "def"}, o)
      assert s2.id == s.id
      assert {s2.signature, s2.user_id} == {"def", o.id}

      assert {:error, cs} =
               Signoffs.sign_off(
                 %{"key" => "x", "signature" => "y", "note" => String.duplicate("n", 501)},
                 b
               )

      assert errors_on(cs).note
      assert {:ok, _} = Signoffs.remove(s2)
      assert Signoffs.list() == []
    end
  end

  test "a tank with unfinished steps can't be retired; the batch is named (P4)" do
    fv7 = tank!("FV7")
    batch = plan!(template!(), ~D[2026-11-02], [fv7.id], "Fest")
    assert {:error, :tank_in_use, [%{id: id, label: "Fest P1"}]} = Production.retire_tank(fv7)
    assert id == batch.id

    # A phase marker left (it can't be checked off) doesn't hold the tank.
    lag = Repo.get_by!(RockcutApi.Production.Phase, name: "Lag")
    Repo.insert!(%Step{batch_id: batch.id, phase_id: lag.id, due_on: ~D[2026-11-03]})

    Repo.update_all(
      from(s in Step, where: s.batch_id == ^batch.id and not is_nil(s.step_type_id)),
      set: [done_on: ~D[2026-11-02]]
    )

    assert {:ok, retired} = Production.retire_tank(Production.get_tank(fv7.id))
    {:ok, _} = Production.restore_tank(retired)
    Repo.update_all(from(s in Step, where: s.batch_id == ^batch.id), set: [done_on: nil])

    # Once its part is off the tank, it can go.
    {:ok, _} = Batches.set_vessel_tank(batch, 0, nil)
    assert {:ok, _} = Production.retire_tank(Production.get_tank(fv7.id))
  end

  test "the old Batches page and the Brewery Dashboard don't list schedule batches (lead decisions 2)" do
    scheduled = plan!(template!(), ~D[2026-11-02], [nil])
    brand = Repo.get_by!(Brand, name: "Galactic")
    old = Repo.insert!(%Batch{brand_id: brand.id, batch_number: "7", status: "fermenting"})
    assert Enum.map(RockcutApi.Brewing.list_batches(), & &1.id) == [old.id]
    refute scheduled.id == old.id
  end

  @tag timeout: 120_000
  test "performance: 12 weeks, 10 tanks, 30 batches load in under 300 ms" do
    today = ~D[2026-10-21]
    tanks = for i <- 1..10, do: tank!("FV#{i}", "30")

    # About as big as the seeded templates: 20 steps, each after the one before.
    t =
      Enum.reduce(1..15, template!(), fn i, t ->
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

    for i <- 0..29 do
      plan!(
        t,
        Date.add(today, -28 + i * 2),
        [Enum.at(tanks, rem(i, 10)).id],
        "Brand #{rem(i, 6)}"
      )
    end

    {:ok, _} = Schedule.load(today, Date.add(today, 84), today)
    {micros, {:ok, sched}} = :timer.tc(fn -> Schedule.load(today, Date.add(today, 84), today) end)

    Logger.info(
      "D47 schedule load: #{div(micros, 1000)} ms, #{length(sched.batches)} batches, #{length(sched.flags)} flags"
    )

    IO.puts(
      "\n[perf] D47 schedule load (12 weeks, 10 tanks, 30 batches): #{div(micros, 1000)} ms"
    )

    assert length(sched.batches) >= 25
    assert micros < 300_000
  end
end
