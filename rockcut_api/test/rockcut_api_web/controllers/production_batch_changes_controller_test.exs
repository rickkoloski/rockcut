defmodule RockcutApiWeb.ProductionBatchChangesControllerTest do
  @moduledoc """
  D48 §3.11 (task 1) over HTTP: add step / ramp / transfer, remove step and
  transfer, Change ramp…, template and brand; their messages, Undo, and who
  may use them.
  """
  use RockcutApiWeb.ConnCase

  import RockcutApi.PersonaFixtures
  import RockcutApi.ProductionFixtures

  alias RockcutApi.Repo
  alias RockcutApi.Production.Step

  setup do
    people = personas(~w(brewer1 brewer2 owner office1))
    template = ale_template!()

    batch =
      plan!(brand!("Galactic"), template, ~D[2026-11-02], %{"tank_ids" => [tank!("FV2").id]})

    Map.merge(people, %{template: template, batch: batch})
  end

  defp body(conn), do: Jason.decode!(conn.resp_body)
  defp undo(user, conn), do: call(user, :post, "/api/production/undo/#{body(conn)["undo_token"]}")
  defp names(batch), do: Enum.map(steps_of(batch), &RockcutApi.Production.Steps.name/1)

  test "add a step: 201 with the batch and the new step; Undo takes it out", ctx do
    b = ctx["brewer1"]
    path = "/api/production/batches/#{ctx.batch.id}/steps"

    added =
      call(b, :post, path, %{
        step_type_id: type!("Addition").id,
        detail: "raspberry puree",
        due_on: "2026-11-10",
        comes_after_id: named(ctx.batch, "FDH").id
      })

    assert added.status == 201
    assert %{"batches" => [batch], "step_ids" => [id]} = body(added)["data"]
    step = Enum.find(batch["steps"], &(&1["id"] == id))
    assert %{"name" => "Addition - raspberry puree", "added" => true, "marker" => false} = step

    assert undo(b, added).status == 200
    refute Repo.get(Step, id)

    empty = call(b, :post, path, %{name: "", due_on: "2026-11-10"})
    assert empty.status == 422
    assert body(empty) == %{"error" => "name_required", "message" => "Give the step a name."}
  end

  test "ramps: add one, change it, its steps carry the group", ctx do
    b = ctx["brewer1"]

    ramp =
      call(b, :post, "/api/production/batches/#{ctx.batch.id}/ramp", %{
        start: 60,
        target: 40,
        change_per_day: 10,
        first_on: "2026-11-13"
      })

    assert ramp.status == 201
    [first | _] = body(ramp)["data"]["step_ids"]
    [batch] = body(ramp)["data"]["batches"]
    group = Enum.find(batch["steps"], &(&1["id"] == first))["ramp_group"]
    assert is_binary(group)

    changed = call(b, :post, "/api/production/steps/#{first}/ramp", %{target: 50})
    assert changed.status == 200
    assert "Set temp - 50°" in names(ctx.batch)
    refute "Set temp - 40°" in names(ctx.batch)

    flat =
      call(b, :post, "/api/production/steps/#{named(ctx.batch, "FDH").id}/ramp", %{target: 50})

    assert body(flat)["error"] == "not_ramp"
  end

  test "transfers: add, refused after a done step, remove by either route; Undo", ctx do
    b = ctx["brewer1"]
    s1 = tank!("Serving 1")
    path = "/api/production/batches/#{ctx.batch.id}/transfers"

    added =
      call(b, :post, path, %{
        step_type_id: type!("Filter").id,
        due_on: "2026-11-14",
        tank_id: s1.id
      })

    assert added.status == 201
    # Carb and Package; the CIP after Package goes on with it (DEV QA N1).
    assert body(added)["data"]["moved"] == 2
    [batch] = body(added)["data"]["batches"]

    assert batch["vessels"] == [
             %{"vessel_index" => 0, "tank_id" => vessels(ctx.batch)[0]},
             %{"vessel_index" => 1, "tank_id" => s1.id}
           ]

    filter = named(ctx.batch, "Filter")
    other = plan!(brand!("Enos"), ctx.template, ~D[2026-11-02])

    assert call(b, :delete, "/api/production/batches/#{other.id}/transfers/#{filter.id}").status ==
             404

    assert call(
             b,
             :delete,
             "/api/production/batches/#{ctx.batch.id}/transfers/#{named(ctx.batch, "FDH").id}"
           ).status == 404

    removed = call(b, :delete, "/api/production/batches/#{ctx.batch.id}/transfers/#{filter.id}")
    assert removed.status == 200
    assert map_size(vessels(ctx.batch)) == 1
    assert undo(b, removed).status == 200
    assert map_size(vessels(ctx.batch)) == 2

    gone = call(b, :delete, "/api/production/steps/#{named(ctx.batch, "Filter").id}")
    assert gone.status == 200
    assert map_size(vessels(ctx.batch)) == 1

    done!(named(ctx.batch, "Carb"))
    late = call(b, :post, path, %{due_on: "2026-11-14"})
    assert late.status == 422

    assert body(late) == %{
             "error" => "step_done_after",
             "message" => "Some steps after that date are already done. Pick a later date."
           }
  end

  test "remove a step; Brew day is refused", ctx do
    b = ctx["brewer1"]
    removed = call(b, :delete, "/api/production/steps/#{named(ctx.batch, "Carb").id}")
    assert removed.status == 200
    refute "Carb" in names(ctx.batch)
    assert undo(b, removed).status == 200
    assert "Carb" in names(ctx.batch)

    brew = call(b, :delete, "/api/production/steps/#{named(ctx.batch, "Brew day").id}")
    assert brew.status == 422
    assert body(brew)["error"] == "brew_day"
  end

  test "change template and brand by PATCH; Undo puts the old steps back", ctx do
    b = ctx["brewer1"]
    lager = lager_template!()
    before = names(ctx.batch)
    path = "/api/production/batches/#{ctx.batch.id}"

    changed = call(b, :patch, path, %{template_id: lager.id})
    assert changed.status == 200
    assert body(changed)["data"]["message"] == "Standard ale → Lager with transfer."
    [batch] = body(changed)["data"]["batches"]
    assert batch["template_name"] == "Lager with transfer"
    assert length(batch["vessels"]) == 2

    assert undo(b, changed).status == 200
    assert names(ctx.batch) == before
    assert map_size(vessels(ctx.batch)) == 1

    enos = brand!("Enos")
    rebranded = call(b, :patch, path, %{brand_id: enos.id})
    assert [%{"label" => "Enos P1", "brand_id" => id}] = body(rebranded)["data"]["batches"]
    assert id == enos.id
  end

  test "split, its messages, Undo split (P75–P77, P80, P89)", ctx do
    b = ctx["brewer1"]
    fv6 = tank!("FV6")
    path = "/api/production/batches/#{ctx.batch.id}/split"
    parts = fn a, c -> [%{stays: true, volume_bbl: a}, %{tank_id: c, volume_bbl: 8}] end

    short = call(b, :post, path, %{due_on: "2026-11-13", parts: parts.(10, fv6.id)})
    assert body(short)["message"] == "The parts add up to 18 bbl, but Galactic P1 is 20 bbl."

    same =
      call(b, :post, path, %{
        due_on: "2026-11-13",
        parts: [%{tank_id: fv6.id, volume_bbl: 12}, %{tank_id: fv6.id, volume_bbl: 8}]
      })

    assert body(same) == %{
             "error" => "same_tank",
             "message" => "Two parts can’t go into the same tank."
           }

    split =
      call(b, :post, path, %{
        due_on: "2026-11-13",
        split_method: "filter",
        parts: parts.(12, fv6.id)
      })

    assert split.status == 201
    data = body(split)["data"]
    [p1, p2] = data["part_ids"]
    labels = Map.new(data["batches"], &{&1["id"], &1})
    assert labels[p1]["label"] == "Galactic P1.1"
    assert %{"split_parent_id" => parent, "part_number" => 2, "split_step_id" => sid} = labels[p2]
    assert parent == ctx.batch.id
    assert sid == named(ctx.batch, "Split - Filter").id

    sched = body(call(b, :get, "/api/production/schedule?from=2026-10-26&to=2026-12-06"))["data"]
    assert Enum.count(sched["batches"], &(&1["split_parent_id"] == ctx.batch.id)) == 2

    # Undo of the split itself.
    assert undo(b, split).status == 200

    assert RockcutApi.Production.Splits.parts_of(ctx.batch) == []

    split = call(b, :post, path, %{due_on: "2026-11-13", parts: parts.(12, fv6.id)})
    [_, p2] = body(split)["data"]["part_ids"]
    undone = call(b, :delete, "/api/production/batches/#{p2}/split")
    assert undone.status == 200
    assert [%{"id" => id}] = body(undone)["data"]["batches"]
    assert id == ctx.batch.id
    assert body(call(b, :delete, path))["error"] == "not_split"
  end

  test "clean / dirty marks: create, the schedule lists them, remove, Undo; refusals (P114–P117)",
       ctx do
    b = ctx["brewer1"]
    fv8 = tank!("FV8")

    marked =
      call(b, :post, "/api/production/tanks/#{fv8.id}/condition", %{
        state: "dirty",
        note: "Gasket job"
      })

    assert marked.status == 201

    assert %{"state" => "dirty", "note" => "Gasket job", "user_name" => name, "id" => id} =
             body(marked)["data"]["mark"]

    assert name == b.name

    sched = body(call(b, :get, "/api/production/schedule"))["data"]
    assert Enum.any?(sched["condition_marks"], &(&1["id"] == id))

    assert Enum.find(sched["statuses"], &(&1["tank_id"] == fv8.id))["line"] ==
             "Empty · dirty 0 days · no CIP planned"

    removed = call(b, :delete, "/api/production/condition_marks/#{id}")
    assert removed.status == 200
    assert undo(b, removed).status == 200
    assert RockcutApi.Production.ConditionMarks.get(id)

    future =
      call(b, :post, "/api/production/tanks/#{fv8.id}/condition", %{
        state: "clean",
        marked_on: "2099-01-01"
      })

    assert body(future)["error"] == "date_invalid"
    assert call(b, :post, "/api/production/tanks/0/condition", %{state: "clean"}).status == 404
  end

  test "DEV QA fix cycle 1: the messages for days outside the beer's stay, the same tank, and a split parent",
       ctx do
    b = ctx["brewer1"]
    fv2 = vessels(ctx.batch)[0]
    path = "/api/production/batches/#{ctx.batch.id}"

    early = call(b, :post, "#{path}/transfers", %{due_on: "2026-10-25"})

    assert body(early) == %{
             "error" => "before_fill",
             "message" => "The beer isn't in that tank on that day."
           }

    same = call(b, :post, "#{path}/transfers", %{due_on: "2026-11-14", tank_id: fv2})
    assert body(same) == %{"error" => "same_tank", "message" => "The beer is already in FV2."}
    step = call(b, :post, "#{path}/steps", %{name: "Early", due_on: "2026-11-01"})
    assert body(step)["message"] == "A step can't come before brew day."

    split =
      call(b, :post, "#{path}/split", %{
        due_on: "2026-11-02",
        parts: [%{stays: true, volume_bbl: 10}, %{volume_bbl: 10}]
      })

    assert body(split)["message"] == "The split has to be after brew day."

    assert call(b, :post, "#{path}/split", %{
             due_on: "2026-11-13",
             parts: [%{stays: true, volume_bbl: 10}, %{volume_bbl: 10}]
           }).status == 201

    assert body(call(b, :delete, path)) == %{
             "error" => "split",
             "message" => "Undo the split first."
           }

    assert body(call(b, :patch, path, %{volume_bbl: 30}))["error"] == "split"
  end

  test "DEV QA fix cycle 2: the next tank, a part's volume, before the split, after the exit",
       ctx do
    b = ctx["brewer1"]
    bbt = tank!("BBT1")

    lager =
      plan!(brand!("Enos"), lager_template!(), ~D[2026-11-02], %{
        "tank_ids" => [tank!("FV1").id, bbt.id]
      })

    next =
      call(b, :post, "/api/production/batches/#{lager.id}/transfers", %{
        due_on: "2026-11-07",
        tank_id: bbt.id
      })

    assert body(next) == %{
             "error" => "same_tank",
             "message" => "The beer goes into BBT1 next, on Thu Nov 12."
           }

    path = "/api/production/batches/#{ctx.batch.id}"
    late = call(b, :post, "#{path}/steps", %{name: "Late", due_on: "2026-11-23"})

    assert body(late) == %{
             "error" => "after_exit",
             "message" => "The beer isn't in that tank on that day."
           }

    split =
      call(b, :post, "#{path}/split", %{
        due_on: "2026-11-13",
        parts: [%{stays: true, volume_bbl: 10}, %{volume_bbl: 10}]
      })

    [_, part] = body(split)["data"]["part_ids"]
    part_path = "/api/production/batches/#{part}"
    assert body(call(b, :patch, part_path, %{volume_bbl: 9}))["error"] == "split"
    early = call(b, :post, "#{part_path}/steps", %{name: "Early", due_on: "2026-11-12"})

    assert body(early) == %{
             "error" => "before_split",
             "message" => "A step can't come before the split."
           }
  end

  test "a move of steps in two batches names both batches in its preview (QA minor 10)", ctx do
    b = ctx["brewer1"]
    other = plan!(brand!("Enos"), ctx.template, ~D[2026-11-02])
    ids = [named(ctx.batch, "FDH").id, named(other, "FDH").id]

    preview =
      body(call(b, :post, "/api/production/steps/move", %{ids: ids, days: 1, preview: true}))[
        "data"
      ]["preview"]

    assert preview["batches"] |> Enum.map(& &1["id"]) |> Enum.sort() ==
             Enum.sort([ctx.batch.id, other.id])

    assert preview["following"] |> Enum.map(& &1["batch_id"]) |> Enum.uniq() |> Enum.sort() ==
             Enum.sort([ctx.batch.id, other.id])
  end

  test "Brewery members and owners only; others get 403", ctx do
    s = named(ctx.batch, "Carb")

    requests = [
      {:post, "/api/production/batches/#{ctx.batch.id}/steps",
       %{name: "x", due_on: "2026-11-10"}},
      {:post, "/api/production/batches/#{ctx.batch.id}/ramp",
       %{start: 60, target: 40, change_per_day: 10, first_on: "2026-11-13"}},
      {:post, "/api/production/batches/#{ctx.batch.id}/transfers", %{due_on: "2026-11-14"}},
      {:delete, "/api/production/batches/#{ctx.batch.id}/transfers/#{s.id}", %{}},
      {:delete, "/api/production/steps/#{s.id}", %{}},
      {:post, "/api/production/steps/#{s.id}/ramp", %{target: 40}},
      {:post, "/api/production/batches/#{ctx.batch.id}/split", %{due_on: "2026-11-13"}},
      {:delete, "/api/production/batches/#{ctx.batch.id}/split", %{}},
      {:post, "/api/production/tanks/#{tank!("FV8").id}/condition", %{state: "clean"}},
      {:delete, "/api/production/condition_marks/1", %{}}
    ]

    for {method, path, params} <- requests do
      assert call(ctx["office1"], method, path, params).status == 403, path
    end

    assert call(ctx["owner"], :post, "/api/production/batches/#{ctx.batch.id}/steps", %{
             name: "x",
             due_on: "2026-11-10"
           }).status == 201
  end
end
