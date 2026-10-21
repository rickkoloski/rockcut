defmodule RockcutApi.ProductionTest do
  @moduledoc "D46: tanks, out-of-service periods, phases & step types, templates (spec §3.2–§3.4)."
  use RockcutApi.DataCase

  import RockcutApi.AccountsFixtures

  alias RockcutApi.Production
  alias RockcutApi.Production.{Phase, StepType}

  @today ~D[2026-10-20]

  defp tank!(name, attrs \\ %{}) do
    {:ok, tank} =
      Production.create_tank(Map.merge(%{"name" => name, "capacity_bbl" => "20"}, attrs))

    tank
  end

  defp type!(name), do: Repo.get_by!(StepType, name: name)
  defp phase!(name), do: Repo.get_by!(Phase, name: name)

  defp template!(name \\ "Ale") do
    {:ok, t} = Production.create_template(%{"name" => name})
    t
  end

  defp add!(t, attrs) do
    {:ok, t} = Production.add_step(t, attrs)
    t
  end

  defp step(t, name), do: Enum.find(t.steps, &(Production.step_name(&1) == name))

  defp linked?(t, from, to),
    do: Enum.any?(t.links, &(&1.from_step_id == from.id and &1.to_step_id == to.id))

  defp link(t, from, to),
    do: Enum.find(t.links, &(&1.from_step_id == from.id and &1.to_step_id == to.id))

  defp codes(t), do: Enum.map(t.issues, & &1.code)

  describe "seeded lists" do
    test "the nine phases and nineteen step types, in order" do
      assert Enum.map(Production.list_phases(), & &1.name) == [
               "Brew day",
               "Lag",
               "Fermentation",
               "Diacetyl rest",
               "Crash",
               "Lagering",
               "Conditioning",
               "Carbonating",
               "Packaging"
             ]

      types = Production.list_step_types()
      assert length(types) == 19
      assert hd(types).name == "Brew day"
      assert List.last(types).name == "Package"

      built_in = types |> Enum.filter(& &1.built_in) |> Enum.map(& &1.name) |> Enum.sort()

      assert built_in ==
               Enum.sort([
                 "Brew day",
                 "Set temp",
                 "Transfer",
                 "Filter",
                 "Split",
                 "CIP & Sanitize",
                 "Package"
               ])

      assert type!("Carb").starts_phase_id == phase!("Carbonating").id
      assert type!("Package").starts_phase_id == phase!("Packaging").id
      assert type!("PDH").full_name == "Primary Dry Hop"
      assert type!("Amylo").full_name == "Amyloglucosidase (AMG)"
    end
  end

  describe "tanks" do
    test "names are unique ignoring case (P3)" do
      tank!("FV1")
      assert {:error, cs} = Production.create_tank(%{"name" => "fv1", "capacity_bbl" => 20})
      assert "A tank named FV1 already exists." in errors_on(cs).name
    end

    test "a retired tank's name is taken too, and says so" do
      {:ok, _} = Production.retire_tank(tank!("FV9"))
      assert {:error, cs} = Production.create_tank(%{"name" => "FV9", "capacity_bbl" => 20})
      assert [msg] = errors_on(cs).name
      assert msg =~ "retired tank named FV9"
    end

    test "capacity must be over 0 and the kind and location from the lists" do
      assert {:error, cs} =
               Production.create_tank(%{
                 "name" => "X",
                 "capacity_bbl" => 0,
                 "kind" => "barrel",
                 "location" => "roof"
               })

      assert Map.keys(errors_on(cs)) |> Enum.sort() == [:capacity_bbl, :kind, :location]
    end

    test "new tanks go last; reorder takes exactly the active ids (P1, P2)" do
      a = tank!("A")
      b = tank!("B")
      c = tank!("C")
      assert Enum.map(Production.list_tanks(), & &1.name) == ~w(A B C)

      {:ok, _} = Production.reorder_tanks([c.id, a.id, b.id])
      assert Enum.map(Production.list_tanks(), & &1.name) == ~w(C A B)
      assert {:error, :invalid_order} = Production.reorder_tanks([a.id, b.id])
    end

    test "retire leaves the order; restore comes back at the bottom (P5)" do
      a = tank!("A")
      b = tank!("B")
      tank!("C")

      {:ok, retired} = Production.retire_tank(a)
      assert retired.retired_at
      assert Production.batches_in_tank(b) == []

      assert Enum.map(Production.list_tanks(), &{&1.name, &1.position}) ==
               [{"B", 1}, {"C", 2}, {"A", 0}]

      {:ok, _} = Production.restore_tank(retired)
      assert Enum.map(Production.list_tanks(), & &1.name) == ~w(B C A)
    end
  end

  describe "out-of-service periods" do
    setup do
      %{tank: tank!("Serving 2"), user: user_with_role("employee", "brewery")}
    end

    test "overlapping periods are refused, naming the other (P9)", %{tank: tank, user: user} do
      {:ok, first} =
        Production.create_outage(
          tank,
          %{"starts_on" => "2026-10-27", "ends_on" => "2026-11-02", "reason" => "Gasket"},
          user
        )

      assert {:error, :outage_overlap, other} =
               Production.create_outage(tank, %{"starts_on" => "2026-11-02"}, user)

      assert other.id == first.id
      assert Production.period_label(other) == "Tue Oct 27 – Mon Nov 2"

      # The day after is fine; an open-ended one before it overlaps.
      assert {:ok, _} =
               Production.create_outage(
                 tank,
                 %{"starts_on" => "2026-11-03", "ends_on" => "2026-11-04"},
                 user
               )

      assert {:error, :outage_overlap, _} =
               Production.create_outage(tank, %{"starts_on" => "2026-10-01"}, user)

      # Another tank is independent.
      assert {:ok, _} =
               Production.create_outage(tank!("FV1"), %{"starts_on" => "2026-10-28"}, user)
    end

    test "an update doesn't overlap itself", %{tank: tank, user: user} do
      {:ok, o} =
        Production.create_outage(
          tank,
          %{"starts_on" => "2026-10-27", "ends_on" => "2026-10-30"},
          user
        )

      assert {:ok, o} = Production.update_outage(o, %{"ends_on" => "2026-11-05"})
      assert o.ends_on == ~D[2026-11-05]
      assert {:ok, o} = Production.update_outage(o, %{"ends_on" => nil})
      assert is_nil(o.ends_on)
      assert Production.period_label(o) == "Tue Oct 27 – until further notice"
    end

    test "the last day can't come before the first; the reason is ≤ 80", %{tank: tank, user: user} do
      assert {:error, cs} =
               Production.create_outage(
                 tank,
                 %{
                   "starts_on" => "2026-10-27",
                   "ends_on" => "2026-10-26",
                   "reason" => String.duplicate("x", 81)
                 },
                 user
               )

      assert Map.keys(errors_on(cs)) |> Enum.sort() == [:ends_on, :reason]
    end

    test "Back in service today ends a current period yesterday (P8)", %{tank: tank, user: user} do
      {:ok, o} = Production.create_outage(tank, %{"starts_on" => "2026-10-15"}, user)
      assert Production.outage_state(o, @today) == :now
      assert {:ok, o} = Production.end_outage_today(o, @today)
      assert o.ends_on == ~D[2026-10-19]
      assert Production.outage_state(o, @today) == :past
    end

    test "Back in service today deletes a period that starts today", %{tank: tank, user: user} do
      {:ok, o} =
        Production.create_outage(
          tank,
          %{"starts_on" => "2026-10-20", "ends_on" => "2026-10-25"},
          user
        )

      assert {:ok, :deleted} = Production.end_outage_today(o, @today)
      assert Production.get_outage(o.id) == nil
    end

    test "only a current period can end today", %{tank: tank, user: user} do
      {:ok, o} = Production.create_outage(tank, %{"starts_on" => "2026-10-27"}, user)
      assert Production.outage_state(o, @today) == :coming
      assert {:error, :outage_not_current} = Production.end_outage_today(o, @today)
    end
  end

  describe "phases and step types" do
    test "a new step type is plain, retirable and restorable (P11, P12)" do
      {:ok, t} =
        Production.create_step_type(%{
          "name" => "Hop stand check",
          "behavior" => "transfer",
          "built_in" => true
        })

      assert t.behavior == "plain"
      refute t.built_in
      assert List.last(Enum.reject(Production.list_step_types(), & &1.retired_at)).id == t.id

      {:ok, t} = Production.retire_step_type(t)
      assert t.retired_at
      {:ok, t} = Production.restore_step_type(t)
      assert is_nil(t.retired_at)
    end

    test "built-in step types can be renamed but not retired (P13)" do
      transfer = type!("Transfer")
      assert {:error, :built_in} = Production.retire_step_type(transfer)
      assert {:ok, renamed} = Production.update_step_type(transfer, %{"name" => "Move"})
      assert renamed.name == "Move"
      assert renamed.behavior == "transfer"
    end

    test "step type names are unique ignoring case" do
      assert {:error, cs} = Production.create_step_type(%{"name" => "fdh"})
      assert "A step type named FDH already exists." in errors_on(cs).name
    end

    test "a step type starts only an active phase" do
      {:ok, p} = Production.create_phase(%{"name" => "Souring", "color" => "rose"})
      {:ok, p} = Production.retire_phase(p)

      assert {:error, cs} =
               Production.create_step_type(%{"name" => "Pitch lacto", "starts_phase_id" => p.id})

      assert errors_on(cs).starts_phase_id == ["Pick a phase."]
    end

    test "phases take a palette color" do
      assert {:error, cs} = Production.create_phase(%{"name" => "Souring", "color" => "#ff0000"})
      assert errors_on(cs).color
      assert {:ok, p} = Production.create_phase(%{"name" => "Souring", "color" => "slate"})
      assert {:ok, p} = Production.update_phase(p, %{"color" => "rose", "name" => "Sour"})
      assert {p.name, p.color} == {"Sour", "rose"}
    end
  end

  describe "templates" do
    test "a new template starts with its Brew day at day 0, first tank" do
      t = template!()
      assert [brew] = t.steps
      assert brew.step_type.behavior == "brew"
      assert {brew.day_offset, brew.vessel_index} == {0, 0}
      assert brew.phase_id == phase!("Brew day").id
      assert codes(t) == ["vessel_has_no_exit"]
      assert hd(t.issues).message == "The first tank has no Package, Split or Transfer."
    end

    test "Brew day can't be removed, moved or added again" do
      t = template!()
      [brew] = t.steps
      assert {:error, :brew_day_fixed} = Production.remove_step(t, brew)
      assert {:error, :brew_day_fixed} = Production.update_step(t, brew, %{"day_offset" => 1})

      assert {:ok, _} =
               Production.update_step(t, brew, %{"temperature" => 68, "notes" => "Pitch at 66"})

      assert {:error, :one_brew_day} =
               Production.add_step(t, %{"step_type_id" => type!("Brew day").id, "day_offset" => 3})
    end

    test "a step defaults its phase and task list from its type; a marker needs a phase" do
      t = template!()
      t = add!(t, %{"step_type_id" => type!("Carb").id, "day_offset" => 20})
      carb = step(t, "Carb")
      assert carb.phase_id == phase!("Carbonating").id
      assert carb.on_task_list

      assert {:error, cs} = Production.add_step(t, %{"day_offset" => 2})
      assert errors_on(cs).phase_id == ["Pick a phase."]

      t = add!(t, %{"phase_id" => phase!("Lag").id, "day_offset" => 1})
      lag = step(t, "Lag")
      refute lag.on_task_list
      assert is_nil(lag.step_type_id)
    end

    test "Set temp needs a temperature in 28–80°F; other steps drop one" do
      t = template!()

      assert {:error, cs} =
               Production.add_step(t, %{"step_type_id" => type!("Set temp").id, "day_offset" => 5})

      assert errors_on(cs).temperature == ["Enter the temperature."]

      assert {:error, cs} =
               Production.add_step(t, %{
                 "step_type_id" => type!("Set temp").id,
                 "day_offset" => 5,
                 "temperature" => 90
               })

      assert errors_on(cs).temperature

      t =
        add!(t, %{"step_type_id" => type!("Set temp").id, "day_offset" => 5, "temperature" => 52})

      t =
        add!(t, %{
          "step_type_id" => type!("Dry hop").id,
          "day_offset" => 6,
          "temperature" => 52,
          "detail" => "#2"
        })

      assert step(t, "Set temp - 52°")
      assert is_nil(step(t, "Dry hop - #2").temperature)
    end

    test "a retired step type can't be added; the template keeps its step (P12)" do
      t = template!()
      t = add!(t, %{"step_type_id" => type!("Fining").id, "day_offset" => 10})
      {:ok, _} = Production.retire_step_type(type!("Fining"))

      assert {:error, :retired} =
               Production.add_step(t, %{"step_type_id" => type!("Fining").id, "day_offset" => 11})

      assert step(Production.get_template(t.id), "Fining")
    end

    test "a Transfer starts a later tank and adds a CIP for the tank it leaves (P14)" do
      t = template!()

      assert {:error, :transfer_not_new_tank} =
               Production.add_step(t, %{
                 "step_type_id" => type!("Transfer").id,
                 "day_offset" => 35
               })

      t =
        add!(t, %{"step_type_id" => type!("Transfer").id, "day_offset" => 35, "vessel_index" => 1})

      xfer = step(t, "Transfer")
      cip = step(t, "CIP & Sanitize")
      assert {cip.day_offset, cip.vessel_index} == {35, 0}
      assert linked?(t, xfer, cip)

      # Removing the Transfer removes the CIP it set up.
      {:ok, t} = Production.remove_step(t, xfer)
      assert Enum.map(t.steps, &Production.step_name/1) == ["Brew day"]
    end

    test "links refuse cycles and backwards days; slot-in replaces the direct link" do
      t = template!()
      [brew] = t.steps

      t =
        add!(t, %{
          "step_type_id" => type!("FDH").id,
          "day_offset" => 13,
          "comes_after_id" => brew.id
        })

      fdh = step(t, "FDH")

      t =
        add!(t, %{
          "step_type_id" => type!("Carb").id,
          "day_offset" => 20,
          "comes_after_id" => fdh.id
        })

      carb = step(t, "Carb")

      assert {:error, :link_cycle} =
               Production.add_link(t, %{"from_step_id" => carb.id, "to_step_id" => brew.id})

      assert {:error, :link_cycle} =
               Production.add_link(t, %{"from_step_id" => fdh.id, "to_step_id" => fdh.id})

      t = add!(t, %{"step_type_id" => type!("Gravity check").id, "day_offset" => 10})
      gc = step(t, "Gravity check")

      assert {:error, :link_order} =
               Production.add_link(t, %{"from_step_id" => fdh.id, "to_step_id" => gc.id})

      assert {:error, :link_exists} =
               Production.add_link(t, %{"from_step_id" => fdh.id, "to_step_id" => carb.id})

      # Slot in Amylo between FDH and Carb.
      t =
        add!(t, %{
          "step_type_id" => type!("Amylo").id,
          "day_offset" => 15,
          "comes_after_id" => fdh.id,
          "leads_to_id" => carb.id,
          "leads_to_answer" => "move_only"
        })

      amylo = step(t, "Amylo")
      assert linked?(t, fdh, amylo)
      assert link(t, amylo, carb).default_answer == "move_only"
      refute linked?(t, fdh, carb)

      # A day change that would run a link backwards is refused.
      assert {:error, :link_order} = Production.update_step(t, amylo, %{"day_offset" => 21})
    end

    test "removing a step passes its links through" do
      t = template!()
      [brew] = t.steps

      t =
        add!(t, %{
          "step_type_id" => type!("Amylo").id,
          "day_offset" => 9,
          "comes_after_id" => brew.id
        })

      amylo = step(t, "Amylo")

      t =
        add!(t, %{
          "step_type_id" => type!("FDH").id,
          "day_offset" => 11,
          "comes_after_id" => amylo.id,
          "comes_after_answer" => "move_only"
        })

      fdh = step(t, "FDH")
      {:ok, t} = Production.remove_step(t, amylo)
      assert link(t, brew, fdh).default_answer == "move_only"
      assert length(t.links) == 1
    end

    test "a link's default answer can change (P16)" do
      t = template!()
      [brew] = t.steps

      t =
        add!(t, %{
          "step_type_id" => type!("Carb").id,
          "day_offset" => 20,
          "comes_after_id" => brew.id
        })

      l = hd(t.links)
      assert l.default_answer == "move_all"
      {:ok, t} = Production.update_link(t, l, %{"default_answer" => "move_only"})
      assert hd(t.links).default_answer == "move_only"
      assert {:error, _} = Production.update_link(t, hd(t.links), %{"default_answer" => "maybe"})
    end

    test "a ramp is one chained Set temp per temperature, ending on the target (P15)" do
      assert Production.ramp_temperatures(58, 32, 10) == {:ok, [58, 48, 38, 32]}
      assert Production.ramp_temperatures(40, 60, 10) == {:ok, [40, 50, 60]}
      assert Production.ramp_temperatures(40, 40, 10) == {:error, :ramp_flat}

      t = template!()
      [brew] = t.steps

      t =
        add!(t, %{
          "step_type_id" => type!("FDH").id,
          "day_offset" => 13,
          "comes_after_id" => brew.id
        })

      fdh = step(t, "FDH")

      t =
        add!(t, %{
          "phase_id" => phase!("Conditioning").id,
          "day_offset" => 22,
          "comes_after_id" => fdh.id
        })

      cond_marker = step(t, "Conditioning")

      {:ok, t} =
        Production.add_ramp(t, %{
          "start" => 58,
          "target" => 32,
          "change_per_day" => 10,
          "first_day" => 18,
          "comes_after_id" => fdh.id,
          "leads_to_id" => cond_marker.id
        })

      ramp = Enum.filter(t.steps, & &1.ramp_group)

      assert Enum.map(ramp, &{&1.day_offset, &1.temperature}) == [
               {18, 58},
               {19, 48},
               {20, 38},
               {21, 32}
             ]

      assert ramp |> Enum.map(& &1.ramp_group) |> Enum.uniq() |> length() == 1
      assert hd(ramp).phase_id == phase!("Crash").id
      assert Enum.all?(tl(ramp), &is_nil(&1.phase_id))

      for [a, b] <- Enum.chunk_every(ramp, 2, 1, :discard),
          do: assert(link(t, a, b).default_answer == "move_all")

      assert linked?(t, fdh, hd(ramp))
      assert linked?(t, List.last(ramp), cond_marker)
      refute linked?(t, fdh, cond_marker)

      assert {:error, :ramp_invalid} =
               Production.add_ramp(t, %{
                 "start" => 58,
                 "target" => 20,
                 "change_per_day" => 10,
                 "first_day" => 1
               })
    end

    test "issues: a complete one-tank template, then the Package removed (P17)" do
      t = template!()
      [brew] = t.steps

      t =
        add!(t, %{
          "step_type_id" => type!("Package").id,
          "day_offset" => 25,
          "comes_after_id" => brew.id
        })

      t = add!(t, %{"step_type_id" => type!("CIP & Sanitize").id, "day_offset" => 25})
      assert t.issues == []

      {:ok, t} = Production.remove_step(t, step(t, "Package"))
      assert codes(t) == ["vessel_has_no_exit"]
    end

    test "issues: a later tank needs its Transfer and its own exit" do
      t = template!()

      t =
        add!(t, %{"step_type_id" => type!("Transfer").id, "day_offset" => 20, "vessel_index" => 1})

      t = add!(t, %{"step_type_id" => type!("Carb").id, "day_offset" => 22, "vessel_index" => 1})
      xfer = step(t, "Transfer")

      assert Enum.sort(codes(t)) == ["vessel_has_no_exit"]

      assert hd(t.issues).message ==
               "The tank after transfer 1 has no Package, Split or Transfer."

      # A tank whose Transfer was removed: nothing starts it any more.
      {:ok, t} = Production.remove_step(t, xfer)
      assert "vessel_not_started" in codes(t)

      t =
        add!(t, %{"step_type_id" => type!("Transfer").id, "day_offset" => 20, "vessel_index" => 1})

      t =
        add!(t, %{"step_type_id" => type!("Filter").id, "day_offset" => 25, "vessel_index" => 2})

      t =
        add!(t, %{"step_type_id" => type!("Package").id, "day_offset" => 32, "vessel_index" => 2})

      assert t.issues == []
      assert Production.vessel_label(2) == "The tank after transfer 2"
    end

    test "a Transfer/Filter goes into a new tank only (QA M1)" do
      t = template!()
      transfer = type!("Transfer").id
      filter = type!("Filter").id

      t = add!(t, %{"step_type_id" => transfer, "day_offset" => 35, "vessel_index" => 1})
      t = add!(t, %{"step_type_id" => type!("Carb").id, "day_offset" => 36, "vessel_index" => 1})

      # Into the tank it's already in, or skipping a tank: refused.
      for {k, type} <- [{1, transfer}, {1, filter}, {3, transfer}, {0, filter}] do
        assert {:error, :transfer_not_new_tank} =
                 Production.add_step(t, %{
                   "step_type_id" => type,
                   "day_offset" => 39,
                   "vessel_index" => k
                 }),
               "vessel #{k}"
      end

      # Before the first transfer: transfers stay in day order (N1).
      assert {:error, {:transfer_order, :before, 35}} =
               Production.add_step(t, %{
                 "step_type_id" => filter,
                 "day_offset" => 30,
                 "vessel_index" => 1
               })

      # Into tank 2: accepted, and its CIP is for tank 1, the tank it leaves.
      t = add!(t, %{"step_type_id" => filter, "day_offset" => 39, "vessel_index" => 2})
      second = step(t, "Filter")

      assert Enum.filter(t.steps, &(Production.step_name(&1) == "CIP & Sanitize"))
             |> Enum.map(&{&1.day_offset, &1.vessel_index}) == [{35, 0}, {39, 1}]

      # A change that would point it back into tank 1 is refused too.
      assert {:error, :transfer_not_new_tank} =
               Production.update_step(t, second, %{"vessel_index" => 1})

      # Two transfers the same day, one after the other: 0 → 1 → 2.
      u = template!("Same day")
      u = add!(u, %{"step_type_id" => transfer, "day_offset" => 10, "vessel_index" => 1})
      u = add!(u, %{"step_type_id" => filter, "day_offset" => 10, "vessel_index" => 2})
      assert {:ok, _} = Production.update_step(u, step(u, "Transfer"), %{"notes" => "fine"})
    end

    test "a step or ramp in a tank no Transfer/Filter starts is refused (QA minor 4)" do
      t = template!()

      assert {:error, :no_such_tank} =
               Production.add_step(t, %{
                 "step_type_id" => type!("Carb").id,
                 "day_offset" => 5,
                 "vessel_index" => 5
               })

      assert {:error, :no_such_tank} =
               Production.add_step(t, %{
                 "phase_id" => phase!("Lag").id,
                 "day_offset" => 1,
                 "vessel_index" => 1
               })

      assert {:error, :no_such_tank} =
               Production.add_ramp(t, %{
                 "start" => 58,
                 "target" => 40,
                 "change_per_day" => 10,
                 "first_day" => 10,
                 "vessel_index" => 1
               })

      t = add!(t, %{"step_type_id" => type!("Carb").id, "day_offset" => 5})

      assert {:error, :no_such_tank} =
               Production.update_step(t, step(t, "Carb"), %{"vessel_index" => 1})

      t =
        add!(t, %{"step_type_id" => type!("Transfer").id, "day_offset" => 20, "vessel_index" => 1})

      assert {:ok, _} =
               Production.update_step(t, step(t, "Carb"), %{
                 "vessel_index" => 1,
                 "day_offset" => 21
               })
    end

    test "names are trimmed and NFKC-normalized before the uniqueness check; capacity under 10,000 (QA minor 8)" do
      tank!("FV1")
      assert {:error, cs} = Production.create_tank(%{"name" => " Ｆv1 ", "capacity_bbl" => 20})
      assert "A tank named FV1 already exists." in errors_on(cs).name

      assert {:error, cs} = Production.create_tank(%{"name" => "Big", "capacity_bbl" => 10_000})
      assert errors_on(cs).capacity_bbl == ["Capacity must be under 10,000 bbl."]

      assert {:error, cs} = Production.create_step_type(%{"name" => "ＦＤＨ"})
      assert "A step type named FDH already exists." in errors_on(cs).name

      {:ok, t} = Production.create_tank(%{"name" => "Ｓｅｒｖｉｎｇ 9", "capacity_bbl" => 20})
      assert t.name == "Serving 9"
    end

    test "duplicate is a deep copy (P18)" do
      t = template!("Standard ale")
      [brew] = t.steps

      t =
        add!(t, %{
          "step_type_id" => type!("FDH").id,
          "day_offset" => 13,
          "comes_after_id" => brew.id
        })

      {:ok, t} =
        Production.add_ramp(t, %{
          "start" => 50,
          "target" => 40,
          "change_per_day" => 10,
          "first_day" => 15,
          "comes_after_id" => step(t, "FDH").id
        })

      {:ok, copy} = Production.duplicate_template(t)
      assert copy.name == "Copy of Standard ale"
      assert length(copy.steps) == length(t.steps)
      assert length(copy.links) == length(t.links)
      assert MapSet.disjoint?(MapSet.new(copy.steps, & &1.id), MapSet.new(t.steps, & &1.id))
      copy_ids = MapSet.new(copy.steps, & &1.id)
      assert Enum.all?(copy.links, &(&1.from_step_id in copy_ids and &1.to_step_id in copy_ids))

      refute hd(Enum.filter(copy.steps, & &1.ramp_group)).ramp_group ==
               hd(Enum.filter(t.steps, & &1.ramp_group)).ramp_group

      {:ok, copy} = Production.update_template(copy, %{"name" => "Hazy"})
      {:ok, _} = Production.remove_step(copy, step(copy, "FDH"))
      assert step(Production.get_template(t.id), "FDH")
      assert Production.get_template(t.id).name == "Standard ale"

      {:ok, again} = Production.duplicate_template(t)
      {:ok, third} = Production.duplicate_template(t)
      assert {again.name, third.name} == {"Copy of Standard ale", "Copy of Standard ale (2)"}
    end

    test "the list has step counts and issues; retire and restore" do
      t = template!("Ale")
      t = add!(t, %{"phase_id" => phase!("Lag").id, "day_offset" => 1})
      [listed] = Enum.filter(Production.list_templates(), &(&1.id == t.id))
      assert listed.step_count == 1
      assert codes(listed) == ["vessel_has_no_exit"]

      {:ok, t} = Production.retire_template(t)
      assert t.retired_at
      {:ok, t} = Production.restore_template(t)
      assert is_nil(t.retired_at)
    end
  end

  describe "D47 task 0: 4650 follow-ups, Split method, partial Package" do
    # Transfers on days 20 and 25, a Filter on day 28 (the QA recheck's template).
    defp three_tanks! do
      t = template!("Three tanks")

      t =
        add!(t, %{"step_type_id" => type!("Transfer").id, "day_offset" => 20, "vessel_index" => 1})

      t = add!(t, %{"step_type_id" => type!("Rouse").id, "day_offset" => 22, "vessel_index" => 1})

      t =
        add!(t, %{"step_type_id" => type!("Transfer").id, "day_offset" => 25, "vessel_index" => 2})

      t =
        add!(t, %{"step_type_id" => type!("Filter").id, "day_offset" => 28, "vessel_index" => 3})

      add!(t, %{"step_type_id" => type!("Package").id, "day_offset" => 32, "vessel_index" => 3})
    end

    defp transfer_on(t, day),
      do: Enum.find(t.steps, &(&1.step_type.behavior == "transfer" and &1.day_offset == day))

    test "N1: transfers stay in day order" do
      t = three_tanks!()
      assert t.issues == []

      # A new one before the day-25 transfer (into the tank that one starts).
      for k <- [2, 3] do
        assert {:error, {:transfer_order, :before, 25}} =
                 Production.add_step(t, %{
                   "step_type_id" => type!("Transfer").id,
                   "day_offset" => 22,
                   "vessel_index" => k
                 })
      end

      # The day-20 transfer moved past the day-25 one, the Filter moved before it.
      assert {:error, {:transfer_order, :after, 25}} =
               Production.update_step(t, transfer_on(t, 20), %{"day_offset" => 27})

      assert {:error, {:transfer_order, :before, 25}} =
               Production.update_step(t, transfer_on(t, 28), %{"day_offset" => 22})

      # Within its neighbours it can move, keeping its tank.
      {:ok, t2} = Production.update_step(t, transfer_on(t, 25), %{"day_offset" => 24})
      assert transfer_on(t2, 24).vessel_index == 2

      # After the last one is fine.
      assert {:ok, _} =
               Production.add_step(t, %{
                 "step_type_id" => type!("Transfer").id,
                 "day_offset" => 34,
                 "vessel_index" => 4
               })
    end

    test "a Transfer's CIP follows its day, earlier or later; one moved on its own stays" do
      t = three_tanks!()

      cip_of = fn t, k ->
        Enum.find(t.steps, &(&1.step_type.behavior == "cip" and &1.vessel_index == k))
      end

      {:ok, t} = Production.update_step(t, transfer_on(t, 25), %{"day_offset" => 26})
      assert transfer_on(t, 26).vessel_index == 2
      assert cip_of.(t, 1).day_offset == 26

      {:ok, t} = Production.update_step(t, transfer_on(t, 26), %{"day_offset" => 24})
      assert cip_of.(t, 1).day_offset == 24

      # The brewer moves the first tank's CIP a day later; the Transfer then moves without it.
      {:ok, t} = Production.update_step(t, cip_of.(t, 0), %{"day_offset" => 21})
      {:ok, t} = Production.update_step(t, transfer_on(t, 20), %{"day_offset" => 19})
      assert cip_of.(t, 0).day_offset == 21
    end

    test "N2: removal_issues lists what a removal leaves incomplete and changes nothing" do
      t = three_tanks!()
      middle = transfer_on(t, 25)

      assert {:ok, issues} = Production.removal_issues(t, middle)
      assert "vessel_not_started" in Enum.map(issues, & &1.code)

      assert %{message: "The tank after transfer 2 has no Transfer or Filter starting it."} =
               Enum.find(issues, &(&1.code == "vessel_not_started"))

      assert length(Production.get_template(t.id).steps) == length(t.steps)

      # Nothing new: an empty list; Brew day: refused as before.
      assert {:ok, []} = Production.removal_issues(t, step(t, "Rouse"))
      assert {:error, :brew_day_fixed} = Production.removal_issues(t, step(t, "Brew day"))
    end

    test "N3: a ramp changes at most the gap between start and target per day" do
      t = template!()
      ramp = &Map.merge(%{"start" => 80, "target" => 28, "first_day" => 30}, &1)

      assert {:error, {:ramp_change, 52}} =
               Production.add_ramp(t, ramp.(%{"change_per_day" => 100}))

      assert {:error, {:ramp_change, 52}} =
               Production.add_ramp(t, ramp.(%{"change_per_day" => 53}))

      assert {:error, {:ramp_change, 52}} =
               Production.add_ramp(t, ramp.(%{"change_per_day" => 0}))

      assert {:error, :ramp_days} =
               Production.add_ramp(t, ramp.(%{"change_per_day" => 10, "first_day" => -1}))

      assert {:error, :ramp_flat} =
               Production.add_ramp(t, ramp.(%{"target" => 80, "change_per_day" => 5}))

      assert {:ok, t} = Production.add_ramp(t, ramp.(%{"change_per_day" => 52}))

      assert t.steps |> Enum.filter(& &1.ramp_group) |> Enum.map(& &1.temperature) == [80, 28]
    end

    test "N4a: an entry after the tank's exit is named" do
      t = template!()

      t =
        add!(t, %{"step_type_id" => type!("Transfer").id, "day_offset" => 20, "vessel_index" => 1})

      t =
        add!(t, %{"step_type_id" => type!("Package").id, "day_offset" => 30, "vessel_index" => 1})

      assert t.issues == []

      t = add!(t, %{"step_type_id" => type!("FDH").id, "day_offset" => 22})
      assert codes(t) == ["step_after_exit"]

      assert hd(t.issues).message ==
               "The first tank is emptied by the Transfer on day 20, but FDH on day 22 comes after it."

      t = add!(t, %{"step_type_id" => type!("Rouse").id, "day_offset" => 24, "detail" => "#2"})

      assert hd(t.issues).message ==
               "The first tank is emptied by the Transfer on day 20, but FDH on day 22 and Rouse - #2 on day 24 come after it."
    end

    test "P109: a Split is Split - Transfer by default, or Split - Filter; it's the tank's exit" do
      t = template!()
      t = add!(t, %{"step_type_id" => type!("Split").id, "day_offset" => 30})
      split = step(t, "Split - Transfer")
      assert split.split_method == "transfer"
      assert t.issues == []

      {:ok, t} = Production.update_step(t, split, %{"split_method" => "filter", "detail" => "#2"})
      assert step(t, "Split - Filter - #2")

      assert {:error, cs} =
               Production.update_step(t, split, %{"split_method" => "pump"})

      assert errors_on(cs).split_method == ["Pick Transfer or Filter."]

      # Only a Split keeps a method.
      t =
        add!(t, %{
          "step_type_id" => type!("Carb").id,
          "day_offset" => 25,
          "split_method" => "filter"
        })

      assert is_nil(step(t, "Carb").split_method)

      {:ok, copy} = Production.duplicate_template(t)
      assert step(copy, "Split - Filter - #2").split_method == "filter"
    end

    test "P111: a partial Package isn't the tank's exit and adds no CIP" do
      t = template!()

      t =
        add!(t, %{
          "step_type_id" => type!("Package").id,
          "day_offset" => 30,
          "package_partial" => true,
          "detail" => "kegs"
        })

      partial = step(t, "Package - Partial - kegs")
      assert partial.package_partial

      assert Enum.map(t.steps, &Production.step_name/1) == [
               "Brew day",
               "Package - Partial - kegs"
             ]

      assert codes(t) == ["vessel_has_no_exit"]

      t = add!(t, %{"step_type_id" => type!("Package").id, "day_offset" => 40})
      assert step(t, "Package")
      assert t.issues == []

      # Remove the full Package: the tank has no exit again.
      assert {:ok, [%{code: "vessel_has_no_exit"}]} =
               Production.removal_issues(t, step(t, "Package"))

      # Switching the full one to partial, and back.
      {:ok, t} = Production.update_step(t, step(t, "Package"), %{"package_partial" => true})
      assert codes(t) == ["vessel_has_no_exit"]

      {:ok, t} =
        Production.update_step(t, step(t, "Package - Partial"), %{"package_partial" => false})

      assert t.issues == []

      # Only a Package can be partial.
      t =
        add!(t, %{
          "step_type_id" => type!("Carb").id,
          "day_offset" => 25,
          "package_partial" => true
        })

      refute step(t, "Carb").package_partial

      {:ok, copy} = Production.duplicate_template(t)
      assert step(copy, "Package - Partial - kegs").package_partial
    end
  end
end
