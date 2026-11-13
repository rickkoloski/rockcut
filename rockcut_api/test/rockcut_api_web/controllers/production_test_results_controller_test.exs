defmodule RockcutApiWeb.ProductionTestResultsControllerTest do
  @moduledoc """
  D56 §3.2 over HTTP (spec §6 S7–S15, API side): "Has a result" on step
  types, "Retest after" on template steps, Pass / Fail at check-off on the
  schedule, the Brewery board and the brewhouse device, a changed result,
  the JSON Stage 4 reads, the 422s and the 403 for other departments.
  Every write is checked after a reload.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.ProductionFixtures

  alias RockcutApi.{AccountsFixtures, Production, Repo, StaffCodes, Tasks}
  alias RockcutApi.Brewing.Batch
  alias RockcutApi.Production.Step
  alias RockcutApi.Tasks.Task

  setup do
    p = personas(~w(owner breweryMgr brewer1 brewer2 office1))
    {:ok, _} = StaffCodes.set(p["brewer1"], "1111", p["breweryMgr"])

    {:ok, t} = Production.create_template(%{"name" => "Lager D-test"})
    [brew] = t.steps
    t = add!(t, "FDH", 7, after: brew)
    t = add!(t, "Diacetyl test", 12, after: entry(t, "FDH"))
    t = add!(t, "Set temp", 14, after: entry(t, "Diacetyl test"), temperature: 34)
    t = add!(t, "Package", 20, after: entry(t, "Set temp - 34°"))
    [] = t.issues

    device = AccountsFixtures.device_fixture(%{home: "brewery", name: "Brewery Test 1"})
    token = AccountsFixtures.device_token_fixture(device, "Brewhouse Tab")
    %{p: p, template: t, fv3: tank!("FV3"), device: device, token: token}
  end

  defp day(offset), do: Date.add(Tasks.today(), offset)
  defp iso(offset), do: Date.to_iso8601(day(offset))
  defp step(s), do: Repo.get!(Step, s.id)

  # Brewed 12 days ago as #40 (brew day checked off on its day): the
  # Diacetyl test is today, the Set temp in 2 days.
  defp brewed(ctx) do
    %{"data" => %{"batches" => [%{"id" => id}]}} =
      call(ctx.p["brewer1"], :post, "/api/production/batches", %{
        brand_id: brand!("Galactic").id,
        template_id: ctx.template.id,
        brew_on: iso(-12),
        volume_bbl: "20",
        tank_ids: [ctx.fv3.id]
      })
      |> json_response(201)

    batch = Repo.get!(Batch, id)

    call(
      ctx.p["brewer1"],
      :post,
      "/api/production/steps/#{named(batch, "Brew day").id}/complete",
      %{
        done_on: iso(-12),
        batch_number: "40"
      }
    )
    |> json_response(200)

    batch
  end

  defp complete_url(s), do: "/api/production/steps/#{s.id}/complete"

  defp step_json(body, s) do
    body["data"]["batches"]
    |> Enum.flat_map(& &1["steps"])
    |> Enum.find(&(&1["id"] == s.id))
  end

  test "S7: Has a result on a step type and Retest after on a template step", ctx do
    mgr = ctx.p["breweryMgr"]
    rouse = type!("Rouse")

    assert %{"data" => %{"has_result" => true}} =
             call(mgr, :patch, "/api/production/step_types/#{rouse.id}", %{has_result: true})
             |> json_response(200)

    types = call(mgr, :get, "/api/production/step_types") |> json_response(200)
    on = for t <- types["data"], t["has_result"], do: t["name"]
    assert Enum.sort(on) == ["Diacetyl test", "Gravity check", "Rouse"]

    # Built in too: it isn't the behavior.
    set_temp = type!("Set temp")

    call(mgr, :patch, "/api/production/step_types/#{set_temp.id}", %{has_result: true})
    |> json_response(200)

    assert type!("Set temp").has_result

    dt = entry(ctx.template, "Diacetyl test")
    url = "/api/production/templates/#{ctx.template.id}/steps/#{dt.id}"

    body = call(mgr, :patch, url, %{retest_days: 4}) |> json_response(200)
    dt_json = Enum.find(body["data"]["steps"], &(&1["id"] == dt.id))
    assert %{"has_result" => true, "retest_days" => 4} = dt_json
    assert Repo.reload!(dt).retest_days == 4

    # S14: retest days 0 and 31 are refused.
    for bad <- [0, 31] do
      assert %{"errors" => %{"retest_days" => ["Enter 1–30 days."]}} =
               call(mgr, :patch, url, %{retest_days: bad}) |> json_response(422)
    end

    assert Repo.reload!(dt).retest_days == 4
  end

  test "S8, S13: Fail → Retest → Move all over HTTP; the JSON Stage 4 reads", ctx do
    batch = brewed(ctx)
    dt = named(batch, "Diacetyl test")
    b = ctx.p["brewer1"]

    # S13: no result.
    assert %{"error" => "result_required", "message" => "Record Pass or Fail."} =
             call(b, :post, complete_url(dt)) |> json_response(422)

    assert %{"error" => "fail_action_required"} =
             call(b, :post, complete_url(dt), %{result: "fail"}) |> json_response(422)

    assert %{"error" => "retest_days_invalid"} =
             call(b, :post, complete_url(dt), %{
               result: "fail",
               fail_action: "retest",
               retest_days: 31
             })
             |> json_response(422)

    # The preview: the question, then the move for a Fail with a retest.
    assert %{"data" => %{"preview" => %{"needs_result" => true, "retest_days" => 2}}} =
             call(b, :post, complete_url(dt), %{preview: true}) |> json_response(200)

    %{"data" => %{"preview" => p}} =
      call(b, :post, complete_url(dt), %{preview: true, result: "fail", fail_action: "retest"})
      |> json_response(200)

    assert p["retest_on"] == iso(2)
    assert p["move"]["days"] == 2
    assert p["move"]["default_answer"] == "move_all"

    assert [%{"name" => "Set temp - 34°", "new_due_on" => new}] =
             Enum.take(p["move"]["following"], 1)

    assert new == iso(4)

    # No answer: the prompt.
    assert %{"error" => "answer_required", "preview" => %{"days" => 2}} =
             call(b, :post, complete_url(dt), %{result: "fail", fail_action: "retest"})
             |> json_response(422)

    body =
      call(b, :post, complete_url(dt), %{
        result: "fail",
        fail_action: "retest",
        answer: "move_all"
      })
      |> json_response(200)

    assert body["undo_token"]
    retest_id = body["data"]["retest_id"]
    retest = Repo.get!(Step, retest_id)

    assert %{"result" => "fail", "has_result" => true, "retest_of_id" => nil} =
             step_json(body, dt)

    assert %{
             "name" => "Diacetyl test - retest",
             "retest_of_id" => retest_of,
             "added" => true,
             "result" => nil,
             "retest_days" => 2,
             "due_on" => due
           } = step_json(body, retest)

    assert retest_of == dt.id and due == iso(2)

    # Kept after a reload.
    sched = call(b, :get, "/api/production/schedule") |> json_response(200)
    [json] = Enum.filter(sched["data"]["batches"], &(&1["id"] == batch.id))
    assert Enum.find(json["steps"], &(&1["id"] == dt.id))["result"] == "fail"
    assert Enum.find(json["steps"], &(&1["name"] == "Set temp - 34°"))["due_on"] == iso(4)
    assert Enum.find(sched["data"]["step_types"], &(&1["name"] == "Diacetyl test"))["has_result"]

    # S10: Undo over HTTP takes the retest away.
    call(b, :post, "/api/production/undo/#{body["undo_token"]}") |> json_response(200)
    assert Repo.get(Step, retest.id) == nil
    assert %{done_on: nil, result: nil} = step(dt)
    assert named(batch, "Set temp - 34°").due_on == day(2)
  end

  test "Change result and Mark not done over HTTP (decision 8)", ctx do
    batch = brewed(ctx)
    dt = named(batch, "Diacetyl test")
    b = ctx.p["brewer1"]
    call(b, :post, complete_url(dt), %{result: "pass"}) |> json_response(200)

    url = "/api/production/steps/#{dt.id}/result"

    assert %{"error" => "answer_required"} =
             call(b, :patch, url, %{result: "fail", fail_action: "retest"}) |> json_response(422)

    body =
      call(b, :patch, url, %{result: "fail", fail_action: "retest", answer: "move_all"})
      |> json_response(200)

    assert body["undo_token"]
    retest = Repo.get!(Step, body["data"]["retest_id"])
    assert step(dt).result == "fail"
    assert named(batch, "Set temp - 34°").due_on == day(4)

    # A done retest blocks Fail → Pass and Mark not done.
    call(b, :post, complete_url(retest), %{result: "pass", done_on: iso(0), answer: "move_only"})
    |> json_response(200)

    assert %{"error" => "retest_done", "message" => "Mark the retest not done first."} =
             call(b, :patch, url, %{result: "pass"}) |> json_response(422)

    assert %{"error" => "retest_done"} =
             call(b, :post, "/api/production/steps/#{dt.id}/uncomplete") |> json_response(422)

    call(b, :post, "/api/production/steps/#{retest.id}/uncomplete") |> json_response(200)
    call(b, :patch, url, %{result: "pass"}) |> json_response(200)
    assert Repo.get(Step, retest.id) == nil
    assert %{result: "pass"} = step(dt)
    assert named(batch, "Set temp - 34°").due_on == day(2)

    fdh = named(batch, "FDH")

    assert %{"error" => "not_done"} =
             call(b, :patch, "/api/production/steps/#{fdh.id}/result", %{result: "pass"})
             |> json_response(422)
  end

  test "S15: other departments get 403 for a result", ctx do
    batch = brewed(ctx)
    dt = named(batch, "Diacetyl test")
    office = ctx.p["office1"]

    assert call(office, :post, complete_url(dt), %{result: "fail", fail_action: "continue"}).status ==
             403

    assert call(office, :patch, "/api/production/steps/#{dt.id}/result", %{result: "pass"}).status ==
             403

    assert step(dt).done_on == nil
  end

  test "S9: a linked task ticked on the Brewery board records the result", ctx do
    batch = brewed(ctx)
    dt = named(batch, "Diacetyl test")
    task = Repo.get_by!(Task, production_step_id: dt.id)
    url = "/api/boards/brewery/tasks/#{task.id}/complete"
    b = ctx.p["brewer1"]

    assert %{"error" => "result_required"} = call(b, :post, url) |> json_response(422)

    assert %{"data" => %{"preview" => %{"needs_result" => true, "retest_days" => 2}}} =
             call(b, :post, url, %{preview: true}) |> json_response(200)

    body = call(b, :post, url, %{result: "fail", fail_action: "continue"}) |> json_response(200)
    assert body["data"]["done"]
    assert body["data"]["production"]["result"] == "fail"
    assert %{result: "fail", done_on: done} = step(dt)
    assert done == day(0)
    assert named(batch, "Set temp - 34°").due_on == day(2)

    # Kept after a reload, on the board.
    board =
      call(b, :get, "/api/boards/brewery/tasks", %{from: iso(0), to: iso(0)})
      |> json_response(200)

    linked =
      board["data"]["days"] |> Enum.flat_map(& &1["cards"]) |> Enum.find(&(&1["id"] == task.id))

    assert linked["production"]["result"] == "fail"
  end

  test "S12: Fail → Retest on the brewhouse device, as the person", ctx do
    batch = brewed(ctx)
    dt = named(batch, "Diacetyl test")

    assert %{"error" => "staff_code_required"} =
             call_device(ctx.token, :post, complete_url(dt), %{
               result: "fail",
               fail_action: "retest",
               answer: "move_all"
             })
             |> json_response(422)

    body =
      call_device(ctx.token, :post, complete_url(dt), %{
        result: "fail",
        fail_action: "retest",
        answer: "move_all",
        staff_code: "1111"
      })
      |> json_response(200)

    assert body["recorded_as"] == ctx.p["brewer1"].name
    assert %{result: "fail", done_by_id: by, done_on_device_id: on} = step(dt)
    assert {by, on} == {ctx.p["brewer1"].id, ctx.device.id}

    assert step_json(body, dt)["done_on_device"] == %{
             "id" => ctx.device.id,
             "name" => "Brewery Test 1"
           }

    retest = Repo.get!(Step, body["data"]["retest_id"])
    assert retest.due_on == day(2)
    assert Repo.get_by(Task, production_step_id: retest.id)

    # The board's tick on the device goes the same way.
    task = Repo.get_by!(Task, production_step_id: retest.id)
    rt_url = "/api/boards/brewery/tasks/#{task.id}/complete"

    assert %{"error" => "result_required"} =
             call_device(ctx.token, :post, rt_url, %{staff_code: "1111", done_on: iso(0)})
             |> json_response(422)
  end
end
