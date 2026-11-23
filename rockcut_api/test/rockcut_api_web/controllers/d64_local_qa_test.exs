defmodule RockcutApiWeb.D64LocalQaTest do
  @moduledoc """
  D64 lead decisions 3–5: the local QA fix cycle, by gap number
  (`stepwise_results/d64_local_qa_report.md`). Every fix has the repro and
  its allowed or opposite case; helpers as in `D64Stop3Test`.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.ProductionFixtures, except: [batch!: 1]
  import RockcutApi.IngredientFixtures, except: [product!: 2, batch!: 1, batch!: 2]
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{AccountsFixtures, Repo, StaffCodes, Tasks}
  alias RockcutApi.Brewing.Batch
  alias RockcutApi.Ingredients.Movement
  alias RockcutApi.Production.Step
  alias RockcutApi.Tasks.Task
  alias RockcutApi.Yeast.{Brink, Count, Entry, Generations, Harvest, Harvests}

  setup do
    p = personas(~w(owner brewer1 brewer2 breweryMgr bartender1))
    mgr = p["breweryMgr"]
    {:ok, _} = StaffCodes.set(p["brewer2"], "2222", mgr)
    {:ok, _} = StaffCodes.set(p["bartender1"], "3333", p["owner"])

    c = yeast_catalog!()
    us05 = yeast_product!(c.chico, c.fermentis, "US-05")
    wlp002 = yeast_product!(c.california, c.white_labs, "WLP002", "Liquid")

    t = ale_template!()
    t = add!(t, "Yeast harvest", 8, after: entry(t, "FDH"))

    device = AccountsFixtures.device_fixture(%{home: "brewery", name: "Brewhouse tablet"})
    token = AccountsFixtures.device_token_fixture(device, "Brewhouse Tab")

    Map.merge(c, %{
      p: p,
      brewer: p["brewer1"],
      brewer2: p["brewer2"],
      mgr: mgr,
      bartender: p["bartender1"],
      us05: us05,
      wlp002: wlp002,
      template: t,
      fv4: tank!("FV4"),
      device: device,
      token: token,
      tb: brink!("TB1", empty_weight_lb: "148"),
      tb2: brink!("TB2")
    })
  end

  ## Helpers

  defp day(offset), do: Date.add(Tasks.today(), offset)
  defp iso(offset), do: Date.to_iso8601(day(offset))

  defp req(user, verb, path, params \\ %{}) do
    conn = call(user, verb, path, params)
    {conn.status, if(conn.resp_body == "", do: nil, else: Jason.decode!(conn.resp_body))}
  end

  defp dev(c, verb, path, params) do
    conn = call_device(c.token, verb, path, params)
    {conn.status, Jason.decode!(conn.resp_body)}
  end

  # A batch brewed 8 days ago as #`number`; its Yeast harvest step is due today.
  defp brewed(c, number, brand \\ "Galactic") do
    %{"data" => %{"batches" => [%{"id" => id}]}} =
      call(c.brewer, :post, "/api/production/batches", %{
        brand_id: (Repo.get_by(RockcutApi.Brewing.Brand, name: brand) || brand!(brand)).id,
        template_id: c.template.id,
        brew_on: iso(-8),
        volume_bbl: "20",
        tank_ids: [c.fv4.id]
      })
      |> json_response(201)

    batch = Repo.get!(Batch, id)
    brew = named(batch, "Brew day")

    call(c.brewer, :post, "/api/production/steps/#{brew.id}/complete", %{
      done_on: iso(-8),
      batch_number: number
    })
    |> json_response(200)

    {Repo.get!(Batch, id), named(batch, "Yeast harvest")}
  end

  # A second Yeast harvest step on the same batch (a second pull).
  defp second_step!(harvest) do
    Repo.insert!(%Step{
      batch_id: harvest.batch_id,
      step_type_id: harvest.step_type_id,
      due_on: harvest.due_on,
      vessel_index: 0,
      added: true
    })
  end

  defp complete(c, step, params, user \\ nil),
    do:
      req(
        user || c.brewer,
        :post,
        "/api/production/steps/#{step.id}/complete",
        Map.merge(%{done_on: iso(0)}, params)
      )

  defp uncomplete(c, step, user \\ nil),
    do: req(user || c.brewer, :post, "/api/production/steps/#{step.id}/uncomplete")

  defp harvest_params(c, extra \\ %{}),
    do:
      Map.merge(
        %{
          yeast_outcome: "harvested",
          yeast_brink_id: c.tb.id,
          yeast_lb: "30",
          yeast_note: "good slurry"
        },
        extra
      )

  defp pitch_lot!(c, batch, product \\ nil, quantity \\ "2") do
    product = product || c.us05

    Repo.get_by(RockcutApi.Brewing.IngredientLot, product_id: product.id, lot_number: "F123") ||
      stocked_lot!(product, ~D[2026-11-01], "10", "F123")

    {201, _} =
      req(c.brewer, :post, "/api/ingredient_products/#{product.id}/pitch", %{
        batch_id: batch.id,
        quantity: quantity,
        occurred_on: iso(-8)
      })
  end

  defp step(s), do: Repo.get!(Step, s.id)
  defp entries, do: Repo.all(from e in Entry, order_by: e.id)
  defp record(brink), do: Harvests.open_record(brink.id)

  defp open_tasks(brink),
    do:
      Repo.all(
        from t in Task,
          where: t.yeast_brink_id == ^brink.id and is_nil(t.completed_at),
          order_by: t.yeast_kind,
          select: {t.yeast_kind, t.title}
      )

  defp count!(c, brink, user \\ nil),
    do:
      {201, _} =
        req(user || c.brewer, :post, "/api/yeast/counts", %{
          brink_id: brink.id,
          counted_on: iso(0),
          viable_millions_per_ml: "1200",
          viability_pct: "92"
        })

  # A count entered `seconds` ago: un-check compares when things were
  # entered, to the second, so a count and a harvest in one test second
  # would read as "counted since".
  defp backdate!(schema, seconds) do
    at = DateTime.utc_now() |> DateTime.add(-seconds) |> DateTime.truncate(:second)
    Repo.update_all(schema, set: [inserted_at: at])
  end

  defp linked_task(step), do: Repo.get_by!(Task, production_step_id: step.id)

  ## More helpers

  defp brink_json(c, brink) do
    {200, %{"data" => list}} = req(c.brewer, :get, "/api/yeast/brinks?all=true")
    Enum.find(list, &(&1["id"] == brink.id))
  end

  defp act(c, action, params, brink \\ nil),
    do:
      req(
        c.brewer,
        :post,
        "/api/yeast/brinks/#{(brink || c.tb).id}/#{action}",
        Map.merge(%{occurred_on: iso(0)}, params)
      )

  defp fill!(c, harvest, extra \\ %{}) do
    {200, body} =
      complete(
        c,
        harvest,
        harvest_params(
          c,
          Map.merge(%{yeast_product_ids: [c.us05.id], yeast_generation: 1}, extra)
        )
      )

    body
  end

  defp brink(b), do: Repo.get!(Brink, b.id)

  defp last_task(b, kind),
    do:
      Repo.one(
        from t in Task,
          where: t.yeast_brink_id == ^b.id and t.yeast_kind == ^kind,
          order_by: [desc: t.id],
          limit: 1
      )

  defp tick(c, task, how),
    do:
      req(c.brewer, :post, "/api/boards/brewery/tasks/#{task.id}/#{how}", %{
        display: "completed_day"
      })

  defp undo(c, token), do: req(c.brewer, :post, "/api/production/undo/#{token}")

  defp latest(b),
    do:
      Repo.one(
        from e in Entry,
          join: h in assoc(e, :harvest),
          where: h.brink_id == ^b.id,
          order_by: [desc: e.id],
          limit: 1
      )

  defp base({422, %{"errors" => %{"base" => [m]}}}), do: m

  defp add_count(c, on),
    do:
      req(c.brewer, :post, "/api/yeast/counts", %{
        brink_id: c.tb.id,
        counted_on: on,
        viable_millions_per_ml: "1200",
        viability_pct: "92"
      })

  # A dirty brink since 5 days ago with its Clean task, and a harvest recorded anyway.
  defp dirty_harvest(c) do
    Repo.update!(Ecto.Changeset.change(c.tb, dirty: true, dirty_since: day(-5)))
    RockcutApi.Yeast.BoardTasks.open!(c.tb, "clean", day(-5), %{c.brewer | on_device_id: nil})
    {batch, harvest} = brewed(c, "41")
    body = fill!(c, harvest, %{yeast_dirty_ok: true})
    refute brink(c.tb).dirty
    {batch, harvest, body["undo_token"]}
  end

  describe "gap 8: what a harvest into a dirty brink cleared" do
    test "un-check puts the mark back with its dirty_since; the next harvest asks again", c do
      {_, harvest, _} = dirty_harvest(c)
      assert {200, _} = uncomplete(c, harvest)
      assert %{dirty: true, dirty_since: since} = brink(c.tb)
      assert since == day(-5)

      assert {409, %{"question" => "dirty"}} =
               complete(
                 c,
                 harvest,
                 harvest_params(c, %{yeast_product_ids: [c.us05.id], yeast_generation: 1})
               )
    end

    test "Undo too", c do
      {_, _, token} = dirty_harvest(c)
      assert {200, _} = undo(c, token)
      assert brink(c.tb).dirty_since == day(-5)
    end

    test "Clean ticked since: the brink stays clean; ticked and un-ticked again: dirty", c do
      {_, harvest, _} = dirty_harvest(c)
      {200, _} = tick(c, last_task(c.tb, "clean"), "complete")
      {200, _} = uncomplete(c, harvest)
      refute brink(c.tb).dirty

      {200, _} = tick(c, last_task(c.tb, "clean"), "uncomplete")
      assert brink(c.tb).dirty
    end

    test "un-ticked while the yeast is in: not dirty now, but un-check marks it", c do
      {_, harvest, _} = dirty_harvest(c)
      {200, _} = tick(c, last_task(c.tb, "clean"), "complete")
      {200, _} = tick(c, last_task(c.tb, "clean"), "uncomplete")
      refute brink(c.tb).dirty
      {200, _} = uncomplete(c, harvest)
      assert brink(c.tb).dirty_since == day(-5)
    end

    test "with a second harvest on top the mark waits for the last one out", c do
      {_, first, _} = dirty_harvest(c)
      second = second_step!(first)
      fill!(c, second, %{yeast_brink_answer: "on_top"})
      {200, _} = uncomplete(c, first)
      refute brink(c.tb).dirty
      {200, _} = uncomplete(c, second)
      assert brink(c.tb).dirty_since == day(-5)
    end

    test "Remove of a later dump keeps the older Clean task; a harvest into a clean brink marks nothing",
         c do
      {_, harvest, _} = dirty_harvest(c)
      {200, _} = act(c, "dump", %{})
      {200, _} = req(c.brewer, :delete, "/api/yeast/entries/#{latest(c.tb).id}")
      assert {"clean", "Clean TB1"} in open_tasks(c.tb)
      {200, _} = uncomplete(c, harvest)
      assert brink(c.tb).dirty

      {_, clean} = brewed(c, "44")
      fill!(c, clean, %{yeast_brink_id: c.tb2.id})
      {200, _} = uncomplete(c, clean)
      refute brink(c.tb2).dirty
    end
  end

  describe "gap 9: can_remove is what the API answers, refusal by refusal" do
    defp entries_json(c) do
      {200, %{"data" => records}} = req(c.brewer, :get, "/api/yeast/brinks/#{c.tb.id}/history")
      Enum.flat_map(records, & &1["entries"])
    end

    # Every entry: can_remove false exactly when the API refuses it.
    defp agree!(c, want) do
      for e <- entries_json(c), not e["can_remove"] do
        {status, _} = req(c.brewer, :delete, "/api/yeast/entries/#{e["id"]}")
        assert status == 409, "#{e["kind"]} ##{e["id"]}"
      end

      assert Enum.frequencies_by(entries_json(c), &{&1["kind"], &1["can_remove"]}) == want
    end

    test "harvested; an older entry; counted since; filled again since; the harvest's own adjustment; un-checked",
         c do
      {_, h1} = brewed(c, "41")
      {next, h2} = brewed(c, "44")
      fill!(c, h1)
      agree!(c, %{{"harvested", false} => 1})

      {200, _} = act(c, "pitch", %{lb: "5", batch_id: next.id})
      {200, _} = act(c, "pitch", %{lb: "5", batch_id: next.id})
      agree!(c, %{{"harvested", false} => 1, {"pitched", false} => 1, {"pitched", true} => 1})

      count!(c, c.tb)
      agree!(c, %{{"harvested", false} => 1, {"pitched", false} => 2})

      backdate!(Entry, 10)
      backdate!(Count, 5)
      {200, _} = act(c, "dump", %{})
      agree!(c, %{{"harvested", false} => 1, {"pitched", false} => 2, {"dumped", true} => 1})

      # Filled again: the dump was the record's latest entry, but not any more.
      fill!(c, h2, %{yeast_dirty_ok: true})
      agree!(c, %{{"harvested", false} => 2, {"pitched", false} => 2, {"dumped", false} => 1})

      fill!(c, second_step!(h2), %{yeast_brink_answer: "empty"})

      agree!(c, %{
        {"harvested", false} => 3,
        {"pitched", false} => 2,
        {"dumped", false} => 1,
        {"adjusted", false} => 1
      })
    end

    test "an un-checked (voided) record's entry is refused", c do
      h = Repo.insert!(%Harvest{brink_id: c.tb.id, status: "voided"})

      Repo.insert!(%Entry{
        harvest_id: h.id,
        kind: "pitched",
        quantity_lb: Decimal.new(-1),
        occurred_on: day(0),
        entered_by_id: c.brewer.id
      })

      agree!(c, %{{"pitched", false} => 1})
    end
  end

  describe "gap 13: deleting a brand" do
    test "with batches or recipes: 422 and it stays; without: 204", c do
      {_, _} = brewed(c, "41", "Oktoberfest")
      brand = Repo.get_by!(RockcutApi.Brewing.Brand, name: "Oktoberfest")

      assert base(req(c.brewer, :delete, "/api/brands/#{brand.id}")) ==
               "Oktoberfest has 1 batch, so it can't be deleted."

      Repo.insert!(%RockcutApi.Brewing.Recipe{
        brand_id: brand.id,
        version_major: 1,
        version_minor: 0,
        batch_size: Decimal.new(10),
        batch_size_unit: "bbls"
      })

      Repo.insert!(%Batch{brand_id: brand.id, batch_number: "9", status: "planned"})

      assert base(req(c.brewer, :delete, "/api/brands/#{brand.id}")) ==
               "Oktoberfest has 2 batches and 1 recipe, so it can't be deleted."

      free = brand!("Free")
      assert {204, _} = req(c.brewer, :delete, "/api/brands/#{free.id}")
    end
  end

  describe "gap 4: closing at 0 and the Count task" do
    for {how, action, params} <- [
          {"dump", "dump", %{}},
          {"adjust to 0", "adjust", %{weight_lb: "0"}},
          {"pitch of the rest", "pitch", %{lb: "30"}}
        ] do
      test "#{how}: the open Count task goes, nothing is due; Remove brings it back with its day",
           c do
        {batch, harvest} = brewed(c, "41")
        fill!(c, harvest, %{done_on: iso(-1), answer: "move_only"})
        params = Map.put(unquote(Macro.escape(params)), :batch_id, batch.id)
        {200, _} = act(c, unquote(action), params)
        assert open_tasks(c.tb) == [{"clean", "Clean TB1"}]
        refute brink_json(c, c.tb)["recount_due"]

        {200, _} = req(c.brewer, :delete, "/api/yeast/entries/#{latest(c.tb).id}")
        assert open_tasks(c.tb) == [{"recount", "Count TB1"}]
        assert last_task(c.tb, "recount").due_on == day(-1)
      end
    end

    test "counted before it closed: Remove brings no Count task back", c do
      {_, harvest} = brewed(c, "41")
      fill!(c, harvest)
      count!(c, c.tb)
      backdate!(Count, 5)
      {200, _} = act(c, "dump", %{})
      {200, _} = req(c.brewer, :delete, "/api/yeast/entries/#{latest(c.tb).id}")
      assert open_tasks(c.tb) == []
    end

    test "an empty brink with a Count task somehow open never reads Recount due", c do
      RockcutApi.Yeast.BoardTasks.open!(c.tb, "recount", day(0), %{c.brewer | on_device_id: nil})
      refute brink_json(c, c.tb)["recount_due"]
    end
  end

  describe "gap 5: removing a lot pitch" do
    setup c do
      {batch, _} = brewed(c, "41")
      pitch_lot!(c, batch)
      m = Repo.one!(from m in Movement, where: m.batch_id == ^batch.id)
      Map.merge(c, %{batch: batch, m: m})
    end

    defp on_hand(c),
      do:
        RockcutApi.Ingredients.Inventory.on_hand_by_product([c.us05.id])[c.us05.id]
        |> Decimal.to_float()

    defp remove_pitch(c, user), do: req(user, :delete, "/api/yeast/pitches/#{c.m.id}")

    defp movement_flag(c, user) do
      {200, %{"data" => list}} =
        req(user, :get, "/api/inventory_movements?product_id=#{c.us05.id}")

      Enum.find(list, &(&1["id"] == c.m.id))["can_remove"]
    end

    test "its maker: the stock is back, the prefill is gone, and the batch isn't held", c do
      assert on_hand(c) == 8.0
      assert movement_flag(c, c.brewer)

      assert {200, %{"data" => %{"pitched" => [%{"can_remove" => true, "movement_id" => id}]}}} =
               req(c.brewer, :get, "/api/yeast/batches/#{c.batch.id}")

      assert id == c.m.id
      assert {204, _} = remove_pitch(c, c.brewer)
      assert on_hand(c) == 10.0
      assert Generations.for_batch(c.batch.id) == nil
      assert RockcutApi.Production.Batches.yeast_blocked([c.batch.id]) == nil
    end

    test "another brewer 403 and no flag; a bartender and the device 403; a manager may", c do
      refute movement_flag(c, c.brewer2)
      assert {403, _} = remove_pitch(c, c.brewer2)
      assert {403, _} = remove_pitch(c, c.bartender)
      assert {403, _} = dev(c, :delete, "/api/yeast/pitches/#{c.m.id}", %{})
      assert movement_flag(c, c.mgr)
      assert {204, _} = remove_pitch(c, c.mgr)
    end

    test "a count since, of any of its lots: refused (409) and no flag; later movements don't block",
         c do
      {201, _} =
        req(c.brewer, :post, "/api/inventory_movements", %{
          kind: "used",
          product_id: c.us05.id,
          allocation: "oldest_first",
          quantity: "1",
          occurred_on: iso(0)
        })

      assert movement_flag(c, c.brewer)

      other = stocked_lot!(c.us05, day(-1), "4", "F999")

      {status, _} =
        req(c.brewer, :post, "/api/ingredient_products/#{c.us05.id}/count", %{
          mode: "by_lot",
          counted_on: iso(0),
          lots: [%{lot_id: other.id, counted: "4"}]
        })

      assert status in [200, 201]
      refute movement_flag(c, c.brewer)

      assert {409,
              %{
                "errors" => %{
                  "base" => ["US-05 has been counted since, so this pitch can't be removed."]
                }
              }} =
               remove_pitch(c, c.brewer)

      assert Repo.get(Movement, c.m.id)
    end

    test "any other movement isn't removable", c do
      opening =
        Repo.one!(from m in Movement, where: m.kind == "opening" and m.lot_id == ^c.m.lot_id)

      {201, %{"data" => [%{"id" => used}]}} =
        req(c.brewer, :post, "/api/inventory_movements", %{
          kind: "used",
          product_id: c.us05.id,
          allocation: "oldest_first",
          quantity: "1",
          occurred_on: iso(0)
        })

      for id <- [opening.id, used] do
        assert {409, _} = req(c.mgr, :delete, "/api/yeast/pitches/#{id}")
        assert Repo.get(Movement, id)
      end

      assert {404, _} = req(c.mgr, :delete, "/api/yeast/pitches/999999")
    end
  end

  describe "gap 10: un-ticking Clean" do
    test "dirty again since the day it emptied; not with yeast in it; not for an older Clean task",
         c do
      {_, h1} = brewed(c, "41")
      fill!(c, h1, %{done_on: iso(-2), answer: "move_only"})
      {200, _} = act(c, "dump", %{occurred_on: iso(-1)})
      old = last_task(c.tb, "clean")
      {200, _} = tick(c, old, "complete")
      {200, _} = tick(c, old, "uncomplete")
      assert %{dirty: true, dirty_since: since} = brink(c.tb)
      assert since == day(-1)

      {200, _} = tick(c, old, "complete")
      {_, h2} = brewed(c, "44")
      fill!(c, h2)
      {200, _} = tick(c, old, "uncomplete")
      refute brink(c.tb).dirty

      {200, _} = tick(c, old, "complete")
      {200, _} = act(c, "dump", %{})
      newer = last_task(c.tb, "clean")
      # One open task of a kind: the old one can't open beside it.
      assert {422, %{"error" => "yeast_task_open"}} = tick(c, old, "uncomplete")
      {200, _} = tick(c, newer, "complete")
      {200, _} = tick(c, old, "uncomplete")
      refute brink(c.tb).dirty
    end
  end

  describe "gap 11: deleting a count" do
    setup c do
      {_, harvest} = brewed(c, "41")
      fill!(c, harvest)
      Map.put(c, :harvest, harvest)
    end

    defp count_ids, do: Repo.all(from x in Count, order_by: x.id, select: x.id)

    defp delete_count(c, id),
      do: assert({204, _} = req(c.brewer, :delete, "/api/yeast/counts/#{id}"))

    test "the only count: its Count task opens again and Recount is due", c do
      count!(c, c.tb)
      [id] = count_ids()
      delete_count(c, id)
      assert open_tasks(c.tb) == [{"recount", "Count TB1"}]
      assert brink_json(c, c.tb)["recount_due"]
    end

    test "another count still covers the harvest; deleting that one too opens it", c do
      count!(c, c.tb)
      count!(c, c.tb)
      [first, second] = count_ids()
      delete_count(c, first)
      assert open_tasks(c.tb) == []
      delete_count(c, second)
      assert open_tasks(c.tb) == [{"recount", "Count TB1"}]
    end

    test "a hand-ticked Count stays ticked; one un-ticked and re-ticked by hand is by hand", c do
      {200, _} = tick(c, last_task(c.tb, "recount"), "complete")
      count!(c, c.tb)
      [id] = count_ids()
      delete_count(c, id)
      assert open_tasks(c.tb) == []
    end

    test "un-ticked then ticked by hand after the count: deleting the count leaves it", c do
      count!(c, c.tb)
      task = last_task(c.tb, "recount")
      {200, _} = tick(c, task, "uncomplete")
      {200, _} = tick(c, task, "complete")
      [id] = count_ids()
      delete_count(c, id)
      assert open_tasks(c.tb) == []
    end

    test "a later harvest's own Count task is open: nothing else opens", c do
      count!(c, c.tb)
      [id] = count_ids()
      backdate!(Entry, 10)
      backdate!(Count, 5)
      fill!(c, second_step!(c.harvest), %{yeast_brink_answer: "on_top"})
      delete_count(c, id)
      assert open_tasks(c.tb) == [{"recount", "Count TB1"}]
    end
  end

  describe "gap 12: renaming a brink" do
    test "its open tasks follow; a done one and a retitled one keep theirs", c do
      {_, harvest} = brewed(c, "41")
      fill!(c, harvest)
      {200, _} = req(c.mgr, :put, "/api/yeast/brinks/#{c.tb.id}", %{name: "TB1x"})
      assert open_tasks(c.tb) == [{"recount", "Count TB1x"}]

      task = last_task(c.tb, "recount")

      {200, _} =
        req(c.brewer, :patch, "/api/boards/brewery/tasks/#{task.id}", %{title: "Count it twice"})

      {200, _} = req(c.mgr, :put, "/api/yeast/brinks/#{c.tb.id}", %{name: "TB1y"})
      assert open_tasks(c.tb) == [{"recount", "Count it twice"}]

      {200, _} = act(c, "dump", %{})
      {200, _} = tick(c, last_task(c.tb, "clean"), "complete")
      {200, _} = req(c.mgr, :put, "/api/yeast/brinks/#{c.tb.id}", %{name: "TB1z"})
      assert last_task(c.tb, "clean").title == "Clean TB1y"
    end
  end

  describe "observations" do
    test "an empty strain list is refused, a missing one takes the pitches; generation 1000 has its own sentence",
         c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)

      assert {422, %{"errors" => %{"product_ids" => ["Pick the strain"]}}} =
               complete(c, harvest, harvest_params(c, %{yeast_product_ids: []}))

      assert {422, %{"errors" => %{"generation" => ["must be 999 or less"]}}} =
               complete(c, harvest, harvest_params(c, %{yeast_generation: 1000}))

      assert entries() == []
      assert {200, _} = complete(c, harvest, harvest_params(c, %{yeast_generation: 999}))
    end
  end

  describe "gap 7 (Matt): un-checking a harvest saved with This brink is empty" do
    setup c do
      {batch, first} = brewed(c, "64")
      fill!(c, first, %{yeast_lb: "40", yeast_generation: 3})
      second = second_step!(first)
      Map.merge(c, %{batch: batch, first: first, second: second, old: record(c.tb)})
    end

    defp empty!(c, extra \\ %{}),
      do: fill!(c, c.second, Map.merge(%{yeast_lb: "9", yeast_brink_answer: "empty"}, extra))

    defp restored!(c, before) do
      assert %{id: id, generation: 3, emptied_on: nil} = record(c.tb)
      assert id == c.old.id
      assert Decimal.eq?(Harvests.on_hand(record(c.tb)), 40)

      assert Map.delete(brink_json(c, c.tb)["yeast"], "lock_version") ==
               Map.delete(before["yeast"], "lock_version")

      refute Repo.exists?(from e in Entry, where: e.kind == "adjusted")
    end

    test "40 lb is back with its strains, generation and sources, its Count task, and the first un-checks normally",
         c do
      before = brink_json(c, c.tb)
      empty!(c)
      {200, _} = uncomplete(c, c.second)
      restored!(c, before)
      assert open_tasks(c.tb) == [{"recount", "Count TB1"}]
      assert Repo.aggregate(from(h in Harvest, where: h.status == "voided"), :count) == 1
      assert {200, _} = uncomplete(c, c.first)
      assert record(c.tb) == nil and entries() == []
    end

    test "counted before: the count is in effect again and no Count task comes back", c do
      backdate!(Entry, 10)
      count!(c, c.tb)
      before = brink_json(c, c.tb)
      empty!(c)
      {200, _} = uncomplete(c, c.second)
      restored!(c, before)
      assert before["yeast"]["count"]["viability_pct"] in ["92", "92.0"]
      assert open_tasks(c.tb) == []
    end

    test "Undo on the Gantt", c do
      before = brink_json(c, c.tb)
      %{"undo_token" => token} = empty!(c)
      assert {200, _} = undo(c, token)
      restored!(c, before)
    end

    test "on the board, and on the device with a code", c do
      before = brink_json(c, c.tb)
      empty!(c)
      url = "/api/boards/brewery/tasks"

      task = Repo.one!(from t in Task, where: t.production_step_id == ^c.second.id, limit: 1)
      assert {200, _} = req(c.brewer, :post, "#{url}/#{task.id}/uncomplete")
      restored!(c, before)

      empty!(c)

      assert {200, _} =
               dev(c, :post, "/api/production/steps/#{c.second.id}/uncomplete", %{
                 staff_code: "2222"
               })

      restored!(c, before)

      empty!(c)
      assert {200, _} = dev(c, :post, "#{url}/#{task.id}/uncomplete", %{staff_code: "2222"})
      restored!(c, before)
    end

    test "locked by a later count, pitch, dump or adjustment on the new record: the same 409, nothing changes",
         c do
      empty!(c)

      for {action, params} <- [
            {"pitch", %{lb: "1", batch_id: c.batch.id}},
            {"adjust", %{weight_lb: "5"}},
            {"dump", %{}}
          ] do
        {200, _} = act(c, action, params)

        assert {409,
                %{
                  "error" => "yeast_locked",
                  "message" => "TB1 has been pitched from or counted since" <> _
                }} = uncomplete(c, c.second)

        assert Repo.get!(Harvest, c.old.id).status == "emptied"
        {200, _} = req(c.brewer, :delete, "/api/yeast/entries/#{latest(c.tb).id}")
      end

      count!(c, c.tb)
      assert {409, _} = uncomplete(c, c.second)
      assert step(c.second).done_on
    end

    test "a later record closed the ordinary way doesn't bring an older one back", c do
      empty!(c)
      {200, _} = act(c, "dump", %{})
      fill!(c, second_step!(c.first), %{yeast_dirty_ok: true, yeast_lb: "4"})

      step3 =
        Repo.one!(
          from s in Step, where: s.yeast_outcome == "harvested", order_by: [desc: s.id], limit: 1
        )

      {200, _} = uncomplete(c, step3)
      assert record(c.tb) == nil
    end

    test "a harvest on top of the new record: the old one waits until the last is out", c do
      empty!(c)
      top = second_step!(c.first)
      fill!(c, top, %{yeast_lb: "2", yeast_brink_answer: "on_top"})
      {200, _} = uncomplete(c, c.second)
      assert Decimal.eq?(Harvests.on_hand(record(c.tb)), 2)
      {200, _} = uncomplete(c, top)
      assert Decimal.eq?(Harvests.on_hand(record(c.tb)), 40)
    end

    test "dirty too: gap 8's rule holds", c do
      Repo.update!(Ecto.Changeset.change(brink(c.tb), dirty: true, dirty_since: day(-5)))
      empty!(c, %{yeast_dirty_ok: true})
      {200, _} = uncomplete(c, c.second)
      assert Decimal.eq?(Harvests.on_hand(record(c.tb)), 40)
      assert brink(c.tb).dirty_since == day(-5)
    end
  end

  describe "gap 3 (Matt): a pitch or count before the first harvest" do
    setup c do
      {batch, harvest} = brewed(c, "41")
      fill!(c, harvest, %{done_on: iso(-2), answer: "move_only"})

      Map.merge(c, %{
        batch: batch,
        harvest: harvest,
        says: "TB1's yeast was harvested #{Harvests.short(day(-2))}. Pick that day or later."
      })
    end

    defp pitch_on(c, n),
      do: act(c, "pitch", %{lb: "1", batch_id: c.batch.id, occurred_on: iso(n)})

    test "the day before is refused with nothing written, the same day allowed", c do
      assert base(pitch_on(c, -3)) == c.says
      assert base(add_count(c, iso(-3))) == c.says
      assert length(entries()) == 1 and Repo.aggregate(Count, :count) == 0
      assert {200, _} = pitch_on(c, -2)
      assert {201, _} = add_count(c, iso(-2))
    end

    test "a harvest on top: later changes nothing, one dated earlier moves the day back", c do
      fill!(c, second_step!(c.harvest), %{yeast_brink_answer: "on_top"})
      assert base(pitch_on(c, -3)) == c.says
      assert {200, _} = pitch_on(c, -2)

      early = second_step!(c.harvest) |> Ecto.Changeset.change(due_on: day(-4)) |> Repo.update!()
      fill!(c, early, %{yeast_brink_answer: "on_top", done_on: iso(-4)})
      assert {200, _} = pitch_on(c, -4)
      assert {201, _} = add_count(c, iso(-4))
      assert {422, _} = pitch_on(c, -5)
    end

    test "editing a count's date; its other fields stay editable", c do
      {201, %{"data" => %{"id" => id}}} = add_count(c, iso(-1))

      assert base(req(c.brewer, :put, "/api/yeast/counts/#{id}", %{counted_on: iso(-3)})) ==
               c.says

      assert {200, _} =
               req(c.brewer, :put, "/api/yeast/counts/#{id}", %{counted_on: iso(-2), note: "x"})

      Repo.update_all(Count, set: [counted_on: day(-9)])

      assert {200, _} =
               req(c.brewer, :put, "/api/yeast/counts/#{id}", %{counted_on: iso(-9), note: "y"})
    end

    test "a purchased-yeast pitch is dated as before", c do
      pitch_lot!(c, c.batch)

      assert Repo.exists?(
               from m in Movement, where: m.batch_id == ^c.batch.id and m.occurred_on == ^day(-8)
             )
    end
  end
end
