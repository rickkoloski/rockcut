defmodule RockcutApiWeb.IdeaBoardFixCycle1Test do
  @moduledoc """
  D53 Part 2 fix cycle 1 (lead decisions 7), from the DEV QA report: each
  test is the report's repro. Gap 6: a blank title or name is 422, not 500.
  Gap 7: an id out of range is 404 in the URL and 422 (or 404) in the body,
  not 500, on the Boards and the task boards. Gaps 4 and 8: archived lists.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IdeaBoardFixtures

  alias RockcutApi.Repo
  alias RockcutApi.IdeaBoards.{Card, IdeaList, Label}

  @bar "/api/idea_boards/bar"
  @huge 99_999_999_999_999_999_999
  @float 1.0e20

  setup do
    p = personas(~w(owner barMgr bartender1 bartender2))
    list = list!("bar", "Fix cycle")
    card = card!(list, "A card")
    %{p: p, d: departments(), list: list, card: card}
  end

  defp req(user, verb, path, params \\ %{}) do
    conn = call(user, verb, path, params)
    body = if conn.resp_body == "", do: nil, else: Jason.decode!(conn.resp_body)
    {conn.status, body}
  end

  describe "gap 6: a blank title or name is 422 and changes nothing" do
    test "card title, on create and update", %{p: p, list: list, card: card} do
      b1 = p["bartender1"]

      for blank <- ["", "   ", nil] do
        assert {422, %{"errors" => %{"title" => _}}} =
                 req(b1, :patch, "#{@bar}/cards/#{card.id}", %{title: blank})

        assert {422, %{"errors" => %{"title" => _}}} =
                 req(b1, :post, "#{@bar}/cards", %{list_id: list.id, title: blank})
      end

      assert Repo.get!(Card, card.id).title == "A card"
    end

    test "list name, on create and update", %{p: p, list: list} do
      b1 = p["bartender1"]

      for blank <- ["", "   ", nil] do
        assert {422, %{"errors" => %{"name" => _}}} =
                 req(b1, :patch, "#{@bar}/lists/#{list.id}", %{name: blank})

        assert {422, %{"errors" => %{"name" => _}}} =
                 req(b1, :post, "#{@bar}/lists", %{name: blank})
      end

      assert Repo.get!(IdeaList, list.id).name == "Fix cycle"
    end

    test "label name, on create and update", %{p: p} do
      label = label!("bar", "Big job")

      for blank <- ["", "   ", nil] do
        assert {422, %{"errors" => %{"name" => _}}} =
                 req(p["barMgr"], :patch, "#{@bar}/labels/#{label.id}", %{name: blank})

        assert {422, %{"errors" => %{"name" => _}}} =
                 req(p["bartender1"], :post, "#{@bar}/labels", %{name: blank, color: "red"})
      end

      assert Repo.get!(Label, label.id).name == "Big job"
    end
  end

  describe "gap 7: an id out of range" do
    test "in the URL is 404", %{p: p, card: card} do
      b1 = p["bartender1"]
      c = "#{@bar}/cards/#{card.id}"

      for {verb, path, params} <- [
            {:get, "#{@bar}/cards/#{@huge}", %{}},
            {:patch, "#{@bar}/cards/#{@huge}", %{title: "x"}},
            {:put, "#{@bar}/cards/#{@huge}/watch", %{}},
            {:delete, "#{@bar}/cards/#{@huge}/watch", %{}},
            {:patch, "#{c}/checklist/#{@huge}", %{done: true}},
            {:delete, "#{c}/checklist/#{@huge}", %{}},
            {:patch, "#{c}/notes/#{@huge}", %{body: "x"}},
            {:delete, "#{c}/notes/#{@huge}", %{}},
            {:patch, "#{@bar}/lists/#{@huge}", %{name: "x"}},
            {:post, "#{@bar}/lists/#{@huge}/move", %{}},
            {:patch, "#{@bar}/labels/#{@huge}", %{name: "x"}}
          ] do
        user = if verb == :patch and path =~ "labels", do: p["barMgr"], else: b1
        assert {404, _} = req(user, verb, path, params), "#{verb} #{path}"
      end

      # A History filter that can't be a card is ignored, as junk is.
      assert {200, _} = req(p["barMgr"], :get, "#{@bar}/history?card_id=#{@huge}")
    end

    test "in the body is 422 or 404, and nothing changes", %{p: p, list: list, card: card} do
      b1 = p["bartender1"]
      c = "#{@bar}/cards/#{card.id}"
      other = card!(list, "Other")

      for {verb, path, params} <- [
            {:post, "#{@bar}/lists/#{list.id}/move", %{before_id: @float}},
            {:post, "#{@bar}/lists/#{list.id}/move", %{before_id: @huge}},
            {:post, "#{c}/move", %{list_id: @huge}},
            {:post, "#{c}/move", %{before_id: @float}},
            {:post, "#{c}/move", %{before_id: @huge}},
            {:post, "#{@bar}/cards", %{list_id: @float, title: "x"}},
            {:post, "#{@bar}/cards", %{list_id: @huge, title: "x"}},
            {:patch, c, %{assignee_ids: [@huge]}},
            {:patch, c, %{assignee_ids: [@float]}},
            {:patch, c, %{label_ids: [@float]}},
            {:patch, c, %{label_ids: [@huge]}},
            {:put, "#{c}/checklist/order", %{ids: [@huge]}},
            {:post, "#{c}/send_to_tasks", %{assignee_ids: [@float]}},
            {:post, "#{c}/send_to_tasks", %{assignee_ids: [@huge]}},
            {:post, "#{c}/send_to_tasks", %{then: "move", then_list_id: @float}},
            {:post, "#{c}/send_to_tasks", %{then: "move", then_list_id: @huge}}
          ] do
        {status, _} = req(b1, verb, path, params)
        assert status in [404, 422], "#{verb} #{path} #{inspect(params)}: #{status}"
      end

      assert Repo.aggregate(RockcutApi.Tasks.Task, :count) == 0
      assert Repo.get!(Card, card.id).position == card.position
      assert Repo.get!(Card, other.id).list_id == list.id
    end
  end

  describe "gap 7 on the task boards (Part 1 and D38, the same helper)" do
    test "an id out of range in the URL is 404; in the body 422; a page is capped", %{p: p} do
      mgr = p["barMgr"]
      t = "/api/boards/bar"

      %{"data" => task} =
        Jason.decode!(
          call(mgr, :post, "#{t}/tasks", %{title: "x", due_on: "2026-11-10"}).resp_body
        )

      for {verb, path, params} <- [
            {:patch, "#{t}/tasks/#{@huge}", %{title: "y"}},
            {:delete, "#{t}/tasks/#{@huge}", %{}},
            {:post, "#{t}/tasks/#{@huge}/move", %{due_on: nil}},
            {:post, "#{t}/tasks/#{@huge}/complete", %{}},
            {:get, "#{t}/tasks/#{@huge}/series", %{}},
            {:patch, "#{t}/daily_items/#{@huge}", %{text: "q"}},
            {:put, "#{t}/daily_checks/2026-11-10/#{@huge}", %{}}
          ] do
        assert {404, _} = req(mgr, verb, path, params), "#{verb} #{path}"
      end

      for {verb, path, params} <- [
            {:patch, "#{t}/tasks/#{task["id"]}", %{assignee_ids: [@huge]}},
            {:patch, "#{t}/tasks/#{task["id"]}", %{assignee_id: @huge}},
            {:post, "#{t}/tasks", %{title: "z", assignee_ids: [@huge]}}
          ] do
        assert {422, _} = req(mgr, verb, path, params), "#{verb} #{path}"
      end

      # A before_id that names no task puts it last (D38), as before.
      assert {200, _} =
               req(mgr, :post, "#{t}/tasks/#{task["id"]}/move", %{
                 due_on: "2026-11-10",
                 before_id: @huge
               })

      for path <- [
            "#{t}/tasks/history?task_id=#{@huge}",
            "#{t}/tasks/history?page=#{@huge}",
            "#{@bar}/history?page=#{@huge}"
          ],
          do: assert({200, _} = req(mgr, :get, path), path)

      assert Repo.aggregate(RockcutApi.Tasks.Task, :count) == 1
    end
  end

  describe "archived lists" do
    test "gap 4: restoring a list holding a locked card is a manager's (423); a manager can",
         %{p: p, list: list, card: card} do
      b1 = p["bartender1"]
      assert {200, _} = req(p["barMgr"], :post, "#{@bar}/cards/#{card.id}/lock")
      assert {200, _} = req(p["barMgr"], :post, "#{@bar}/lists/#{list.id}/archive")

      assert {423, %{"error" => "holds_locked_card", "message" => msg}} =
               req(b1, :post, "#{@bar}/lists/#{list.id}/restore")

      assert msg =~ "only a manager can restore it"
      assert Repo.get!(IdeaList, list.id).archived_at

      assert {200, _} = req(p["barMgr"], :post, "#{@bar}/lists/#{list.id}/restore")
      refute Repo.get!(IdeaList, list.id).archived_at
    end

    test "gap 4: without a locked card, anyone on the board restores it", %{p: p, list: list} do
      assert {200, _} = req(p["bartender1"], :post, "#{@bar}/lists/#{list.id}/archive")
      assert {200, _} = req(p["bartender1"], :post, "#{@bar}/lists/#{list.id}/restore")
      refute Repo.get!(IdeaList, list.id).archived_at
    end

    test "gap 8: renaming an archived list is 422 archived; restored, it renames", %{
      p: p,
      list: list
    } do
      b1 = p["bartender1"]
      assert {200, _} = req(b1, :post, "#{@bar}/lists/#{list.id}/archive")

      assert {422, %{"error" => "archived", "message" => "That's archived. Restore it first"}} =
               req(b1, :patch, "#{@bar}/lists/#{list.id}", %{name: "New name"})

      assert Repo.get!(IdeaList, list.id).name == "Fix cycle"
      assert {200, _} = req(b1, :post, "#{@bar}/lists/#{list.id}/restore")

      assert {200, %{"data" => %{"name" => "New name"}}} =
               req(b1, :patch, "#{@bar}/lists/#{list.id}", %{name: "New name"})
    end
  end
end
