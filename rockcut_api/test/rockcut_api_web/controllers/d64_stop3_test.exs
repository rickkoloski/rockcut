defmodule RockcutApiWeb.D64Stop3Test do
  @moduledoc """
  D64 Stop 3 (spec §2 decisions 10–17 and 19, §4.8, §5, §6.6, §8; plan
  "The step check-off"): the Yeast harvest step's check-off on the Gantt,
  on its linked Brewery task and on the brewhouse device; the two questions;
  who may record; un-check and Undo; the batch page's Yeast section; and
  Remove on a brink's History. Every rule has a refusal and an allowed case.
  The tests make their own brinks (TB…); the seeded YB1–YB4 are never written.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.ProductionFixtures, except: [batch!: 1]
  import RockcutApi.IngredientFixtures, except: [product!: 2, batch!: 1, batch!: 2]
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{AccountsFixtures, Repo, StaffCodes, Tasks}
  alias RockcutApi.Brewing.Batch
  alias RockcutApi.Production.{Step, Steps, UndoRecord}
  alias RockcutApi.Tasks.{Event, Task}
  alias RockcutApi.Yeast.{Brink, Entry, Generations, Harvest, Harvests}

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
        %{done_on: iso(0)} |> Map.merge(asked(c, params)) |> Map.merge(params)
      )

  # What a has-yeast answer carries (lead decisions 7, gap 19): the brink's record now.
  defp asked(c, %{yeast_brink_answer: _} = params) do
    case Harvests.open_record(params[:yeast_brink_id] || c.tb.id) do
      nil -> %{}
      r -> %{yeast_record_id: r.id, yeast_lock_version: r.lock_version}
    end
  end

  defp asked(_c, _params), do: %{}

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

  ## Generations.for_batch/1 (§5.3)

  describe "Generations.for_batch/1" do
    test "no pitches: nil (the dialog asks, A5)", c do
      {batch, _} = brewed(c, "41")
      assert Generations.for_batch(batch.id) == nil
    end

    test "a lot pitch is the Mother: that strain, gen 1", c do
      {batch, _} = brewed(c, "41")
      pitch_lot!(c, batch)

      assert Generations.for_batch(batch.id) == %{
               product_ids: [c.us05.id],
               generation: 1,
               coferment: false
             }
    end

    test "a brink pitch carries its snapshot (US-05 gen 2 → gen 3); with a lot of another strain, a co-ferment gen 1",
         c do
      {batch, _} = brewed(c, "41")

      Repo.insert!(%Harvest{brink_id: c.tb2.id, status: "emptied", generation: 2})
      |> then(
        &Repo.insert!(%Entry{
          harvest_id: &1.id,
          kind: "pitched",
          quantity_lb: Decimal.new(-10),
          occurred_on: day(-8),
          batch_id: batch.id,
          product_ids: [c.us05.id],
          generation: 2,
          entered_by_id: c.brewer.id
        })
      )

      assert Generations.for_batch(batch.id) == %{
               product_ids: [c.us05.id],
               generation: 3,
               coferment: false
             }

      pitch_lot!(c, batch, c.wlp002, "1")

      assert Generations.for_batch(batch.id) ==
               %{product_ids: Enum.sort([c.us05.id, c.wlp002.id]), generation: 1, coferment: true}
    end
  end

  ## The check-off (§5.1–§5.3)

  describe "preview" do
    test "a Yeast harvest step says needs_yeast with the brinks, the default brink, defaults and products",
         c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)

      {200, %{"data" => %{"preview" => preview}}} = complete(c, harvest, %{preview: true})
      assert preview["needs_yeast"]
      yeast = preview["yeast"]
      assert yeast["default_brink_id"] == nil

      assert yeast["defaults"] == %{
               "product_ids" => [c.us05.id],
               "generation" => 1,
               "coferment" => false
             }

      tb = Enum.find(yeast["brinks"], &(&1["name"] == "TB1"))
      assert tb["empty_weight_lb"] == "148" and tb["yeast"] == nil and tb["dirty"] == false
      assert Enum.any?(yeast["products"], &(&1["id"] == c.us05.id and &1["code"] == "US-05"))
      assert entries() == [] and step(harvest).done_on == nil
    end

    test "any other step: no needs_yeast and no yeast", c do
      {batch, _} = brewed(c, "41")
      fdh = named(batch, "FDH")

      {200, %{"data" => %{"preview" => preview}}} =
        complete(c, fdh, %{preview: true, done_on: Date.to_iso8601(fdh.due_on)})

      assert preview["needs_yeast"] == false and preview["yeast"] == nil
    end

    test "a second pull defaults to the brink the first went into, while it's still there", c do
      {_batch, harvest} = brewed(c, "44")

      {200, _} =
        complete(
          c,
          harvest,
          harvest_params(c, %{yeast_product_ids: [c.us05.id], yeast_generation: 2})
        )

      second = second_step!(harvest)

      {200, %{"data" => %{"preview" => %{"yeast" => yeast}}}} =
        complete(c, second, %{preview: true})

      assert yeast["default_brink_id"] == c.tb.id

      {200, _} = req(c.brewer, :post, "/api/yeast/brinks/#{c.tb.id}/dump", %{occurred_on: iso(0)})

      {200, %{"data" => %{"preview" => %{"yeast" => yeast}}}} =
        complete(c, second, %{preview: true})

      assert yeast["default_brink_id"] == nil
    end
  end

  describe "Generations.defaults/1" do
    test "nothing pitched and no earlier pull: nil", c do
      {batch, _} = brewed(c, "41")
      assert Generations.defaults(batch.id) == nil
    end

    test "nothing pitched: a second pull takes the first pull's strains and generation", c do
      {batch, harvest} = brewed(c, "41")

      {200, _} =
        complete(
          c,
          harvest,
          harvest_params(c, %{yeast_product_ids: [c.wlp002.id], yeast_generation: 3})
        )

      assert Generations.defaults(batch.id) == %{
               product_ids: [c.wlp002.id],
               generation: 3,
               coferment: false
             }

      {200, %{"data" => %{"preview" => %{"yeast" => yeast}}}} =
        complete(c, second_step!(harvest), %{preview: true})

      assert yeast["defaults"]["generation"] == 3
    end

    test "with pitches, they win over an earlier pull", c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)

      {200, _} =
        complete(
          c,
          harvest,
          harvest_params(c, %{yeast_product_ids: [c.wlp002.id], yeast_generation: 3})
        )

      assert Generations.defaults(batch.id) == %{
               product_ids: [c.us05.id],
               generation: 1,
               coferment: false
             }
    end
  end

  describe "the write" do
    test "no outcome: 422 yeast_required; a wrong one 422; nothing written", c do
      {_, harvest} = brewed(c, "41")

      assert {422,
              %{"error" => "yeast_required", "message" => "Choose Harvest yeast or Yeast dumped."}} =
               complete(c, harvest, %{})

      assert {422, %{"error" => "yeast_outcome_invalid"}} =
               complete(c, harvest, %{yeast_outcome: "kept"})

      assert step(harvest).done_on == nil and entries() == []
    end

    test "Harvested: one transaction with the step; defaults from the lot pitch (gen 1); Count TB1 due the done day",
         c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)

      assert {200, %{"undo_token" => token}} = complete(c, harvest, harvest_params(c))
      assert is_binary(token)

      s = step(harvest)
      assert {s.done_on, s.yeast_outcome, s.yeast_note} == {day(0), "harvested", "good slurry"}

      [e] = entries()
      assert e.kind == "harvested" and Decimal.eq?(e.quantity_lb, 30)
      assert {e.production_step_id, e.batch_id, e.occurred_on} == {harvest.id, batch.id, day(0)}
      assert {e.product_ids, e.generation, e.note} == {[c.us05.id], 1, "good slurry"}
      assert {e.entered_by_id, e.device_id} == {c.brewer.id, nil}
      assert open_tasks(c.tb) == [{"recount", "Count TB1"}]
    end

    test "done on another day: the harvest's date is the done day", c do
      {_, harvest} = brewed(c, "41")

      {200, _} =
        complete(
          c,
          harvest,
          harvest_params(c, %{
            done_on: iso(-1),
            answer: "move_only",
            yeast_product_ids: [c.us05.id],
            yeast_generation: 1
          })
        )

      assert [%{occurred_on: d}] = entries()
      assert d == day(-1)
    end

    test "no pitches recorded: the strains are asked (422 without), then saved as given", c do
      {_, harvest} = brewed(c, "41")

      assert {422, %{"errors" => %{"product_ids" => ["Pick the strain"]}}} =
               complete(c, harvest, harvest_params(c))

      assert step(harvest).done_on == nil and entries() == []

      {200, _} =
        complete(
          c,
          harvest,
          harvest_params(c, %{yeast_product_ids: [c.wlp002.id], yeast_generation: 3})
        )

      assert [%{product_ids: ids, generation: 3}] = entries()
      assert ids == [c.wlp002.id]
    end

    test "the harvest's own refusals roll the check-off back (no brink, too much)", c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)

      assert {422, %{"errors" => %{"brink_id" => ["Pick the brink"]}}} =
               complete(c, harvest, harvest_params(c, %{yeast_brink_id: nil}))

      assert {422, %{"errors" => %{"lb" => ["At most 10,000 lb"]}}} =
               complete(c, harvest, harvest_params(c, %{yeast_lb: "10001"}))

      assert step(harvest).done_on == nil and entries() == [] and open_tasks(c.tb) == []
    end

    test "Yeast dumped: only the step's outcome and note; no brink, entry or task", c do
      {_, harvest} = brewed(c, "45")

      {200, _} = complete(c, harvest, %{yeast_outcome: "dumped", yeast_note: "too much trub"})

      s = step(harvest)
      assert {s.yeast_outcome, s.yeast_note} == {"dumped", "too much trub"}
      assert entries() == [] and record(c.tb) == nil and open_tasks(c.tb) == []
    end

    test "on the linked Brewery task: the same check-off and harvest", c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)
      task = linked_task(harvest)

      assert {422, %{"error" => "yeast_required"}} =
               req(c.brewer, :post, "/api/boards/brewery/tasks/#{task.id}/complete", %{})

      {200, %{"data" => %{"preview" => %{"needs_yeast" => true}}}} =
        req(c.brewer, :post, "/api/boards/brewery/tasks/#{task.id}/complete", %{preview: true})

      {200, %{"undo_token" => _}} =
        req(c.brewer, :post, "/api/boards/brewery/tasks/#{task.id}/complete", harvest_params(c))

      assert [%{production_step_id: id, generation: 1}] = entries()
      assert id == harvest.id
    end
  end

  describe "the questions (§5.2): one at a time, dirty first" do
    test "a dirty brink: 409 with the sentence, nothing written; Record anyway clears the mark",
         c do
      dirty = brink!("TB3", dirty: true)
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)
      params = harvest_params(c, %{yeast_brink_id: dirty.id})

      assert {409,
              %{
                "code" => "yeast_question",
                "question" => "dirty",
                "message" => "TB3 is marked as dirty, record harvest anyway?"
              }} = complete(c, harvest, params)

      assert step(harvest).done_on == nil and entries() == []

      {200, _} = complete(c, harvest, Map.put(params, :yeast_dirty_ok, true))
      refute Repo.get!(Brink, dirty.id).dirty
      assert step(harvest).yeast_outcome == "harvested"
    end

    test "a brink with yeast: 409 has_yeast; Harvest on top adds to the record", c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)
      {200, _} = complete(c, harvest, harvest_params(c))
      second = second_step!(harvest)
      params = harvest_params(c, %{yeast_lb: "12"})

      assert {409,
              %{
                "code" => "yeast_question",
                "question" => "has_yeast",
                "message" =>
                  "TB1 shows yeast in brink. Do you want to harvest on top or is this brink empty?"
              }} = complete(c, second, params)

      assert length(entries()) == 1

      {200, _} = complete(c, second, Map.put(params, :yeast_brink_answer, "on_top"))
      assert Decimal.eq?(Harvests.on_hand(record(c.tb)), 42)
    end

    test "This brink is empty closes the old record at 0 with the note, no dirty mark, no Clean task",
         c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)
      {200, _} = complete(c, harvest, harvest_params(c))
      old = record(c.tb)
      second = second_step!(harvest)

      {200, _} =
        complete(c, second, harvest_params(c, %{yeast_lb: "12", yeast_brink_answer: "empty"}))

      assert Repo.get!(Harvest, old.id).status == "emptied"
      assert Decimal.eq?(Harvests.on_hand(record(c.tb)), 12)
      refute Repo.get!(Brink, c.tb.id).dirty
      assert open_tasks(c.tb) == [{"recount", "Count TB1"}]
    end

    test "dirty and with yeast: dirty is asked first, then has_yeast", c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)
      {200, _} = complete(c, harvest, harvest_params(c))
      Repo.update_all(from(b in Brink, where: b.id == ^c.tb.id), set: [dirty: true])
      second = second_step!(harvest)

      assert {409, %{"question" => "dirty"}} = complete(c, second, harvest_params(c))

      assert {409, %{"question" => "has_yeast"}} =
               complete(c, second, harvest_params(c, %{yeast_dirty_ok: true}))

      assert {200, _} =
               complete(
                 c,
                 second,
                 harvest_params(c, %{yeast_dirty_ok: true, yeast_brink_answer: "on_top"})
               )
    end
  end

  describe "who (§8)" do
    test "the context: someone who can't edit ingredients is refused (forbidden; on a device, can't do this here)",
         c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)
      attrs = harvest_params(c) |> Map.new(fn {k, v} -> {to_string(k), v} end)

      assert {:error, :forbidden} = Steps.complete(harvest.id, attrs, c.bartender)

      assert {:error, :staff_code_not_allowed} =
               Steps.complete(harvest.id, attrs, %{c.bartender | on_device_id: c.device.id})

      assert entries() == []
      assert {:ok, _} = Steps.complete(harvest.id, attrs, c.brewer)
    end

    test "the device on the Gantt with brewer2's code: recorded as brewer2 on the device", c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)

      {200, %{"data" => %{"preview" => %{"yeast" => %{"brinks" => [_ | _]}}}}} =
        dev(c, :post, "/api/production/steps/#{harvest.id}/complete", %{
          preview: true,
          staff_code: "2222"
        })

      {200, body} =
        dev(
          c,
          :post,
          "/api/production/steps/#{harvest.id}/complete",
          Map.put(harvest_params(c), :staff_code, "2222")
        )

      assert body["recorded_as"] == c.brewer2.name
      [e] = entries()
      assert {e.entered_by_id, e.device_id} == {c.brewer2.id, c.device.id}
      assert step(harvest).done_on_device_id == c.device.id

      [%{"entries" => [h]}] =
        req(c.brewer, :get, "/api/yeast/brinks/#{c.tb.id}/history") |> elem(1) |> Map.get("data")

      assert h["device"] == "Brewhouse tablet"
    end

    test "the device on the board with brewer2's code; a bartender's code can't do this here, uncounted",
         c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)
      task = linked_task(harvest)
      url = "/api/boards/brewery/tasks/#{task.id}/complete"

      for _ <- 1..6 do
        assert {422,
                %{
                  "error" => "staff_code_not_allowed",
                  "message" => "That staff code can't do this here"
                }} =
                 dev(c, :post, url, Map.put(harvest_params(c), :staff_code, "3333"))
      end

      assert entries() == [] and step(harvest).done_on == nil

      # Six refusals and still not locked: they weren't counted.
      {200, body} = dev(c, :post, url, Map.put(harvest_params(c), :staff_code, "2222"))
      assert body["recorded_as"] == c.brewer2.name
      assert [%{device_id: id}] = entries()
      assert id == c.device.id
    end
  end

  ## Un-check and Undo (§5.4)

  describe "un-check" do
    test "nothing after it: the entry goes, the record is voided, the Count task deleted (logged)",
         c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)
      {200, _} = complete(c, harvest, harvest_params(c))
      [%{harvest_id: hid}] = entries()
      task = Repo.get_by!(Task, yeast_brink_id: c.tb.id)

      assert {200, _} = uncomplete(c, harvest)

      assert entries() == []
      assert Repo.get!(Harvest, hid).status == "voided"
      assert record(c.tb) == nil and open_tasks(c.tb) == []
      s = step(harvest)
      assert {s.done_on, s.yeast_outcome, s.yeast_note} == {nil, nil, nil}

      assert Repo.exists?(
               from ev in Event,
                 where:
                   ev.task_id == ^task.id and ev.action == "deleted" and
                     ev.actor_id == ^c.brewer.id
             )
    end

    test "refused after a count: 409 with the sentence, nothing changes", c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)
      {200, _} = complete(c, harvest, harvest_params(c))
      count!(c, c.tb)

      assert {409,
              %{
                "error" => "yeast_locked",
                "message" =>
                  "TB1 has been pitched from or counted since this harvest. The harvest can't be un-checked."
              }} = uncomplete(c, harvest)

      assert step(harvest).done_on == day(0) and length(entries()) == 1
    end

    test "refused after a pitch (and after a dump or adjustment)", c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)
      {200, _} = complete(c, harvest, harvest_params(c))
      {next, _} = brewed(c, "44")

      {200, _} =
        req(c.brewer, :post, "/api/yeast/brinks/#{c.tb.id}/pitch", %{
          lb: "10",
          batch_id: next.id,
          occurred_on: iso(0)
        })

      assert {409, %{"error" => "yeast_locked"}} = uncomplete(c, harvest)

      {200, _} =
        req(c.brewer, :post, "/api/yeast/brinks/#{c.tb.id}/adjust", %{
          weight_lb: "15",
          occurred_on: iso(0)
        })

      assert {409, %{"error" => "yeast_locked"}} = uncomplete(c, harvest)
    end

    test "a harvest on top un-checks back to what the brink held; the Count task stays while needed",
         c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)
      {200, _} = complete(c, harvest, harvest_params(c, %{yeast_generation: 2}))
      backdate!(Entry, 10)
      count!(c, c.tb)
      backdate!(RockcutApi.Yeast.Count, 5)
      assert open_tasks(c.tb) == []
      second = second_step!(harvest)

      {200, _} =
        complete(
          c,
          second,
          harvest_params(c, %{
            yeast_lb: "12",
            yeast_brink_answer: "on_top",
            yeast_product_ids: [c.wlp002.id],
            yeast_generation: 1
          })
        )

      h = record(c.tb)
      assert h.coferment and open_tasks(c.tb) == [{"recount", "Count TB1"}]

      assert {200, _} = uncomplete(c, second)

      h = record(c.tb)
      assert {h.generation, h.coferment, Harvests.product_ids(h.id)} == {2, false, [c.us05.id]}
      assert Decimal.eq?(Harvests.on_hand(h), 30)
      # The first harvest was counted since: nothing needs the Count task.
      assert open_tasks(c.tb) == []
    end

    test "on top of an uncounted harvest: the Count task stays", c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)
      {200, _} = complete(c, harvest, harvest_params(c))
      second = second_step!(harvest)

      {200, _} =
        complete(c, second, harvest_params(c, %{yeast_lb: "5", yeast_brink_answer: "on_top"}))

      assert {200, _} = uncomplete(c, second)
      assert open_tasks(c.tb) == [{"recount", "Count TB1"}]
    end

    test "Yeast dumped un-checks freely (the columns clear)", c do
      {_, harvest} = brewed(c, "45")
      {200, _} = complete(c, harvest, %{yeast_outcome: "dumped", yeast_note: "too much trub"})

      assert {200, _} = uncomplete(c, harvest)
      s = step(harvest)
      assert {s.done_on, s.yeast_outcome, s.yeast_note} == {nil, nil, nil}
    end

    test "on the linked task: the same refusal, and allowed with nothing after", c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)
      task = linked_task(harvest)
      url = "/api/boards/brewery/tasks/#{task.id}/uncomplete"
      {200, _} = complete(c, harvest, harvest_params(c))
      count!(c, c.tb)

      assert {409, %{"error" => "yeast_locked"}} = req(c.brewer, :post, url)

      {batch2, harvest2} = brewed(c, "44")
      pitch_lot!(c, batch2)

      {200, _} =
        complete(c, harvest2, harvest_params(c, %{yeast_brink_id: c.tb2.id}))

      assert {200, _} =
               req(
                 c.brewer,
                 :post,
                 "/api/boards/brewery/tasks/#{linked_task(harvest2).id}/uncomplete"
               )

      assert record(c.tb2) == nil
    end
  end

  describe "Undo" do
    defp undo(user, token), do: req(user, :post, "/api/production/undo/#{token}")

    test "of the check-off: the harvest comes out with it", c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)
      {200, %{"undo_token" => token}} = complete(c, harvest, harvest_params(c))

      assert {200, _} = undo(c.brewer, token)
      assert step(harvest).done_on == nil and step(harvest).yeast_outcome == nil
      assert entries() == [] and record(c.tb) == nil and open_tasks(c.tb) == []
    end

    test "of the check-off, refused once counted (the same 409); nothing changes", c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)
      {200, %{"undo_token" => token}} = complete(c, harvest, harvest_params(c))
      count!(c, c.tb)

      assert {409, %{"error" => "yeast_locked"}} = undo(c.brewer, token)
      assert step(harvest).done_on == day(0) and length(entries()) == 1
      assert Repo.get_by(UndoRecord, token: token)
    end

    test "of an un-check: refused, Check it off again", c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)
      {200, _} = complete(c, harvest, harvest_params(c))
      {200, %{"undo_token" => token}} = uncomplete(c, harvest)

      assert {409,
              %{
                "error" => "yeast_recheck",
                "message" => "Check it off again to record the harvest."
              }} =
               undo(c.brewer, token)

      assert step(harvest).done_on == nil and entries() == []
    end

    test "of a Yeast dumped un-check: put back like any step", c do
      {_, harvest} = brewed(c, "45")
      {200, _} = complete(c, harvest, %{yeast_outcome: "dumped", yeast_note: "trub"})
      {200, %{"undo_token" => token}} = uncomplete(c, harvest)

      assert {200, _} = undo(c.brewer, token)
      s = step(harvest)
      assert {s.done_on, s.yeast_outcome, s.yeast_note} == {day(0), "dumped", "trub"}
    end

    test "the token rules are unchanged: undo_not_yours and expiry; nothing comes out", c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)
      {200, %{"undo_token" => token}} = complete(c, harvest, harvest_params(c))

      assert {403, %{"error" => "undo_not_yours"}} = undo(c.brewer2, token)
      assert length(entries()) == 1

      Repo.update_all(from(u in UndoRecord, where: u.token == ^token),
        set: [expires_at: DateTime.add(DateTime.utc_now(), -5) |> DateTime.truncate(:second)]
      )

      assert {422, %{"error" => "undo_expired"}} = undo(c.brewer, token)
      assert length(entries()) == 1 and step(harvest).done_on == day(0)
    end

    test "from the device: brewer2's code undoes brewer2's check-off", c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)

      {200, %{"undo_token" => token}} =
        dev(
          c,
          :post,
          "/api/production/steps/#{harvest.id}/complete",
          Map.put(harvest_params(c), :staff_code, "2222")
        )

      assert {200, _} = dev(c, :post, "/api/production/undo/#{token}", %{staff_code: "2222"})
      assert entries() == []
    end
  end

  ## The batch page (§6.6)

  describe "GET /api/yeast/batches/:id" do
    test "pitched (lots and brinks) and harvested (one line per pull, on top), and Yeast dumped",
         c do
      {batch, harvest} = brewed(c, "44")
      pitch_lot!(c, batch)

      Repo.insert!(%Harvest{brink_id: c.tb2.id, status: "emptied", generation: 2})
      |> then(
        &Repo.insert!(%Entry{
          harvest_id: &1.id,
          kind: "pitched",
          quantity_lb: Decimal.new(-38),
          occurred_on: day(-8),
          batch_id: batch.id,
          product_ids: [c.us05.id],
          generation: 2,
          entered_by_id: c.brewer.id
        })
      )

      {200, _} = complete(c, harvest, harvest_params(c, %{yeast_generation: 3}))
      second = second_step!(harvest)

      {200, _} =
        complete(
          c,
          second,
          harvest_params(c, %{yeast_lb: "12", yeast_brink_answer: "on_top", yeast_note: nil})
        )

      third = second_step!(harvest)
      {200, _} = complete(c, third, %{yeast_outcome: "dumped", yeast_note: "too much trub"})

      {200, %{"data" => data}} = req(c.brewer, :get, "/api/yeast/batches/#{batch.id}")

      assert [
               %{
                 "source" => "lot",
                 "quantity" => "2",
                 "unit" => "bricks",
                 "product" => "Chico Ale US-05",
                 "lot_number" => "F123"
               },
               %{
                 "source" => "brink",
                 "lb" => "38",
                 "brink" => "TB2",
                 "strains" => ["US-05"],
                 "generation" => 2
               }
             ] = data["pitched"]

      assert [
               %{"lb" => "30", "brink" => "TB1", "on_top" => false, "note" => "good slurry"},
               %{"lb" => "12", "brink" => "TB1", "on_top" => true}
             ] = data["harvested"]

      assert [%{"note" => "too much trub"}] = data["dumped"]
    end

    test "Brewery members only; a device 403; an unknown batch 404", c do
      {batch, _} = brewed(c, "41")
      assert {403, _} = req(c.bartender, :get, "/api/yeast/batches/#{batch.id}")
      assert {403, _} = dev(c, :get, "/api/yeast/batches/#{batch.id}", %{})
      assert {404, _} = req(c.brewer, :get, "/api/yeast/batches/999999")
      assert {200, _} = req(c.mgr, :get, "/api/yeast/batches/#{batch.id}")
    end
  end

  ## Remove a mistaken entry (spec §8, A8)

  describe "Remove on History" do
    setup c do
      {batch, harvest} = brewed(c, "41")
      pitch_lot!(c, batch)
      {200, _} = complete(c, harvest, harvest_params(c))
      {next, _} = brewed(c, "44")
      Map.merge(c, %{batch: batch, harvest: harvest, next: next})
    end

    defp pitch(c, lb, user \\ nil),
      do:
        req(user || c.brewer, :post, "/api/yeast/brinks/#{c.tb.id}/pitch", %{
          lb: lb,
          batch_id: c.next.id,
          occurred_on: iso(0)
        })

    defp latest_entry, do: Repo.one(from e in Entry, order_by: [desc: e.id], limit: 1)

    defp remove(c, entry, user \\ nil),
      do: req(user || c.brewer, :delete, "/api/yeast/entries/#{entry.id}")

    defp history(c, user) do
      {200, %{"data" => [rec | _]}} = req(user, :get, "/api/yeast/brinks/#{c.tb.id}/history")
      rec["entries"]
    end

    test "its maker removes the latest pitch: on hand goes back; History marks can_remove", c do
      {200, _} = pitch(c, "10")

      assert [
               %{"kind" => "harvested", "can_remove" => false},
               %{"kind" => "pitched", "can_remove" => true}
             ] =
               history(c, c.brewer)

      assert [_, %{"can_remove" => false}] = history(c, c.brewer2)
      assert [_, %{"can_remove" => true}] = history(c, c.mgr)

      assert {200, _} = remove(c, latest_entry())
      assert Decimal.eq?(Harvests.on_hand(record(c.tb)), 30)
    end

    test "someone else is 403; a Brewery manager may", c do
      {200, _} = pitch(c, "10")
      entry = latest_entry()
      assert {403, _} = remove(c, entry, c.brewer2)
      assert {403, _} = remove(c, entry, c.bartender)
      assert Repo.get(Entry, entry.id)
      assert {200, _} = remove(c, entry, c.mgr)
      refute Repo.get(Entry, entry.id)
    end

    test "only the latest entry, and not after a count", c do
      {200, _} = pitch(c, "10")
      first = latest_entry()
      {200, _} = pitch(c, "5")

      assert {409, %{"errors" => %{"base" => ["Only the latest entry on TB1 can be removed."]}}} =
               remove(c, first)

      count!(c, c.tb)

      assert {409,
              %{
                "errors" => %{"base" => ["TB1 has been counted since, so this can't be removed."]}
              }} =
               remove(c, latest_entry())
    end

    test "a harvest is refused (un-check its step); the Emptied-when adjustment is refused", c do
      [harvested] = entries()

      assert {409,
              %{
                "errors" => %{
                  "base" => ["A harvest is removed by un-checking its Yeast harvest step."]
                }
              }} =
               remove(c, harvested)

      second = second_step!(c.harvest)

      {200, _} =
        complete(c, second, harvest_params(c, %{yeast_lb: "8", yeast_brink_answer: "empty"}))

      auto = Repo.one(from e in Entry, where: e.kind == "adjusted")
      assert auto.note =~ "Emptied when the"

      assert {409,
              %{
                "errors" => %{
                  "base" => ["That adjustment came with a harvest, so it can't be removed."]
                }
              }} =
               remove(c, auto)
    end

    test "a dump that emptied the brink: Remove reopens it, clears dirty, deletes the open Clean task",
         c do
      {200, _} =
        req(c.brewer, :post, "/api/yeast/brinks/#{c.tb.id}/dump", %{
          occurred_on: iso(0),
          note: "oops"
        })

      assert record(c.tb) == nil and Repo.get!(Brink, c.tb.id).dirty
      assert {"clean", "Clean TB1"} in open_tasks(c.tb)
      dump = latest_entry()

      assert {200, %{"data" => %{"yeast" => %{"on_hand_lb" => "30"}}}} = remove(c, dump)
      refute Repo.get!(Brink, c.tb.id).dirty
      refute {"clean", "Clean TB1"} in open_tasks(c.tb)
      assert record(c.tb).status == "in_brink"
    end

    test "an emptying entry with a newer record on the brink is refused", c do
      {200, _} = pitch(c, "30")
      emptied = latest_entry()
      {_, other} = brewed(c, "47")

      {200, _} =
        complete(
          c,
          other,
          harvest_params(c, %{
            yeast_lb: "4",
            yeast_product_ids: [c.us05.id],
            yeast_generation: 1,
            yeast_dirty_ok: true
          })
        )

      assert {409,
              %{
                "errors" => %{
                  "base" => ["TB1 has been filled again since, so this can't be removed."]
                }
              }} =
               remove(c, emptied)
    end

    test "an adjustment its maker made is removable", c do
      {200, _} =
        req(c.brewer, :post, "/api/yeast/brinks/#{c.tb.id}/adjust", %{
          weight_lb: "26",
          occurred_on: iso(0)
        })

      assert {200, %{"data" => %{"yeast" => %{"on_hand_lb" => "30"}}}} = remove(c, latest_entry())
    end
  end
end
