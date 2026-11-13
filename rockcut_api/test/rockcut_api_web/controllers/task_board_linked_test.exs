defmodule RockcutApiWeb.TaskBoardLinkedTest do
  @moduledoc """
  D49 task 3 (§3.12, plan decisions 7–9): linked tasks on the Brewery board.
  Their writes go to Production with the schedule's prompts and an undo
  token; D50: the brewhouse device makes them with a staff code, as that
  person. `linked=true` and "Show planned batches" (`/api/me`).
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.ProductionFixtures
  import Phoenix.ConnTest
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{AccountsFixtures, Repo, StaffCodes, Tasks}
  alias RockcutApi.Production.Step
  alias RockcutApi.Tasks.Task

  setup do
    p = personas(~w(owner breweryMgr brewer1 brewer2 bartender1))
    {:ok, _} = StaffCodes.set(p["brewer1"], "1111", p["breweryMgr"])
    fv4 = tank!("FV4")
    %{p: p, fv4: fv4, template: ale_template!(), brewery: Tasks.today()}
  end

  defp day(offset), do: Date.add(Tasks.today(), offset)
  defp iso(offset), do: Date.to_iso8601(day(offset))

  # Planned through the schedule's API, as the Gantt does.
  defp plan(ctx, brand, brew_offset) do
    %{"data" => %{"batches" => [%{"id" => id}]}} =
      call(ctx.p["brewer1"], :post, "/api/production/batches", %{
        brand_id: brand!(brand).id,
        template_id: ctx.template.id,
        brew_on: iso(brew_offset),
        volume_bbl: "20",
        tank_ids: [ctx.fv4.id]
      })
      |> json_response(201)

    Repo.get!(RockcutApi.Brewing.Batch, id)
  end

  # A batch brewed `offset` days ago as #42 (brew day checked off on its day).
  defp brewed(ctx, brand, offset) do
    batch = plan(ctx, brand, -offset)
    brew = named(batch, "Brew day")

    call(ctx.p["brewer1"], :post, "/api/production/steps/#{brew.id}/complete", %{
      done_on: iso(-offset),
      batch_number: "42"
    })
    |> json_response(200)

    batch
  end

  defp task_of(step), do: Repo.get_by!(Task, production_step_id: step.id)
  defp step(s), do: Repo.get!(Step, s.id)
  defp task_url(task, suffix \\ ""), do: "/api/boards/brewery/tasks/#{task.id}#{suffix}"

  describe "the board" do
    test "P90: linked tasks carry `production`; linked=true keeps only them", ctx do
      batch = plan(ctx, "Galactic", 2)
      fdh = named(batch, "FDH")

      {:ok, own} =
        Tasks.create(
          RockcutApi.TaskFixtures.brewery_board(),
          %{"title" => "Keg wash", "due_on" => iso(9)},
          ctx.p["brewer1"]
        )

      body =
        call(ctx.p["brewer1"], :get, "/api/boards/brewery/tasks", %{from: iso(9), to: iso(9)})
        |> json_response(200)

      [%{"cards" => cards}] = body["data"]["days"]
      linked = Enum.find(cards, &(&1["title"] == "FV4 · Galactic P1 · FDH"))

      assert linked["production"] == %{
               "step_id" => fdh.id,
               "batch_id" => batch.id,
               "batch_status" => "planned",
               "planned" => true,
               # Lead decisions 8.2: what the board's prompts name, not parsed from the title.
               "step_name" => "FDH",
               "batch_label" => "Galactic P1",
               "result" => nil
             }

      assert Enum.find(cards, &(&1["id"] == own.id))["production"] == nil

      body =
        call(ctx.p["brewer1"], :get, "/api/boards/brewery/tasks", %{
          from: iso(9),
          to: iso(9),
          linked: "true"
        })
        |> json_response(200)

      [%{"cards" => cards}] = body["data"]["days"]
      assert Enum.map(cards, & &1["title"]) == ["FV4 · Galactic P1 · FDH"]
    end

    test "Move all to today leaves linked tasks to their steps", ctx do
      batch = brewed(ctx, "Crusher", 10)
      fdh = named(batch, "FDH")
      assert task_of(fdh).due_on == day(-3)

      {:ok, own} =
        Tasks.create(
          RockcutApi.TaskFixtures.brewery_board(),
          %{"title" => "Keg wash", "due_on" => iso(-2)},
          ctx.p["brewer1"]
        )

      assert %{"moved" => 1} =
               call(ctx.p["brewer1"], :post, "/api/boards/brewery/tasks/move_overdue_to_today")
               |> json_response(200)

      assert Repo.get!(Task, own.id).due_on == day(0)
      assert task_of(fdh).due_on == day(-3)
    end
  end

  describe "move (P92)" do
    test "without an answer: the move prompt's preview; with one: moved, with an undo token",
         ctx do
      batch = plan(ctx, "Crusher", 2)
      fdh = named(batch, "FDH")
      task = task_of(fdh)
      b1 = ctx.p["brewer1"]

      body = call(b1, :post, task_url(task, "/move"), %{due_on: iso(11)}) |> json_response(422)
      assert body["error"] == "answer_required"
      assert body["preview"]["following"] != []

      assert %{"data" => %{"preview" => %{"following" => [_ | _]}}} =
               call(b1, :post, task_url(task, "/move"), %{due_on: iso(11), preview: true})
               |> json_response(200)

      assert step(fdh).due_on == day(9)

      body =
        call(b1, :post, task_url(task, "/move"), %{due_on: iso(11), answer: "move_all"})
        |> json_response(200)

      assert body["data"]["due_on"] == iso(11)
      assert is_binary(body["undo_token"])
      assert step(fdh).due_on == day(11)
      assert step(named(batch, "Carb")).due_on == day(18)

      # The board's Undo is the schedule's.
      call(b1, :post, "/api/production/undo/#{body["undo_token"]}") |> json_response(200)
      assert step(fdh).due_on == day(9)
      assert task_of(fdh).due_on == day(9)
    end

    test "the same day is a reorder; Future is refused", ctx do
      batch = plan(ctx, "Crusher", 2)
      task = task_of(named(batch, "FDH"))
      b1 = ctx.p["brewer1"]

      {:ok, own} =
        Tasks.create(
          RockcutApi.TaskFixtures.brewery_board(),
          %{"title" => "Keg wash", "due_on" => iso(9)},
          b1
        )

      body =
        call(b1, :post, task_url(task, "/move"), %{due_on: iso(9), before_id: own.id})
        |> json_response(200)

      assert body["undo_token"] == nil
      assert Repo.get!(Task, task.id).position == 1
      assert Repo.get!(Task, own.id).position == 2

      assert %{"error" => "linked_task"} =
               call(b1, :post, task_url(task, "/move"), %{due_on: nil}) |> json_response(422)
    end
  end

  describe "complete and uncomplete" do
    test "P95: brew day asks for the batch number, then checks off with it", ctx do
      batch = plan(ctx, "Galactic", 0)
      brew = named(batch, "Brew day")
      task = task_of(brew)
      b1 = ctx.p["brewer1"]

      assert %{"data" => %{"preview" => %{"needs_batch_number" => true}}} =
               call(b1, :post, task_url(task, "/complete"), %{preview: true})
               |> json_response(200)

      assert %{"error" => "batch_number_required"} =
               call(b1, :post, task_url(task, "/complete"), %{}) |> json_response(422)

      body =
        call(b1, :post, task_url(task, "/complete"), %{batch_number: "44"}) |> json_response(200)

      assert body["data"]["done"]
      assert body["data"]["title"] == "FV4 · Galactic #44 · Brew day"
      assert step(brew).done_on == day(0)
      assert is_binary(body["undo_token"])
    end

    test "P93/P94: checked off late it moves to today, with the move prompt; no display", ctx do
      batch = brewed(ctx, "Crusher", 10)
      fdh = named(batch, "FDH")
      task = task_of(fdh)
      b1 = ctx.p["brewer1"]

      assert %{"error" => "answer_required"} =
               call(b1, :post, task_url(task, "/complete"), %{}) |> json_response(422)

      body =
        call(b1, :post, task_url(task, "/complete"), %{answer: "move_only"}) |> json_response(200)

      assert %{"done" => true, "due_on" => due, "completed_on" => due} = body["data"]
      assert due == iso(0)
      assert step(fdh).done_on == day(0)

      # Un-check: the step is not done again.
      body = call(b1, :post, task_url(task, "/uncomplete")) |> json_response(200)
      assert body["data"]["done"] == false
      assert step(fdh).done_on == nil
    end

    test "P103: a standalone CIP checked off on the board", ctx do
      %{"data" => %{"cip" => %{"id" => id}}} =
        call(ctx.p["brewer1"], :post, "/api/production/cips", %{
          tank_id: ctx.fv4.id,
          due_on: iso(0)
        })
        |> json_response(201)

      task = Repo.get_by!(Task, production_step_id: id)
      assert task.title == "FV4 · CIP & Sanitize"

      board =
        call(ctx.p["brewer1"], :get, "/api/boards/brewery/tasks", %{from: iso(0), to: iso(0)})
        |> json_response(200)

      [%{"cards" => cards}] = board["data"]["days"]

      assert %{"step_name" => "CIP & Sanitize", "batch_label" => nil, "batch_id" => nil} =
               Enum.find(cards, &(&1["id"] == task.id))["production"]

      call(ctx.p["brewer1"], :post, task_url(task, "/complete")) |> json_response(200)
      assert Repo.get!(Step, id).done_on == day(0)
    end
  end

  describe "edit and delete" do
    test "P96–P98: notes and assignee go to the step; the title and repeats are refused", ctx do
      batch = plan(ctx, "Crusher", 2)
      fdh = named(batch, "FDH")
      task = task_of(fdh)
      b1 = ctx.p["brewer1"]

      body =
        call(b1, :patch, task_url(task), %{
          title: task.title,
          notes: "Citra",
          assignee_id: ctx.p["brewer2"].id
        })
        |> json_response(200)

      assert body["data"]["notes"] == "Citra"
      assert %{notes: "Citra", assignee_id: a} = step(fdh)
      assert a == ctx.p["brewer2"].id

      assert %{
               "error" => "linked_task",
               "message" => "This task comes from the production schedule."
             } =
               call(b1, :patch, task_url(task), %{title: "Something else"}) |> json_response(422)

      assert %{"error" => "linked_task"} =
               call(b1, :patch, task_url(task), %{repeat: "weekly", repeat_weekdays: [1]})
               |> json_response(422)

      assert %{"error" => "linked_task"} =
               call(b1, :post, task_url(task, "/stop_repeating")) |> json_response(422)

      assert %{"error" => "linked_task"} =
               call(b1, :get, task_url(task, "/series")) |> json_response(422)

      # Steps go to Brewery members only.
      assert call(b1, :patch, task_url(task), %{assignee_id: ctx.p["bartender1"].id}).status ==
               422

      # A day change in the edit dialog is a move.
      assert %{"error" => "answer_required"} =
               call(b1, :patch, task_url(task), %{due_on: iso(10)}) |> json_response(422)

      call(b1, :patch, task_url(task), %{due_on: iso(10), answer: "move_only"})
      |> json_response(200)

      assert step(fdh).due_on == day(10)
    end

    test "P99: delete takes it off the task list; the step stays; Undo brings it back", ctx do
      batch = plan(ctx, "Crusher", 2)
      fdh = named(batch, "FDH")
      task = task_of(fdh)
      b1 = ctx.p["brewer1"]

      body = call(b1, :delete, task_url(task)) |> json_response(200)
      assert body["data"] == nil
      refute Repo.get(Task, task.id)
      assert %{on_task_list: false} = step(fdh)

      call(b1, :post, "/api/production/undo/#{body["undo_token"]}") |> json_response(200)
      assert task_of(fdh).title == "FV4 · Crusher P1 · FDH"
    end
  end

  describe "who" do
    test "someone outside the Brewery is refused; an owner isn't", ctx do
      task = task_of(named(plan(ctx, "Crusher", 2), "FDH"))

      assert call(ctx.p["bartender1"], :post, task_url(task, "/complete")).status == 403

      assert call(ctx.p["owner"], :patch, task_url(task), %{notes: "From the owner"}).status ==
               200
    end

    # D50 §2.5 (was D49 decision 8, "refused with a code or without"): the
    # brewhouse device writes a linked task with a staff code, as that person.
    test "a shared tablet needs a staff code for every linked-task write", ctx do
      task = task_of(named(plan(ctx, "Crusher", 2), "FDH"))
      {_device, token} = brewhouse()

      writes = [
        {:patch, task_url(task), %{notes: "x"}},
        {:delete, task_url(task), %{}},
        {:post, task_url(task, "/move"), %{due_on: iso(10), answer: "move_all"}},
        {:post, task_url(task, "/move"), %{due_on: iso(9)}},
        {:post, task_url(task, "/complete"), %{}},
        {:post, task_url(task, "/uncomplete"), %{}}
      ]

      for {verb, url, params} <- writes do
        body = call_device(token, verb, url, params) |> json_response(422)
        assert body["error"] == "staff_code_required", "#{verb} #{url}"
      end

      # Nothing changed, and it still reads them.
      fdh = step(named(Repo.get!(RockcutApi.Brewing.Batch, task_batch(task)), "FDH"))
      assert {fdh.notes, fdh.done_on, fdh.on_task_list} == {nil, nil, true}

      board =
        call_device(token, :get, "/api/boards/brewery/tasks", %{from: iso(9), to: iso(9)})
        |> json_response(200)

      assert [%{"cards" => [%{"id" => id}]}] = board["data"]["days"]
      assert id == task.id
    end

    test "with a code: notes, move, check off, un-check and take off, as that person (D50)",
         ctx do
      # Brewed 8 days ago: FDH is yesterday.
      batch = plan(ctx, "Crusher", -8)
      fdh = named(batch, "FDH")
      task = task_of(fdh)
      {device, token} = brewhouse()
      b1 = ctx.p["brewer1"]

      body =
        call_device(token, :patch, task_url(task), %{notes: "On the floor", staff_code: "1111"})
        |> json_response(200)

      assert body["recorded_as"] == b1.name
      assert step(fdh).notes == "On the floor"

      body =
        call_device(token, :post, task_url(task, "/move"), %{
          due_on: iso(0),
          answer: "move_only",
          staff_code: "1111"
        })
        |> json_response(200)

      assert body["recorded_as"] == b1.name
      assert step(fdh).due_on == day(0)

      # Undo is the person's: the device sends their code again.
      call_device(token, :post, "/api/production/undo/#{body["undo_token"]}", %{
        staff_code: "1111"
      })
      |> json_response(200)

      assert step(fdh).due_on == day(-1)

      # Brew day first (the order rules), then FDH.
      brew = named(batch, "Brew day")

      call_device(token, :post, task_url(task_of(brew), "/complete"), %{
        done_on: iso(-8),
        batch_number: "51",
        staff_code: "1111"
      })
      |> json_response(200)

      call_device(token, :post, task_url(task, "/complete"), %{
        done_on: iso(-1),
        staff_code: "1111"
      })
      |> json_response(200)

      done = step(fdh)
      assert {done.done_by_id, done.done_on_device_id} == {b1.id, device.id}

      call_device(token, :post, task_url(task, "/uncomplete"), %{staff_code: "1111"})
      |> json_response(200)

      assert %{done_on: nil, done_by_id: nil, done_on_device_id: nil} = step(fdh)

      body =
        call_device(token, :delete, task_url(task), %{staff_code: "1111"}) |> json_response(200)

      assert body["recorded_as"] == b1.name
      assert %{on_task_list: false} = step(fdh)
      refute Repo.get(Task, task.id)
    end

    test "D4: brewer2's code checks off brew day; the batch-number prompt; the Gantt agrees",
         ctx do
      {:ok, _} = StaffCodes.set(ctx.p["brewer2"], "2222", ctx.p["breweryMgr"])
      batch = plan(ctx, "Galactic", 0)
      brew = named(batch, "Brew day")
      {device, token} = brewhouse()

      assert %{"error" => "batch_number_required"} =
               call_device(token, :post, task_url(task_of(brew), "/complete"), %{
                 staff_code: "2222"
               })
               |> json_response(422)

      assert step(brew).done_on == nil

      call_device(token, :post, task_url(task_of(brew), "/complete"), %{
        batch_number: "61",
        staff_code: "2222"
      })
      |> json_response(200)

      done = step(brew)
      assert {done.done_by_id, done.done_on_device_id} == {ctx.p["brewer2"].id, device.id}
      assert RockcutApi.ProductionFixtures.reload(batch).batch_number == "61"

      [gantt] =
        call(ctx.p["brewer1"], :get, "/api/production/schedule")
        |> json_response(200)
        |> get_in(["data", "batches"])
        |> Enum.filter(&(&1["id"] == batch.id))

      step_json = Enum.find(gantt["steps"], &(&1["id"] == brew.id))
      assert step_json["done_by"]["name"] == ctx.p["brewer2"].name
      assert step_json["done_on_device"]["name"] == "Brewhouse tablet"
    end

    test "a same-day reorder with a code is the board's, logged with the device", ctx do
      task = task_of(named(plan(ctx, "Crusher", 2), "FDH"))
      {device, token} = brewhouse()

      # Another card that day, so moving it to the bottom changes its place.
      call(ctx.p["brewer1"], :post, "/api/boards/brewery/tasks", %{
        title: "Keg wash",
        due_on: iso(9)
      })
      |> json_response(201)

      call_device(token, :post, task_url(task, "/move"), %{
        due_on: iso(9),
        staff_code: "1111"
      })
      |> json_response(200)

      event =
        Repo.one(
          from(e in RockcutApi.Tasks.Event,
            where: e.task_id == ^task.id,
            order_by: [desc: e.id],
            limit: 1
          )
        )

      assert event.device_id == device.id
      assert event.actor_id == ctx.p["brewer1"].id
    end

    # D50 gap 1 (was `staff_code_invalid`): a real person outside the Brewery.
    test "a code from outside the Brewery can't do this here; nothing changes (D3)", ctx do
      {:ok, _} = StaffCodes.set(ctx.p["bartender1"], "3333", ctx.p["owner"])
      fdh = named(plan(ctx, "Crusher", 2), "FDH")
      {_device, token} = brewhouse()

      body =
        call_device(token, :patch, task_url(task_of(fdh)), %{notes: "x", staff_code: "3333"})
        |> json_response(422)

      assert body["error"] == "staff_code_not_allowed"
      assert step(fdh).notes == nil
    end
  end

  defp brewhouse do
    device = AccountsFixtures.device_fixture(%{home: "brewery", name: "Brewhouse tablet"})
    {device, AccountsFixtures.device_token_fixture(device, "Brewhouse Tab")}
  end

  test "leaving the Brewery unassigns the open steps too, so the tasks stay unassigned", ctx do
    batch = plan(ctx, "Crusher", 2)
    fdh = named(batch, "FDH")
    b2 = ctx.p["brewer2"]
    call(ctx.p["brewer1"], :patch, task_url(task_of(fdh)), %{assignee_id: b2.id})
    assert task_of(fdh).assignee_id == b2.id

    b2_id = b2.id
    Repo.delete_all(from(m in RockcutApi.Accounts.Membership, where: m.user_id == ^b2_id))
    :ok = Tasks.unassign_if_ineligible(b2.id, ctx.p["owner"])
    RockcutApi.Production.TaskLink.sync!()

    assert step(fdh).assignee_id == nil
    assert task_of(fdh).assignee_id == nil
  end

  describe "Show planned batches (decision 9)" do
    test "in /api/me, on by default; PUT saves it per person", ctx do
      b1 = ctx.p["brewer1"]
      assert call(b1, :get, "/api/me") |> json_response(200) |> Map.get("show_planned_batches")

      assert %{"show_planned_batches" => false} =
               call(b1, :put, "/api/me/show_planned_batches", %{show_planned_batches: false})
               |> json_response(200)

      refute call(b1, :get, "/api/me") |> json_response(200) |> Map.get("show_planned_batches")

      assert call(ctx.p["brewer2"], :get, "/api/me")
             |> json_response(200)
             |> Map.get("show_planned_batches")

      assert call(b1, :put, "/api/me/show_planned_batches", %{show_planned_batches: "maybe"}).status ==
               422

      assert call(b1, :put, "/api/me/show_planned_batches", %{}).status == 422
    end
  end

  defp task_batch(%Task{production_step_id: id}), do: Repo.get!(Step, id).batch_id
end
