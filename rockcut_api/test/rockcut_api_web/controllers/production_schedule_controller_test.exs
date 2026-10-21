defmodule RockcutApiWeb.ProductionScheduleControllerTest do
  @moduledoc "D47: the schedule, batch and step routes over HTTP, and who may use them (P39, P62–P64)."
  use RockcutApiWeb.ConnCase

  import RockcutApi.PersonaFixtures

  alias RockcutApi.{Production, Repo}
  alias RockcutApi.Brewing.Brand

  setup do
    people = personas(~w(brewer1 brewer2 owner floater bartender1 barMgr office1))
    brand = Repo.insert!(%Brand{name: "Galactic", status: "active"})
    {:ok, t} = Production.create_template(%{"name" => "Ale"})
    type_id = fn name -> Enum.find(Production.list_step_types(), &(&1.name == name)).id end
    [brew] = t.steps

    {:ok, t} =
      Production.add_step(t, %{
        "step_type_id" => type_id.("FDH"),
        "day_offset" => 7,
        "comes_after_id" => brew.id
      })

    fdh = Enum.find(t.steps, &(&1.day_offset == 7))

    {:ok, t} =
      Production.add_step(t, %{
        "step_type_id" => type_id.("Package"),
        "day_offset" => 20,
        "comes_after_id" => fdh.id
      })

    {:ok, tank} = Production.create_tank(%{"name" => "FV3", "capacity_bbl" => "20"})
    Map.merge(people, %{brand: brand, template: t, tank: tank})
  end

  defp body(conn), do: Jason.decode!(conn.resp_body)

  defp plan(user, ctx, brew_on \\ "2026-11-02") do
    call(user, :post, "/api/production/batches", %{
      brand_id: ctx.brand.id,
      template_id: ctx.template.id,
      brew_on: brew_on,
      volume_bbl: 20,
      tank_ids: [ctx.tank.id]
    })
  end

  test "plan a batch, read the schedule, move a step with a preview, check off brew day", ctx do
    b = ctx["brewer1"]
    planned = plan(b, ctx)
    assert planned.status == 201
    assert %{"batches" => [batch], "renumbered" => []} = body(planned)["data"]
    assert batch["label"] == "Galactic P1"
    assert batch["p_number"] == "P1"
    assert batch["vessels"] == [%{"vessel_index" => 0, "tank_id" => ctx.tank.id}]

    assert Enum.map(batch["steps"], &{&1["name"], &1["due_on"]}) == [
             {"Brew day", "2026-11-02"},
             {"FDH", "2026-11-09"},
             {"Package", "2026-11-22"},
             {"CIP & Sanitize", "2026-11-22"}
           ]

    [brew, fdh | _] = batch["steps"]
    assert brew["first_brew"]
    refute fdh["first_brew"]

    sched = call(b, :get, "/api/production/schedule?from=2026-10-26&to=2026-12-06")
    assert sched.status == 200
    data = body(sched)["data"]
    assert [%{"id" => id}] = data["batches"]
    assert id == batch["id"]
    assert data["next_batch_number"] == "1"
    assert Enum.any?(data["tanks"], &(&1["name"] == "FV3"))
    assert Enum.any?(data["brewers"], &(&1["name"] == b.name))
    assert data["from"] == "2026-10-26"

    preview =
      call(b, :post, "/api/production/steps/move", %{ids: [fdh["id"]], days: 2, preview: true})
      |> body()

    assert %{"default_answer" => "move_all", "following" => [_, _]} = preview["data"]["preview"]

    needs = call(b, :post, "/api/production/steps/move", %{ids: [fdh["id"]], days: 2})
    assert needs.status == 422
    assert body(needs)["error"] == "answer_required"
    assert body(needs)["preview"]["following"] |> length() == 2

    moved =
      call(b, :post, "/api/production/steps/move", %{
        ids: [fdh["id"]],
        days: 2,
        answer: "move_all"
      })

    assert moved.status == 200
    [after_move] = body(moved)["data"]["batches"]
    assert Enum.find(after_move["steps"], &(&1["id"] == fdh["id"]))["due_on"] == "2026-11-11"

    # P39: a planned brew day needs its number (a batch brewed today: done on plan).
    today = RockcutApi.Tasks.today() |> Date.to_iso8601()
    [todays] = body(plan(b, ctx, today))["data"]["batches"]
    brew = Enum.find(todays["steps"], & &1["first_brew"])
    path = "/api/production/steps/#{brew["id"]}/complete"

    pre = call(b, :post, path, %{preview: true}) |> body()
    assert pre["data"]["preview"]["needs_batch_number"]
    assert pre["data"]["preview"]["next_batch_number"] == "1"
    assert pre["data"]["preview"]["move"] == nil

    missing = call(b, :post, path, %{})
    assert missing.status == 422
    assert body(missing)["error"] == "batch_number_required"

    done = call(b, :post, path, %{batch_number: "44"})
    assert done.status == 200

    assert %{"batches" => [%{"label" => "Galactic #44", "status" => "fermenting"}]} =
             body(done)["data"]

    future =
      call(b, :post, "/api/production/steps/#{fdh["id"]}/complete", %{done_on: "2099-01-01"})

    assert body(future)["error"] == "done_on_future"
  end

  test "step edits, vessel changes, shift and delete answer the batch", ctx do
    b = ctx["brewer1"]
    [batch] = body(plan(b, ctx))["data"]["batches"]
    fdh = Enum.find(batch["steps"], &(&1["name"] == "FDH"))

    edited =
      call(b, :patch, "/api/production/steps/#{fdh["id"]}", %{
        detail: "#2",
        assignee_id: ctx["brewer2"].id,
        notes: "Watch the glycol"
      })

    assert edited.status == 200
    step = Enum.find(hd(body(edited)["data"]["batches"])["steps"], &(&1["id"] == fdh["id"]))
    assert step["name"] == "FDH - #2"
    assert step["assignee"] == %{"id" => ctx["brewer2"].id, "name" => ctx["brewer2"].name}

    bad =
      call(b, :patch, "/api/production/steps/#{fdh["id"]}", %{assignee_id: ctx["bartender1"].id})

    assert bad.status == 422
    assert body(bad)["errors"]["assignee_id"] == ["must be a Brewery member"]

    unassigned =
      call(b, :patch, "/api/production/batches/#{batch["id"]}/vessels/0", %{tank_id: nil})

    assert hd(hd(body(unassigned)["data"]["batches"])["vessels"])["tank_id"] == nil

    shifted = call(b, :post, "/api/production/batches/#{batch["id"]}/shift", %{days: 3}) |> body()
    assert shifted["data"]["moved"] == 4

    deleted = call(b, :delete, "/api/production/batches/#{batch["id"]}")
    assert body(deleted)["data"]["deleted_id"] == batch["id"]
    assert call(b, :delete, "/api/production/batches/#{batch["id"]}").status == 404

    range = call(b, :get, "/api/production/schedule?from=2026-10-26&to=2026-10-01")
    assert body(range)["error"] == "range_invalid"
  end

  test "Brewery members and owners use it; other departments get 403 (P62–P64)", ctx do
    for key <- ~w(brewer2 owner floater) do
      assert call(ctx[key], :get, "/api/production/schedule").status == 200, key
    end

    assert plan(ctx["owner"], ctx).status == 201

    for key <- ~w(bartender1 barMgr office1) do
      assert call(ctx[key], :get, "/api/production/schedule").status == 403, key
      assert plan(ctx[key], ctx).status == 403, key

      assert call(ctx[key], :post, "/api/production/steps/move", %{ids: [1], days: 1}).status ==
               403
    end
  end
end
