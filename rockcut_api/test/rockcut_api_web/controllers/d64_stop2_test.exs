defmodule RockcutApiWeb.D64Stop2Test do
  @moduledoc """
  D64 Stop 2 (spec §2 decisions 7–9 and 16–21, §4.4, §4.5, §4.7, §5.2–§5.3,
  §6.3–§6.5, §7, §8; plan Stop 2): harvests through the context
  (`Yeast.Harvests.harvest/2`, with the dirty and has-yeast questions and the
  fold), the brinks' stock actions (pitch, dump, adjust, clean) and settings,
  cell counts, and the Count / Clean tasks on the Brewery board. Every rule
  has a refusal and an allowed case. The tests make their own brinks (TB…);
  the seeded YB1–YB4 are never written.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IngredientFixtures, except: [product!: 2]
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Accounts
  alias RockcutApi.Tasks.Task
  alias RockcutApi.Yeast.{Brink, Count, Entry, Harvest, Harvests}

  setup do
    p = personas(~w(owner brewer1 brewer2 breweryMgr bartender1 splitRole))
    c = Map.merge(grain_catalog!(), yeast_catalog!())
    us05 = yeast_product!(c.chico, c.fermentis, "US-05")
    wlp002 = yeast_product!(c.california, c.white_labs, "WLP002", "Liquid")

    Map.merge(c, %{
      brewer: p["brewer1"],
      brewer2: p["brewer2"],
      owner: p["owner"],
      mgr: p["breweryMgr"],
      bartender: p["bartender1"],
      split: p["splitRole"],
      us05: us05,
      wlp002: wlp002,
      b41: batch!("41"),
      b44: batch!("44"),
      tb: brink!("TB2", empty_weight_lb: "148")
    })
  end

  defp req(user, verb, path, params \\ %{}) do
    conn = call(user, verb, path, params)
    {conn.status, if(conn.resp_body == "", do: nil, else: Jason.decode!(conn.resp_body))}
  end

  defp errors({422, %{"errors" => errors}}), do: errors
  defp base({422, %{"errors" => %{"base" => [message]}}}), do: message
  defp conflict({409, %{"errors" => %{"base" => [message]}}}), do: message
  defp today, do: Tasks.today()
  defp iso(d), do: Date.to_iso8601(d)
  defp ago(n), do: Date.add(today(), -n)

  defp harvest(c, extra \\ %{}, actor \\ nil) do
    Harvests.harvest(
      Map.merge(
        %{
          "brink_id" => c.tb.id,
          "lb" => "30",
          "occurred_on" => iso(today()),
          "batch_id" => c.b41.id,
          "product_ids" => [c.us05.id],
          "generation" => 1
        },
        extra
      ),
      actor || c.brewer
    )
  end

  defp harvest!(c, extra \\ %{}, actor \\ nil) do
    {:ok, h} = harvest(c, extra, actor)
    h
  end

  defp brink_state(c, brink \\ nil) do
    {200, %{"data" => list}} = req(c.brewer, :get, "/api/yeast/brinks?all=true")
    Enum.find(list, &(&1["id"] == (brink || c.tb).id))
  end

  defp open_tasks(brink) do
    Repo.all(
      from t in Task,
        where: t.yeast_brink_id == ^brink.id and is_nil(t.completed_at),
        order_by: t.yeast_kind,
        select: {t.yeast_kind, t.title, t.due_on}
    )
  end

  defp post(c, brink, action, params, actor \\ nil),
    do: req(actor || c.brewer, :post, "/api/yeast/brinks/#{brink.id}/#{action}", params)

  describe "harvest (context, §5.2–§5.3)" do
    test "into an empty brink: a record of US-05 gen 1 at 30 lb, and Count TB2 due the harvest day",
         c do
      h = harvest!(c, %{"occurred_on" => iso(ago(1))})
      assert h.status == "in_brink" and h.generation == 1 and not h.coferment
      assert Harvests.product_ids(h.id) == [c.us05.id]
      assert Decimal.eq?(Harvests.on_hand(h), 30)
      assert open_tasks(c.tb) == [{"recount", "Count TB2", ago(1)}]

      s = brink_state(c)
      assert s["yeast"]["on_hand_lb"] == "30"
      assert s["yeast"]["strains"] == ["US-05"]
      assert s["recount_due"]
      assert [%{"batch" => "Galactic #41", "generation" => 1}] = s["yeast"]["sources"]
    end

    test "refusals: no weight, a fraction past 2 dp, the future, no batch, a non-yeast product, gen 0, a retired brink",
         c do
      assert {:error, {:invalid, %{lb: ["Enter more than 0 lb"]}}} = harvest(c, %{"lb" => "0"})

      assert {:error, {:invalid, %{lb: ["Use at most 2 decimals"]}}} =
               harvest(c, %{"lb" => "1.234"})

      assert {:error, {:invalid, %{base: ["The date can't be in the future"]}}} =
               harvest(c, %{"occurred_on" => iso(Date.add(today(), 1))})

      assert {:error, {:invalid, %{batch_id: ["Pick the batch"]}}} =
               harvest(c, %{"batch_id" => nil})

      assert {:error, {:invalid, %{product_ids: ["must be yeast products"]}}} =
               harvest(c, %{"product_ids" => [c.product.id]})

      assert {:error, {:invalid, %{generation: ["must be 1 or more"]}}} =
               harvest(c, %{"generation" => 0})

      retired = Repo.insert!(%Brink{name: "TB9", active: false})

      assert {:error, {:invalid, %{brink_id: ["TB9 is retired"]}}} =
               harvest(c, %{"brink_id" => retired.id})

      refute Repo.exists?(Harvest)
    end

    test "a brink with yeast asks first; on top: same strain, higher gen wins and the weight goes up; one Count task",
         c do
      harvest!(c, %{"generation" => 2})

      assert {:error, {:yeast_question, :has_yeast, %Brink{name: "TB2"}}} =
               harvest(c, %{"generation" => 4, "batch_id" => c.b44.id})

      h =
        harvest!(c, %{
          "generation" => 4,
          "lb" => "12",
          "batch_id" => c.b44.id,
          "brink_answer" => "on_top"
        })

      assert h.generation == 4
      assert Decimal.eq?(Harvests.on_hand(h), 42)
      assert Repo.aggregate(Harvest, :count) == 1
      assert [{"recount", _, _}] = open_tasks(c.tb)

      s = brink_state(c)

      assert Enum.map(s["yeast"]["sources"], &{&1["batch"], &1["generation"]}) ==
               [{"Galactic #41", 2}, {"Galactic #44", 4}]
    end

    test "on top with a different strain makes a co-ferment of both, gen 1", c do
      harvest!(c, %{"generation" => 4})

      h =
        harvest!(c, %{
          "product_ids" => [c.wlp002.id],
          "generation" => 1,
          "brink_answer" => "on_top"
        })

      assert h.coferment and h.generation == 1
      assert Harvests.product_ids(h.id) == Enum.sort([c.us05.id, c.wlp002.id])
      assert brink_state(c)["yeast"]["coferment"]
    end

    test "'This brink is empty' closes the old record at 0 with the note: no dirty mark, no Clean task",
         c do
      old = harvest!(c, %{"lb" => "5", "occurred_on" => iso(ago(20))})

      new =
        harvest!(c, %{"lb" => "30", "brink_answer" => "empty", "product_ids" => [c.wlp002.id]})

      old = Repo.get!(Harvest, old.id)
      assert old.status == "emptied" and old.emptied_on == today()
      assert Decimal.eq?(Harvests.on_hand(old), 0)

      assert Repo.one!(from e in Entry, where: e.harvest_id == ^old.id and e.kind == "adjusted").note ==
               "Emptied when the #{today().month}/#{today().day} harvest went in"

      assert new.id != old.id and new.generation == 1
      refute Repo.get!(Brink, c.tb.id).dirty
      assert [{"recount", _, _}] = open_tasks(c.tb)
    end

    test "a dirty brink asks first; recording anyway clears the mark and leaves Clean TB2 open",
         c do
      dirty = brink!("TB3", dirty: true)
      Accounts.get_department_by_key("brewery")
      RockcutApi.Yeast.BoardTasks.open!(dirty, "clean", ago(2), c.brewer)

      assert {:error, {:yeast_question, :dirty, %Brink{name: "TB3"}}} =
               harvest(c, %{"brink_id" => dirty.id})

      refute Repo.exists?(Harvest)

      harvest!(c, %{"brink_id" => dirty.id, "dirty_ok" => true})
      refute Repo.get!(Brink, dirty.id).dirty
      assert [{"clean", "Clean TB3", _}, {"recount", "Count TB3", _}] = open_tasks(dirty)
    end
  end

  describe "pitch from a brink (§6.4)" do
    setup c do
      %{h: harvest!(c, %{"lb" => "42", "occurred_on" => iso(ago(3))})}
    end

    test "part of it: a pitched entry with the strains and generation it had; more than on hand is refused",
         c do
      assert base(
               post(c, c.tb, "pitch", %{
                 "lb" => "43",
                 "batch_id" => c.b44.id,
                 "occurred_on" => iso(today())
               })
             ) ==
               "TB2 has 42 lb"

      {200, %{"data" => s}} =
        post(c, c.tb, "pitch", %{
          "lb" => "24",
          "batch_id" => c.b44.id,
          "occurred_on" => iso(today()),
          "note" => "brew day"
        })

      assert s["yeast"]["on_hand_lb"] == "18"
      e = Repo.one!(from e in Entry, where: e.kind == "pitched")
      assert Decimal.eq?(e.quantity_lb, -24) and e.batch_id == c.b44.id
      assert e.product_ids == [c.us05.id] and e.generation == 1 and e.entered_by_id == c.brewer.id

      assert base(
               post(c, c.tb, "pitch", %{
                 "lb" => "18.01",
                 "batch_id" => c.b44.id,
                 "occurred_on" => iso(today())
               })
             ) ==
               "TB2 has 18 lb"
    end

    test "the rest: the record closes, the brink is dirty, and Clean TB2 is due that day", c do
      {200, %{"data" => s}} =
        post(c, c.tb, "pitch", %{
          "lb" => "42",
          "batch_id" => c.b44.id,
          "occurred_on" => iso(ago(1))
        })

      assert s["yeast"] == nil and s["dirty"] and s["dirty_since"] == iso(ago(1))
      assert Repo.get!(Harvest, c.h.id).status == "emptied"
      assert {"clean", "Clean TB2", ago(1)} in open_tasks(c.tb)
    end

    test "refusals: no batch, the future, an empty brink; a stale version is a 409 and nothing is written",
         c do
      assert %{"batch_id" => ["Pick the batch"]} =
               errors(post(c, c.tb, "pitch", %{"lb" => "1", "occurred_on" => iso(today())}))

      assert base(
               post(c, c.tb, "pitch", %{
                 "lb" => "1",
                 "batch_id" => c.b44.id,
                 "occurred_on" => iso(Date.add(today(), 1))
               })
             ) ==
               "The date can't be in the future"

      empty = brink!("TB4")

      assert base(
               post(c, empty, "pitch", %{
                 "lb" => "1",
                 "batch_id" => c.b44.id,
                 "occurred_on" => iso(today())
               })
             ) ==
               "TB4 is empty"

      v = brink_state(c)["yeast"]["lock_version"]

      body = %{
        "lb" => "20",
        "batch_id" => c.b44.id,
        "occurred_on" => iso(today()),
        "lock_version" => v
      }

      {200, _} = post(c, c.tb, "pitch", body)

      assert conflict(post(c, c.tb, "pitch", body, c.brewer2)) =~
               "TB2 changed since you opened it"

      assert Repo.aggregate(from(e in Entry, where: e.kind == "pitched"), :count) == 1
    end

    test "two people pitch the last 20 lb: the second is refused and nothing more is written",
         c do
      {200, _} =
        post(c, c.tb, "pitch", %{
          "lb" => "22",
          "batch_id" => c.b44.id,
          "occurred_on" => iso(today())
        })

      body = %{"lb" => "20", "batch_id" => c.b44.id, "occurred_on" => iso(today())}
      {200, _} = post(c, c.tb, "pitch", body)
      assert base(post(c, c.tb, "pitch", body, c.brewer2)) == "TB2 is empty"
      assert Repo.aggregate(from(e in Entry, where: e.kind == "pitched"), :count) == 2
    end
  end

  describe "dump, adjust, clean (§6.3, decisions 20–21)" do
    setup c do
      %{h: harvest!(c, %{"lb" => "40"})}
    end

    test "dump: the rest goes, the brink is dirty and Clean TB2 is added", c do
      {200, %{"data" => s}} =
        post(c, c.tb, "dump", %{"occurred_on" => iso(today()), "note" => "infected"})

      assert s["yeast"] == nil and s["dirty"] and s["clean_due"]
      e = Repo.one!(from e in Entry, where: e.kind == "dumped")
      assert Decimal.eq?(e.quantity_lb, -40) and e.note == "infected"

      assert base(post(c, c.tb, "dump", %{"occurred_on" => iso(today())})) == "TB2 is empty"
    end

    test "adjust 40 → 33: an entry of −7; the same weight is refused; 0 empties it as a dump does",
         c do
      {200, %{"data" => s}} =
        post(c, c.tb, "adjust", %{
          "weight_lb" => "33",
          "occurred_on" => iso(today()),
          "note" => "reweighed"
        })

      assert s["yeast"]["on_hand_lb"] == "33" and not s["dirty"]

      assert %{"weight_lb" => ["TB2 has 33 lb already"]} =
               errors(
                 post(c, c.tb, "adjust", %{"weight_lb" => "33", "occurred_on" => iso(today())})
               )

      assert %{"weight_lb" => ["Enter 0 or more"]} =
               errors(
                 post(c, c.tb, "adjust", %{"weight_lb" => "-1", "occurred_on" => iso(today())})
               )

      {200, %{"data" => s}} =
        post(c, c.tb, "adjust", %{"weight_lb" => "0", "occurred_on" => iso(today())})

      assert s["yeast"] == nil and s["dirty"] and s["clean_due"]
    end

    test "Mark clean: refused on a clean brink; on a dirty one it clears the mark and ticks Clean TB2",
         c do
      assert base(post(c, c.tb, "clean", %{})) == "TB2 isn't marked dirty"
      {200, _} = post(c, c.tb, "dump", %{"occurred_on" => iso(today())})

      {200, %{"data" => s}} = post(c, c.tb, "clean", %{})
      refute s["dirty"] or s["clean_due"]

      task =
        Repo.one!(from t in Task, where: t.yeast_brink_id == ^c.tb.id and t.yeast_kind == "clean")

      assert task.completed_by_id == c.brewer.id
    end

    test "ticking Clean TB2 on the Brewery board clears the dirty mark; un-ticking doesn't dirty it again",
         c do
      {200, _} = post(c, c.tb, "dump", %{"occurred_on" => iso(today())})

      task =
        Repo.one!(from t in Task, where: t.yeast_brink_id == ^c.tb.id and t.yeast_kind == "clean")

      assert task.department_id == Accounts.get_department_by_key("brewery").id
      assert task.title == "Clean TB2" and task.assignee_id == nil

      {200, _} = req(c.brewer2, :post, "/api/boards/brewery/tasks/#{task.id}/complete", %{})
      refute Repo.get!(Brink, c.tb.id).dirty

      {200, _} = req(c.brewer2, :post, "/api/boards/brewery/tasks/#{task.id}/uncomplete", %{})
      refute Repo.get!(Brink, c.tb.id).dirty
    end

    test "ticking another task leaves the brink dirty", c do
      {200, _} = post(c, c.tb, "dump", %{"occurred_on" => iso(today())})

      count =
        Repo.one!(
          from t in Task, where: t.yeast_brink_id == ^c.tb.id and t.yeast_kind == "recount"
        )

      {200, _} = req(c.brewer2, :post, "/api/boards/brewery/tasks/#{count.id}/complete", %{})
      assert Repo.get!(Brink, c.tb.id).dirty
    end
  end

  describe "cell counts (§4.7, decision 18)" do
    setup c do
      %{h: harvest!(c, %{"lb" => "42", "occurred_on" => iso(ago(5))})}
    end

    defp count(c, extra, actor \\ nil),
      do:
        req(
          actor || c.brewer,
          :post,
          "/api/yeast/counts",
          Map.merge(
            %{
              "brink_id" => c.tb.id,
              "counted_on" => iso(ago(4)),
              "viable_millions_per_ml" => "1200",
              "viability_pct" => "92"
            },
            extra
          )
        )

    test "Add count ticks Count TB2; the brink shows it", c do
      assert [{"recount", _, _}] = open_tasks(c.tb)
      {201, %{"data" => _}} = count(c, %{})
      assert open_tasks(c.tb) == []
      s = brink_state(c)
      refute s["recount_due"]
      assert s["yeast"]["count"]["viable_millions_per_ml"] == "1200"
      assert s["yeast"]["count"]["before_harvest_on"] == nil
    end

    test "refusals: tomorrow, 0 cells, 101 %, two places, an empty brink", c do
      assert %{"counted_on" => ["can't be in the future"]} =
               errors(count(c, %{"counted_on" => iso(Date.add(today(), 1))}))

      assert %{"viable_millions_per_ml" => [_]} =
               errors(count(c, %{"viable_millions_per_ml" => "0"}))

      assert %{"viability_pct" => [_]} = errors(count(c, %{"viability_pct" => "101"}))

      assert %{"viability_pct" => ["Use at most 1 decimal"]} =
               errors(count(c, %{"viability_pct" => "91.25"}))

      assert base(count(c, %{"brink_id" => brink!("TB4").id})) == "TB4 is empty"
      refute Repo.exists?(Count)
    end

    test "the count in effect is the latest on or before the day; a tie goes to the one entered last",
         c do
      {201, %{"data" => %{"id" => a}}} = count(c, %{"counted_on" => iso(ago(4))})
      {201, %{"data" => %{"id" => b}}} = count(c, %{"counted_on" => iso(ago(2))})

      {201, %{"data" => %{"id" => b2}}} =
        count(c, %{"counted_on" => iso(ago(2)), "viability_pct" => "80"})

      assert RockcutApi.Yeast.Counts.in_effect(c.h.id, ago(3)).id == a
      assert RockcutApi.Yeast.Counts.in_effect(c.h.id, ago(2)).id == b2
      assert RockcutApi.Yeast.Counts.in_effect(c.h.id, ago(6)) == nil
      assert b != b2
    end

    test "a count before the latest harvest still applies, marked; a new Count task is due", c do
      {201, _} = count(c, %{"counted_on" => iso(ago(4))})
      harvest!(c, %{"lb" => "10", "occurred_on" => iso(ago(1)), "brink_answer" => "on_top"})
      s = brink_state(c)
      assert s["yeast"]["count"]["counted_on"] == iso(ago(4))
      assert s["yeast"]["count"]["before_harvest_on"] == iso(ago(1))
      assert s["recount_due"]
    end

    test "changed or deleted by its maker or a Brewery manager; not by another brewer", c do
      {201, %{"data" => %{"id" => id}}} = count(c, %{})
      {403, _} = req(c.brewer2, :patch, "/api/yeast/counts/#{id}", %{"viability_pct" => "90"})
      {403, _} = req(c.brewer2, :delete, "/api/yeast/counts/#{id}")

      {200, %{"data" => %{"viability_pct" => "90"}}} =
        req(c.brewer, :patch, "/api/yeast/counts/#{id}", %{"viability_pct" => "90"})

      {200, _} = req(c.mgr, :patch, "/api/yeast/counts/#{id}", %{"viability_pct" => "91"})
      {204, _} = req(c.mgr, :delete, "/api/yeast/counts/#{id}")
    end

    test "a pitch dated on or after a count locks it; one dated before doesn't", c do
      {201, %{"data" => %{"id" => id}}} = count(c, %{"counted_on" => iso(ago(2))})

      {200, _} =
        post(c, c.tb, "pitch", %{
          "lb" => "1",
          "batch_id" => c.b44.id,
          "occurred_on" => iso(ago(3))
        })

      {200, _} = req(c.brewer, :patch, "/api/yeast/counts/#{id}", %{"viability_pct" => "90"})

      {200, _} =
        post(c, c.tb, "pitch", %{
          "lb" => "1",
          "batch_id" => c.b44.id,
          "occurred_on" => iso(ago(2))
        })

      assert conflict(
               req(c.brewer, :patch, "/api/yeast/counts/#{id}", %{"viability_pct" => "89"})
             ) =~ "used this count"

      assert {409, _} = req(c.mgr, :delete, "/api/yeast/counts/#{id}")
    end
  end

  describe "brink settings (§4.4, §6.5, A7)" do
    test "every Brewery member lists them; can_manage for managers and owners only", c do
      {200, %{"data" => list, "can_manage" => false}} = req(c.brewer, :get, "/api/yeast/brinks")
      assert Enum.any?(list, &(&1["name"] == "TB2" and &1["empty_weight_lb"] == "148"))
      {200, %{"can_manage" => true}} = req(c.mgr, :get, "/api/yeast/brinks")
      {403, _} = req(c.bartender, :get, "/api/yeast/brinks")
    end

    test "add YB5 with an empty weight: managers and owners; not a brewer or splitRole", c do
      body = %{"name" => "TB5", "empty_weight_lb" => "150", "position" => "9"}
      {403, _} = req(c.brewer, :post, "/api/yeast/brinks", body)
      {403, _} = req(c.split, :post, "/api/yeast/brinks", body)
      {201, %{"data" => b}} = req(c.mgr, :post, "/api/yeast/brinks", body)
      assert b["empty_weight_lb"] == "150" and b["active"] and b["yeast"] == nil

      {200, %{"data" => %{"name" => "TB5b"}}} =
        req(c.owner, :patch, "/api/yeast/brinks/#{b["id"]}", %{"name" => "TB5b"})
    end

    test "refusals: a name in any case, an empty weight of 0 or 3 places, a blank name", c do
      assert base(req(c.mgr, :post, "/api/yeast/brinks", %{"name" => "tb2"})) ==
               "There's already a brink with that name"

      assert %{"empty_weight_lb" => [_]} =
               errors(
                 req(c.mgr, :post, "/api/yeast/brinks", %{
                   "name" => "TB6",
                   "empty_weight_lb" => "0"
                 })
               )

      assert %{"empty_weight_lb" => ["Use at most 2 decimals"]} =
               errors(
                 req(c.mgr, :post, "/api/yeast/brinks", %{
                   "name" => "TB6",
                   "empty_weight_lb" => "1.234"
                 })
               )

      assert %{"name" => [_]} =
               errors(
                 req(c.mgr, :post, "/api/yeast/brinks", %{"name" => String.duplicate("x", 41)})
               )

      assert %{"name" => ["can't be blank"]} =
               errors(req(c.mgr, :post, "/api/yeast/brinks", %{"name" => " "}))
    end

    test "retire: refused with yeast in it; an empty one retires and restores", c do
      harvest!(c)

      assert base(req(c.mgr, :patch, "/api/yeast/brinks/#{c.tb.id}", %{"active" => false})) ==
               "TB2 still has yeast in it"

      empty = brink!("TB7")

      {200, %{"data" => %{"active" => false}}} =
        req(c.mgr, :patch, "/api/yeast/brinks/#{empty.id}", %{"active" => false})

      {200, %{"data" => list}} = req(c.brewer, :get, "/api/yeast/brinks")
      refute Enum.any?(list, &(&1["id"] == empty.id))

      {200, %{"data" => %{"active" => true}}} =
        req(c.mgr, :patch, "/api/yeast/brinks/#{empty.id}", %{"active" => true})
    end

    test "delete: one with no history goes; one with history is refused (retire it instead)", c do
      unused = brink!("TB8")
      {403, _} = req(c.brewer, :delete, "/api/yeast/brinks/#{unused.id}")
      {204, _} = req(c.mgr, :delete, "/api/yeast/brinks/#{unused.id}")

      harvest!(c, %{"lb" => "1"})
      {200, _} = post(c, c.tb, "dump", %{"occurred_on" => iso(today())})

      assert base(req(c.mgr, :delete, "/api/yeast/brinks/#{c.tb.id}")) ==
               "TB2 has history, so it can't be deleted; retire it instead"
    end
  end

  describe "history and access (§6.3, §8)" do
    test "history: records newest first with their entries and counts", c do
      harvest!(c, %{"lb" => "10", "occurred_on" => iso(ago(3))})
      {200, _} = post(c, c.tb, "dump", %{"occurred_on" => iso(ago(2))})
      harvest!(c, %{"lb" => "20", "occurred_on" => iso(ago(1)), "dirty_ok" => true})

      {200, %{"data" => [newest, oldest]}} =
        req(c.brewer, :get, "/api/yeast/brinks/#{c.tb.id}/history")

      assert newest["status"] == "in_brink" and oldest["status"] == "emptied"
      assert Enum.map(oldest["entries"], & &1["kind"]) == ["harvested", "dumped"]
      assert hd(oldest["entries"])["entered_by"]["id"] == c.brewer.id
    end

    test "a bartender and the brewhouse device are refused on every new route", c do
      paths = [
        {:get, "/api/yeast/brinks"},
        {:get, "/api/yeast/brinks/#{c.tb.id}/history"},
        {:post, "/api/yeast/brinks/#{c.tb.id}/pitch"},
        {:post, "/api/yeast/brinks/#{c.tb.id}/dump"},
        {:post, "/api/yeast/brinks/#{c.tb.id}/adjust"},
        {:post, "/api/yeast/brinks/#{c.tb.id}/clean"},
        {:post, "/api/yeast/brinks"},
        {:post, "/api/yeast/counts"}
      ]

      device = RockcutApi.AccountsFixtures.device_fixture(%{home: "brewery", name: "Brewhouse"})
      token = RockcutApi.AccountsFixtures.device_token_fixture(device, "Brewhouse iPad")

      for {verb, path} <- paths do
        assert {403, _} = req(c.bartender, verb, path), "bartender #{path}"
        assert call_device(token, verb, path, %{}).status == 403, "device #{path}"
      end
    end

    test "an owner does every stock action", c do
      harvest!(c, %{"lb" => "10"})

      {200, _} =
        post(
          c,
          c.tb,
          "pitch",
          %{"lb" => "2", "batch_id" => c.b44.id, "occurred_on" => iso(today())},
          c.owner
        )

      {200, _} =
        post(c, c.tb, "adjust", %{"weight_lb" => "0", "occurred_on" => iso(today())}, c.owner)

      {200, _} = post(c, c.tb, "clean", %{}, c.owner)
    end
  end
end
