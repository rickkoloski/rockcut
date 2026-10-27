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

  test "D49 pencilled: plan pencilled (X1), schedule, pencil in, schedule_first, flag_muted",
       ctx do
    b = ctx["brewer1"]

    res =
      call(b, :post, "/api/production/batches", %{
        brand_id: ctx.brand.id,
        template_id: ctx.template.id,
        brew_on: "2026-11-02",
        volume_bbl: 20,
        tank_ids: [nil],
        pencilled: true
      })

    assert res.status == 201
    [batch] = body(res)["data"]["batches"]
    assert %{"p_number" => "X1", "label" => "Galactic X1", "pencilled" => true} = batch
    brew = Enum.find(batch["steps"], & &1["first_brew"])

    refused =
      call(b, :post, "/api/production/steps/#{brew["id"]}/complete", %{preview: true})

    assert refused.status == 422

    assert %{"error" => "schedule_first", "message" => "Schedule this batch first."} =
             body(refused)

    scheduled = call(b, :post, "/api/production/batches/#{batch["id"]}/schedule", %{})
    assert scheduled.status == 200
    assert [%{"p_number" => "P1", "pencilled" => false}] = body(scheduled)["data"]["batches"]
    assert body(scheduled)["undo_token"]

    pencilled = call(b, :post, "/api/production/batches/#{batch["id"]}/pencil", %{})
    assert [%{"p_number" => "X1", "pencilled" => true}] = body(pencilled)["data"]["batches"]

    # Its overlap with a scheduled batch in FV3: the muted one can't be signed off.
    call(b, :patch, "/api/production/batches/#{batch["id"]}/vessels/0", %{tank_id: ctx.tank.id})
    plan(b, ctx, "2026-11-05")

    flags =
      body(call(b, :get, "/api/production/schedule?from=2026-10-26&to=2026-12-06"))["data"][
        "flags"
      ]

    muted = Enum.find(flags, & &1["muted"])
    assert muted["kind"] == "tank_overlap"

    res =
      call(b, :post, "/api/production/flags/signoff", %{
        key: muted["key"],
        signature: muted["signature"]
      })

    assert res.status == 422
    assert body(res)["error"] == "flag_muted"

    assert call(ctx["bartender1"], :post, "/api/production/batches/#{batch["id"]}/schedule", %{}).status ==
             403
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

    # D48 DEV QA Z3: a date isn't changed here, so it's refused, not ignored;
    # nothing else in the request is saved either.
    for field <- ~w(due_on done_on completed_at) do
      dated =
        call(b, :patch, "/api/production/steps/#{fdh["id"]}", %{field => "2026-11-12", notes: "x"})

      assert {dated.status, body(dated)} ==
               {422,
                %{
                  "error" => "date_not_here",
                  "message" =>
                    "To change a step's date, move it (or check it off on the day it was done)."
                }}
    end

    fdh_now = Repo.get!(RockcutApi.Production.Step, fdh["id"])
    assert fdh_now.due_on == Date.from_iso8601!(fdh["due_on"])
    assert fdh_now.notes == "Watch the glycol"

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

    for q <- ["from=2026-10-26&to=2026-10-26", "from=2026-10-01&to=2028-09-30"] do
      range = call(b, :get, "/api/production/schedule?#{q}")
      assert {range.status, body(range)["error"]} == {422, "range_invalid"}
    end
  end

  test "undo over HTTP: a move back, 409 when stale, 404 for someone else; CIPs, sign-offs, outages",
       ctx do
    b = ctx["brewer1"]
    [batch] = body(plan(b, ctx))["data"]["batches"]
    fdh = Enum.find(batch["steps"], &(&1["name"] == "FDH"))

    moved =
      call(b, :post, "/api/production/steps/move", %{
        ids: [fdh["id"]],
        days: 1,
        answer: "move_only"
      })
      |> body()

    token = moved["undo_token"]
    assert is_binary(token)
    assert call(ctx["brewer2"], :post, "/api/production/undo/#{token}").status == 404

    undone = call(b, :post, "/api/production/undo/#{token}")
    assert undone.status == 200
    [back] = body(undone)["data"]["batches"]
    assert Enum.find(back["steps"], &(&1["id"] == fdh["id"]))["due_on"] == fdh["due_on"]

    # Stale: someone changed it since.
    noted = call(b, :patch, "/api/production/steps/#{fdh["id"]}", %{notes: "One"}) |> body()
    call(ctx["brewer2"], :patch, "/api/production/steps/#{fdh["id"]}", %{notes: "Two"})
    stale = call(b, :post, "/api/production/undo/#{noted["undo_token"]}")
    assert stale.status == 409

    assert body(stale) == %{
             "error" => "undo_stale",
             "message" => "Something changed since. Nothing was undone."
           }

    # A previewed move has no token and changes nothing.
    preview =
      call(b, :post, "/api/production/steps/move", %{ids: [fdh["id"]], days: 1, preview: true})
      |> body()

    refute Map.has_key?(preview, "undo_token")

    # CIPs
    created =
      call(b, :post, "/api/production/cips", %{tank_id: ctx.tank.id, due_on: "2026-12-01"})

    assert created.status == 201
    cip = body(created)["data"]["cip"]
    assert {cip["name"], cip["tank_id"], cip["batch_id"]} == {"CIP & Sanitize", ctx.tank.id, nil}
    assert body(created)["undo_token"]

    patched = call(b, :patch, "/api/production/cips/#{cip["id"]}", %{notes: "Caustic"}) |> body()
    assert patched["data"]["cip"]["notes"] == "Caustic"

    sched = call(b, :get, "/api/production/schedule?from=2026-11-20&to=2026-12-10") |> body()
    assert Enum.any?(sched["data"]["cips"], &(&1["id"] == cip["id"]))
    assert Enum.any?(sched["data"]["statuses"], &(&1["tank_id"] == ctx.tank.id))
    assert is_list(sched["data"]["flags"])

    # A batch step isn't a CIP.
    assert call(b, :patch, "/api/production/cips/#{fdh["id"]}", %{notes: "x"}).status == 404
    deleted = call(b, :delete, "/api/production/cips/#{cip["id"]}")
    assert body(deleted)["data"]["deleted_id"] == cip["id"]
    assert call(b, :post, "/api/production/undo/#{body(deleted)["undo_token"]}").status == 200

    # Sign-offs
    signed =
      call(b, :post, "/api/production/flags/signoff", %{
        key: "no_tank:#{batch["id"]}.0",
        signature: "abc",
        note: "Tank decided on brew morning."
      })

    assert signed.status == 200
    key = URI.encode("no_tank:#{batch["id"]}.0", &URI.char_unreserved?/1)
    assert call(b, :delete, "/api/production/flags/signoff/#{key}").status == 200
    assert call(b, :delete, "/api/production/flags/signoff/#{key}").status == 404

    # D46's out-of-service writes answer a token too.
    out =
      call(b, :post, "/api/production/tanks/#{ctx.tank.id}/outages", %{
        starts_on: "2027-01-04",
        ends_on: "2027-01-06"
      })
      |> body()

    assert call(b, :post, "/api/production/undo/#{out["undo_token"]}").status == 200
    assert Production.get_tank(ctx.tank.id).outages == []
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
