defmodule RockcutApiWeb.IdeaBoardSendTest do
  @moduledoc """
  D53 Part 2 stage 5: Send to task list (§4.7, S233–S236, S258, S259). The
  tasks are made through `Tasks.create/4`; every result is read back through
  the task board and Idea Board APIs. Also the dialog's defaults
  (`GET …/send_to_tasks`), "From idea" on task JSON, the card's chips and the
  notes' 2,000-character rule.
  """
  use RockcutApiWeb.ConnCase, async: false

  import Ecto.Query, only: [from: 2]
  import RockcutApi.PersonaFixtures
  import RockcutApi.IdeaBoardFixtures

  alias RockcutApi.{IdeaBoards, Repo, Tasks}
  alias RockcutApi.IdeaBoards.{Card, CardTask, Event, Send, Watchers}
  alias RockcutApi.Tasks.Task

  @bar "/api/idea_boards/bar"
  @company "/api/idea_boards/company"

  setup do
    %{p: personas(~w(owner barMgr bartender1 bartender2 brewer1 office1 noDept))}
  end

  defp req(user, verb, path, params \\ %{}) do
    conn = call(user, verb, path, params)
    body = if conn.resp_body == "", do: nil, else: Jason.decode!(conn.resp_body)
    {conn.status, body}
  end

  defp ok!(user, verb, path, params \\ %{}) do
    {status, body} = req(user, verb, path, params)
    assert status in 200..299, "#{verb} #{path}: #{status} #{inspect(body)}"
    body
  end

  defp today, do: Tasks.today()
  defp iso(date), do: Date.to_iso8601(date)

  # Every task on `dept`'s board from today to `to`, plus Future, by id.
  defp board_tasks(user, dept, to \\ nil) do
    to = to || Date.add(today(), 20)

    %{"data" => b} =
      ok!(user, :get, "/api/boards/#{dept}/tasks", %{from: iso(today()), to: iso(to)})

    (Enum.flat_map(b["days"], & &1["cards"]) ++ b["future"])
    |> Map.new(&{&1["id"], &1})
  end

  defp chips(user, card_id, base \\ @bar),
    do: ok!(user, :get, "#{base}/cards/#{card_id}")["data"]["sent_tasks"]

  defp taproom_card(p, due_on) do
    card =
      card!(starter("bar", "Ideas"), "Taproom remodel", %{
        due_on: due_on,
        description: "New bar top"
      })

    assign!(card, [p["bartender1"], p["bartender2"]])
    for {t, n} <- [{"Measure", 1}, {"Quote", 2}, {"Order", 3}], do: item!(card, t, n)
    card
  end

  describe "S233: one task, the checklist in its notes" do
    test "the task, its people and notes, From idea, and the card's chip", %{p: p} do
      due = Date.add(today(), 4)
      card = taproom_card(p, due)

      %{"data" => sent, "tasks" => [%{"id" => task_id}]} =
        ok!(p["bartender1"], :post, "#{@bar}/cards/#{card.id}/send_to_tasks")

      task = board_tasks(p["bartender2"], "bar")[task_id]
      assert task["title"] == "Taproom remodel"
      assert task["due_on"] == iso(due)
      assert Enum.map(task["assignees"], & &1["id"]) == [p["bartender1"].id, p["bartender2"].id]
      assert task["notes"] == "New bar top\n\n☐ Measure\n☐ Quote\n☐ Order"

      assert task["from_idea"] == %{
               "title" => "Taproom remodel",
               "board" => "bar",
               "card_id" => card.id,
               "link" => true
             }

      assert [chip] = sent["sent_tasks"]
      assert chip["state"] == "on_list"
      assert chip["department"] == %{"key" => "bar", "name" => "Bar"}
      assert chip["due_on"] == iso(due)
      assert chips(p["bartender2"], card.id) == sent["sent_tasks"]

      # The card stays where it was, notes stay on it only; History has it.
      assert Repo.get!(Card, card.id).list_id == starter("bar", "Ideas").id

      assert %Event{detail: %{"count" => 1, "department" => "Bar"}} =
               Repo.get_by!(Event, action: "card_sent")
    end

    test "ticked items go in as ☑", %{p: p} do
      card = card!(starter("bar", "Ideas"), "C")
      item!(card, "Done already", 1, p["bartender2"])
      item!(card, "Still to do", 2)

      %{"tasks" => [%{"id" => id}]} =
        ok!(p["bartender1"], :post, "#{@bar}/cards/#{card.id}/send_to_tasks")

      assert Repo.get!(Task, id).notes == "☑ Done already\n☐ Still to do"
    end
  end

  test "S234: one task per open item, then the card moves to Done", %{p: p} do
    card = taproom_card(p, Date.add(today(), 4))
    item!(card, "Ticked one", 4, p["bartender2"])
    done = starter("bar", "Done")

    %{"tasks" => tasks} =
      ok!(p["bartender1"], :post, "#{@bar}/cards/#{card.id}/send_to_tasks", %{
        checklist: "per_item",
        then: "move",
        then_list_id: done.id
      })

    assert Enum.map(tasks, & &1["title"]) == ~w(Measure Quote Order)
    on_board = board_tasks(p["bartender1"], "bar")

    for %{"id" => id} <- tasks do
      t = on_board[id]
      assert t["notes"] == nil
      assert t["from_idea"]["link"] == true
      assert length(t["assignees"]) == 2
    end

    assert Repo.get!(Card, card.id).list_id == done.id
    assert length(chips(p["bartender1"], card.id)) == 3
  end

  test "S235: ticking the task off turns the chip to Done", %{p: p} do
    card = taproom_card(p, today())

    %{"tasks" => [%{"id" => id}]} =
      ok!(p["bartender1"], :post, "#{@bar}/cards/#{card.id}/send_to_tasks")

    ok!(p["bartender2"], :post, "/api/boards/bar/tasks/#{id}/complete")

    assert [%{"state" => "done", "completed_on" => completed}] = chips(p["bartender1"], card.id)
    assert completed == iso(today())
  end

  describe "S236: Company cards" do
    test "the dialog offers office1's board; brewer1 is left off", %{p: p} do
      card = card!(starter("company", "Ideas"), "Holiday party")
      assign!(card, [p["office1"], p["brewer1"]])

      %{"data" => options} = ok!(p["office1"], :get, "#{@company}/cards/#{card.id}/send_to_tasks")

      assert [%{"key" => "office", "assignee_ids" => on, "left_off" => off}] =
               options["departments"]

      assert on == [p["office1"].id]
      assert off == [%{"id" => p["brewer1"].id, "name" => p["brewer1"].name}]
      assert options["already_sent"] == false

      %{"tasks" => [%{"id" => id}]} =
        ok!(p["office1"], :post, "#{@company}/cards/#{card.id}/send_to_tasks", %{
          department: "office"
        })

      assert Enum.map(board_tasks(p["office1"], "office")[id]["assignees"], & &1["id"]) == [
               p["office1"].id
             ]

      assert ok!(p["office1"], :get, "#{@company}/cards/#{card.id}/send_to_tasks")["data"][
               "already_sent"
             ]
    end

    test "another department's board is 403; none named is 422; owners get all four", %{p: p} do
      card = card!(starter("company", "Ideas"), "Holiday party")
      path = "#{@company}/cards/#{card.id}/send_to_tasks"

      assert {403, _} = req(p["office1"], :post, path, %{department: "brewery"})
      assert {422, %{"error" => "department_required"}} = req(p["office1"], :post, path)
      assert {403, _} = req(p["noDept"], :post, path, %{department: "office"})
      assert ok!(p["noDept"], :get, path)["data"]["departments"] == []
      refute Repo.exists?(CardTask)

      keys = ok!(p["owner"], :get, path)["data"]["departments"] |> Enum.map(& &1["key"])
      assert keys == ~w(brewery bar office sales)
    end
  end

  describe "S258: defaults and refusals" do
    test "a past due date defaults to Today", %{p: p} do
      card = taproom_card(p, Date.add(today(), -7))

      assert ok!(p["bartender1"], :get, "#{@bar}/cards/#{card.id}/send_to_tasks")["data"][
               "due_on"
             ] ==
               iso(today())

      %{"tasks" => [%{"id" => id}]} =
        ok!(p["bartender1"], :post, "#{@bar}/cards/#{card.id}/send_to_tasks")

      assert Repo.get!(Task, id).due_on == today()
    end

    test "no due date: Future; a day given wins, nil too", %{p: p} do
      card = card!(starter("bar", "Ideas"), "C", %{due_on: Date.add(today(), 3)})
      path = "#{@bar}/cards/#{card.id}/send_to_tasks"

      %{"tasks" => [%{"id" => a}]} = ok!(p["bartender1"], :post, path, %{due_on: nil})

      %{"tasks" => [%{"id" => b}]} =
        ok!(p["bartender1"], :post, path, %{due_on: iso(Date.add(today(), 1))})

      assert Repo.get!(Task, a).due_on == nil
      assert Repo.get!(Task, b).due_on == Date.add(today(), 1)
    end

    test "Repeat isn't offered one task per item", %{p: p} do
      card = taproom_card(p, Date.add(today(), 2))

      assert {422, %{"error" => "repeat_per_item"}} =
               req(p["bartender1"], :post, "#{@bar}/cards/#{card.id}/send_to_tasks", %{
                 checklist: "per_item",
                 repeat: "weekly",
                 repeat_weekdays: [1]
               })

      refute Repo.exists?(CardTask)
    end

    test "a locked card is a manager's to send", %{p: p} do
      card = taproom_card(p, Date.add(today(), 2))
      ok!(p["barMgr"], :post, "#{@bar}/cards/#{card.id}/lock")

      assert {423, _} = req(p["bartender1"], :post, "#{@bar}/cards/#{card.id}/send_to_tasks")
      assert {423, _} = req(p["bartender1"], :get, "#{@bar}/cards/#{card.id}/send_to_tasks")
      refute Repo.exists?(CardTask)

      ok!(p["barMgr"], :post, "#{@bar}/cards/#{card.id}/send_to_tasks")
      assert length(chips(p["barMgr"], card.id)) == 1
    end

    test "an archived card can't be sent; nor to an archived list; nothing half-done", %{p: p} do
      card = taproom_card(p, Date.add(today(), 2))
      old = list!("bar", "Old", %{archived_at: ~U[2026-11-05 12:00:00Z]})

      assert {422, %{"error" => "archived"}} =
               req(p["bartender1"], :post, "#{@bar}/cards/#{card.id}/send_to_tasks", %{
                 then: "move",
                 then_list_id: old.id
               })

      # Someone who can't take a task there: the whole send fails.
      assert {422, %{"errors" => %{"assignee_ids" => [_]}}} =
               req(p["bartender1"], :post, "#{@bar}/cards/#{card.id}/send_to_tasks", %{
                 assignee_ids: [p["brewer1"].id]
               })

      refute Repo.exists?(CardTask)
      refute Repo.exists?(from t in Task, where: t.title == "Taproom remodel")
      refute Repo.exists?(from e in Event, where: e.action == "card_sent")

      Repo.update_all(from(c in Card, where: c.id == ^card.id),
        set: [archived_at: ~U[2026-11-05 12:00:00Z]]
      )

      assert {422, %{"error" => "archived"}} =
               req(p["bartender1"], :post, "#{@bar}/cards/#{card.id}/send_to_tasks")
    end

    test "Then: archive", %{p: p} do
      card = taproom_card(p, Date.add(today(), 2))
      ok!(p["bartender1"], :post, "#{@bar}/cards/#{card.id}/send_to_tasks", %{then: "archive"})
      assert Repo.get!(Card, card.id).archived_at
    end
  end

  test "S259: deleting the task turns the chip to Removed, title kept", %{p: p} do
    card = taproom_card(p, Date.add(today(), 2))

    %{"tasks" => [%{"id" => id}]} =
      ok!(p["bartender1"], :post, "#{@bar}/cards/#{card.id}/send_to_tasks")

    assert {204, _} = req(p["bartender1"], :delete, "/api/boards/bar/tasks/#{id}")

    assert [%{"state" => "removed", "task_title" => "Taproom remodel"}] =
             chips(p["bartender1"], card.id)
  end

  test "a repeating send: the series' chip, From idea on every occurrence", %{p: p} do
    due = Date.add(today(), 1)
    card = taproom_card(p, due)

    %{"tasks" => [%{"id" => first, "series_id" => series_id}]} =
      ok!(p["bartender1"], :post, "#{@bar}/cards/#{card.id}/send_to_tasks", %{
        repeat: "weekly",
        repeat_weekdays: [Date.day_of_week(due)]
      })

    assert series_id

    assert [%{"state" => "repeating", "series" => %{"frequency" => "weekly"}}] =
             chips(p["bartender1"], card.id)

    occurrences =
      board_tasks(p["bartender1"], "bar", Date.add(due, 14))
      |> Map.values()
      |> Enum.filter(&(&1["series_id"] == series_id))

    assert length(occurrences) >= 2
    assert Enum.all?(occurrences, &(&1["from_idea"]["card_id"] == card.id))
    assert Enum.any?(occurrences, &(&1["id"] == first))
  end

  test "watchers hear about a send", %{p: p} do
    card = taproom_card(p, Date.add(today(), 2))
    watch!(card, p["bartender2"])
    ok!(p["bartender1"], :post, "#{@bar}/cards/#{card.id}/send_to_tasks")

    Watchers.flush(DateTime.add(DateTime.utc_now(), 600, :second))

    assert [n] =
             Repo.all(
               from n in RockcutApi.Notifications.Notification,
                 where: n.user_id == ^p["bartender2"].id
             )

    assert n.body == "sent to the Bar task list"
  end

  describe "From idea" do
    test "after the card is deleted for good: the title, no link (lead decision 4)", %{p: p} do
      card = taproom_card(p, Date.add(today(), 2))

      %{"tasks" => [%{"id" => id}]} =
        ok!(p["bartender1"], :post, "#{@bar}/cards/#{card.id}/send_to_tasks")

      ok!(p["bartender1"], :post, "#{@bar}/cards/#{card.id}/archive")
      ok!(p["barMgr"], :delete, "#{@bar}/cards/#{card.id}")

      assert board_tasks(p["bartender1"], "bar")[id]["from_idea"] == %{
               "title" => "Taproom remodel",
               "board" => nil,
               "card_id" => nil,
               "link" => false
             }
    end

    test "someone who can't open the card's board sees the title without a link", %{p: p} do
      card = taproom_card(p, Date.add(today(), 2))
      {:ok, [task]} = send_as(p["bartender1"], card)

      assert %{task.id => %{link: false, title: "Taproom remodel", card_id: nil, board: nil}} ==
               IdeaBoards.from_idea([task], p["brewer1"])

      assert %{link: true} = IdeaBoards.from_idea([task], p["bartender2"])[task.id]
    end

    test "a task that didn't come from a card has none; the task's own write responses carry it",
         %{p: p} do
      %{"data" => plain} =
        ok!(p["bartender1"], :post, "/api/boards/bar/tasks", %{
          title: "Plain",
          due_on: iso(today())
        })

      assert plain["from_idea"] == nil

      card = taproom_card(p, today())

      %{"tasks" => [%{"id" => id}]} =
        ok!(p["bartender1"], :post, "#{@bar}/cards/#{card.id}/send_to_tasks")

      %{"data" => edited} =
        ok!(p["bartender1"], :patch, "/api/boards/bar/tasks/#{id}", %{title: "Renamed task"})

      assert edited["from_idea"]["title"] == "Taproom remodel"
    end
  end

  defp send_as(user, card) do
    board = IdeaBoards.board_for_key("bar")
    {:ok, card} = IdeaBoards.fetch_card(board, card.id)
    Send.send(board, card, RockcutApi.TaskFixtures.task_board("bar"), %{}, nil, user)
  end

  describe "notes: the 2,000-character rule" do
    defp items(texts, done \\ []),
      do: Enum.map(texts, &%{text: &1, done_at: if(&1 in done, do: ~U[2026-11-06 12:00:00Z])})

    test "short: description, blank line, the checklist" do
      assert Send.notes("Desc", items(["A", "B"], ["B"])) == "Desc\n\n☐ A\n☑ B"
      assert Send.notes(nil, items(["A"])) == "☐ A"
      assert Send.notes("Only desc", []) == "Only desc"
      assert Send.notes(nil, []) == nil
    end

    test "too long: the description is cut so the checklist survives" do
      lines = for n <- 1..20, do: "Item #{n}"
      notes = Send.notes(String.duplicate("word ", 1_000), items(lines))

      assert String.length(notes) <= 2_000
      assert notes =~ "… see the Idea Board card\n\n☐ Item 1\n"
      assert String.ends_with?(notes, "☐ Item 20")
    end

    test "a checklist too long on its own is cut at a line, with the same pointer" do
      lines = for n <- 1..20, do: String.duplicate("x", 150) <> " #{n}"
      notes = Send.notes("Desc", items(lines))

      assert String.length(notes) <= 2_000
      assert String.ends_with?(notes, "\n… see the Idea Board card")
      refute notes =~ "Desc"

      assert notes
             |> String.split("\n")
             |> Enum.drop(-1)
             |> Enum.all?(&String.starts_with?(&1, "☐ "))
    end

    test "a long description alone is cut with the pointer" do
      notes = Send.notes(String.duplicate("y", 5_000), [])
      assert String.length(notes) == 2_000
      assert String.ends_with?(notes, "… see the Idea Board card")
    end
  end
end
