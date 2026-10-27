defmodule RockcutApi.Production.PencilledTest do
  @moduledoc """
  D49 task 2: pencilled batches (§3.12b, P130–P134): X-numbers, schedule /
  pencil in and their Undo, muted flags, `flag_muted`, `schedule_first`,
  and split parts following their parent. The board side (no tasks, P135)
  is task 3's.
  """
  use RockcutApi.DataCase

  import RockcutApi.AccountsFixtures
  import RockcutApi.ProductionFixtures

  alias RockcutApi.Production.{Batches, Schedule, Signoffs, Splits, Steps, Undo}

  @today ~D[2026-10-21]

  setup do
    %{brewer: user_with_role("employee", "brewery"), template: ale_template!()}
  end

  defp plan(ctx, brand, brew_on, extra \\ %{}),
    do: plan!(brand!(brand), ctx.template, brew_on, extra)

  defp pencilled(ctx, brand, brew_on, extra \\ %{}),
    do: plan(ctx, brand, brew_on, Map.put(extra, "pencilled", true))

  defp schedule do
    {:ok, s} = Schedule.load(Date.add(@today, -30), Date.add(@today, 90), @today)
    s
  end

  defp label(batch) do
    [entry] = Schedule.batches([batch.id])
    entry.label
  end

  defp flags_of(sched, batch), do: Enum.filter(sched.flags, &(batch.id in &1.batch_ids))

  defp overlaps(flags), do: Enum.filter(flags, &(&1.kind == "tank_overlap"))

  describe "X-numbers" do
    test "a sequence of their own, by brew date; schedule and pencil in renumber both", ctx do
      p1 = plan(ctx, "Galactic", ~D[2026-11-02])
      x_late = pencilled(ctx, "Oktoberfest", ~D[2026-11-20])
      x_early = pencilled(ctx, "Fest", ~D[2026-11-05])
      p2 = plan(ctx, "Crusher", ~D[2026-11-10])

      assert Batches.p_numbers() == %{
               p1.id => "P1",
               p2.id => "P2",
               x_early.id => "X1",
               x_late.id => "X2"
             }

      assert label(x_late) == "Oktoberfest X2"
      assert reload(x_late).pencilled

      # P132: scheduled, X2 takes the next P-number by date; P2 moves up.
      {:ok, {_, renumbered}} = Batches.schedule(x_early)

      assert Batches.p_numbers() == %{
               p1.id => "P1",
               x_early.id => "P2",
               p2.id => "P3",
               x_late.id => "X1"
             }

      assert %{from: "X1", to: "P2"} in Enum.map(renumbered, &Map.take(&1, [:from, :to]))
      assert %{from: "P2", to: "P3"} in Enum.map(renumbered, &Map.take(&1, [:from, :to]))

      # P133: pencilled in again.
      {:ok, _} = Batches.pencil(p1)
      assert Batches.p_numbers()[p1.id] == "X1"
      assert Batches.p_numbers()[x_late.id] == "X2"
      assert Batches.p_numbers()[x_early.id] == "P1"
    end

    test "Undo puts back schedule and pencil in", ctx do
      x = pencilled(ctx, "Oktoberfest", ~D[2026-11-05])

      {:ok, {_, token}} =
        Undo.track(ctx.brewer, %{batches: [x.id]}, fn -> Batches.schedule(x) end)

      refute reload(x).pencilled
      {:ok, _} = Undo.undo(ctx.brewer, token)
      assert reload(x).pencilled

      p = plan(ctx, "Galactic", ~D[2026-11-02])
      {:ok, {_, token}} = Undo.track(ctx.brewer, %{batches: [p.id]}, fn -> Batches.pencil(p) end)
      assert reload(p).pencilled
      {:ok, _} = Undo.undo(ctx.brewer, token)
      refute reload(p).pencilled
    end

    test "pencil in is refused once a step is done; only a planned batch", ctx do
      p = plan(ctx, "Galactic", ~D[2026-10-15])
      done!(named(p, "FDH"))
      assert {:error, :step_done} = Batches.pencil(p)

      brewed = plan(ctx, "Crusher", ~D[2026-10-10])

      {:ok, _} =
        Steps.complete(named(brewed, "Brew day").id, %{"batch_number" => "40"}, ctx.brewer,
          today: ~D[2026-10-10]
        )

      assert {:error, :not_planned} = Batches.schedule(brewed)
    end
  end

  describe "brew day (P134)" do
    test "a check-off on a pencilled batch is refused until it's scheduled", ctx do
      x = pencilled(ctx, "Oktoberfest", ~D[2026-10-20])
      brew = named(x, "Brew day")

      assert {:error, :schedule_first} =
               Steps.complete(brew.id, %{}, ctx.brewer, today: @today, preview: true)

      assert {:error, :schedule_first} =
               Steps.complete(brew.id, %{"batch_number" => "41"}, ctx.brewer, today: @today)

      assert {:error, :schedule_first} = Steps.complete(named(x, "FDH").id, %{}, ctx.brewer)
      assert is_nil(named(x, "Brew day").done_on)

      {:ok, _} = Batches.schedule(x)

      assert {:ok, _} =
               Steps.complete(
                 brew.id,
                 %{"batch_number" => "41", "answer" => "move_only"},
                 ctx.brewer,
                 today: brew.due_on
               )
    end
  end

  describe "flags" do
    test "P130: no 'No tank assigned' flag for a pencilled batch in Unassigned", ctx do
      x = pencilled(ctx, "Oktoberfest", Date.add(@today, 2))
      p = plan(ctx, "Galactic", Date.add(@today, 2))
      sched = schedule()
      assert flags_of(sched, x) == []
      assert [%{kind: "no_tank", muted: false}] = flags_of(sched, p)
    end

    test "P131: overlapping a scheduled batch: its own flag muted, the scheduled one's not",
         ctx do
      fv6 = tank!("FV6")
      p = plan(ctx, "Galactic", ~D[2026-11-02], %{"tank_ids" => [fv6.id]})
      x = pencilled(ctx, "Oktoberfest", ~D[2026-11-10], %{"tank_ids" => [fv6.id]})

      sched = schedule()
      assert [%{muted: true} = muted] = overlaps(flags_of(sched, x))
      assert [%{muted: false} = open] = overlaps(flags_of(sched, p))
      # Every flag about the pencilled batch is muted (its dirty fill too).
      assert Enum.all?(flags_of(sched, x), & &1.muted)
      assert muted.key == open.key <> ":pencilled"
      # Muted ones are listed last.
      assert sched.flags |> Enum.drop_while(&(not &1.muted)) |> Enum.all?(& &1.muted)

      assert {:error, :flag_muted} =
               Signoffs.sign_off(
                 %{"key" => muted.key, "signature" => muted.signature},
                 ctx.brewer
               )

      assert {:ok, _} =
               Signoffs.sign_off(%{"key" => open.key, "signature" => open.signature}, ctx.brewer)

      # P132: scheduled, one unmuted overlap flag again.
      {:ok, _} = Batches.schedule(x)
      assert [%{muted: false, key: key}] = overlaps(flags_of(schedule(), x))
      assert key == open.key
    end

    test "two pencilled batches overlapping: one muted flag", ctx do
      fv6 = tank!("FV6")
      a = pencilled(ctx, "Galactic", ~D[2026-11-02], %{"tank_ids" => [fv6.id]})
      b = pencilled(ctx, "Oktoberfest", ~D[2026-11-10], %{"tank_ids" => [fv6.id]})
      assert [%{muted: true, batch_ids: ids}] = overlaps(schedule().flags)
      assert Enum.sort(ids) == Enum.sort([a.id, b.id])
    end
  end

  describe "split parts" do
    test "follow their parent: pencilled, X1.1 / X1.2, scheduled together from a part", ctx do
      [fv2, fv6] = [tank!("FV2"), tank!("FV6")]
      x = pencilled(ctx, "Oktoberfest", ~D[2026-11-02], %{"tank_ids" => [fv2.id]})

      {:ok, %{part_ids: [p1, p2]}} =
        Splits.split(reload(x), %{
          "due_on" => "2026-11-13",
          "parts" => [
            %{"stays" => true, "volume_bbl" => "12"},
            %{"tank_id" => fv6.id, "volume_bbl" => "8"}
          ]
        })

      part = Repo.get!(RockcutApi.Brewing.Batch, p2)
      assert part.pencilled
      assert label(part) == "Oktoberfest X1.2"

      {:ok, _} = Batches.schedule(part)
      refute Enum.any?([x.id, p1, p2], &Repo.get!(RockcutApi.Brewing.Batch, &1).pencilled)
      assert label(part) == "Oktoberfest P1.2"
    end
  end
end
