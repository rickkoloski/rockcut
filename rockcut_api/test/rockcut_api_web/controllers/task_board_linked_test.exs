defmodule RockcutApiWeb.TaskBoardLinkedTest do
  @moduledoc """
  D49 task 3 (§3.12, plan decisions 7–9): linked tasks on the Brewery board.
  Their writes go to Production with the schedule's prompts and an undo
  token; a shared tablet is refused every one until D50 (with or without a
  staff code), and "Sign in as me" is a person. `linked=true` and "Show
  planned batches" (`/api/me`).
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.ProductionFixtures
  import Phoenix.ConnTest
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{AccountsFixtures, Devices, Repo, Sessions, StaffCodes, Tasks}
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
               "batch_label" => "Galactic P1"
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

    test "decision 8: a shared tablet can't write a linked task, with a code or without", ctx do
      task = task_of(named(plan(ctx, "Crusher", 2), "FDH"))
      device = AccountsFixtures.device_fixture(%{home: "brewery", name: "Brewhouse tablet"})
      token = AccountsFixtures.device_token_fixture(device, "Brewhouse Tab")

      writes = [
        {:patch, task_url(task), %{notes: "x"}},
        {:delete, task_url(task), %{}},
        {:post, task_url(task, "/move"), %{due_on: iso(10), answer: "move_all"}},
        {:post, task_url(task, "/move"), %{due_on: iso(9)}},
        {:post, task_url(task, "/complete"), %{}},
        {:post, task_url(task, "/uncomplete"), %{}},
        {:post, task_url(task, "/stop_repeating"), %{}}
      ]

      for {verb, url, params} <- writes, code <- [nil, "1111"] do
        params = if code, do: Map.put(params, :staff_code, code), else: params
        body = call_device(token, verb, url, params) |> json_response(403)

        assert body == %{
                 "error" => "linked_task_device",
                 "message" => "Do this on the production schedule."
               },
               "#{verb} #{url} #{inspect(code)}"
      end

      # It still reads them.
      board =
        call_device(token, :get, "/api/boards/brewery/tasks", %{from: iso(9), to: iso(9)})
        |> json_response(200)

      assert [%{"cards" => [%{"id" => id}]}] = board["data"]["days"]
      assert id == task.id

      assert step(named(Repo.get!(RockcutApi.Brewing.Batch, task_batch(task)), "FDH")).notes ==
               nil

      # "Sign in as me" there is a person (D34).
      {ses, _} = Sessions.create(ctx.p["brewer1"], device_token: Devices.live_token(token))

      assert call_device(ses, :patch, task_url(task), %{notes: "From the tablet"})
             |> json_response(200)

      assert Repo.get!(Task, task.id).notes == "From the tablet"
    end
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
