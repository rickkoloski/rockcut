defmodule RockcutApiWeb.IdeaBoardWriteTest do
  @moduledoc """
  D53 Part 2 stage 3: the Idea Board write API (§4.1–§4.5, decisions 13, 14
  and 16): lists, cards, labels, checklist, notes, locks, Watch, people
  leaving, History. Every write is persist-verified: act, read it back
  through the API (or the database for what the API doesn't show), check.
  Who may call each route at all is the route matrix's; the lock matrix is
  here.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IdeaBoardFixtures
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.Repo
  alias RockcutApi.IdeaBoards.{Card, CardTask, Event, IdeaList, Note, Watch}
  alias RockcutApi.Tasks.Task

  @bar "/api/idea_boards/bar"
  @company "/api/idea_boards/company"

  setup do
    p =
      personas(~w(owner barMgr bartender1 bartender2 brewer1 brewer2 breweryMgr floater
                  splitRole office1 noDept))

    %{p: p, d: departments()}
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

  defp board(user, base \\ @bar), do: ok!(user, :get, base <> "/lists")["data"]
  defp card(user, id, base \\ @bar), do: ok!(user, :get, "#{base}/cards/#{id}")["data"]

  defp list_named(user, name, base \\ @bar),
    do: Enum.find(board(user, base)["lists"], &(&1["name"] == name))

  defp card_titles(user, name, base \\ @bar),
    do: Enum.map(list_named(user, name, base)["cards"], & &1["title"])

  defp actions(board_key),
    do: Repo.all(from e in Event, where: e.board == ^board_key, order_by: e.id, select: e.action)

  describe "S224: a list and a card with everything on it" do
    test "all of it persists, and History has it", %{p: p} do
      b1 = p["bartender1"]

      %{"data" => list} = ok!(b1, :post, @bar <> "/lists", %{name: " Taproom remodel "})
      assert list["name"] == "Taproom remodel"

      assert Enum.map(board(b1)["lists"], & &1["name"]) ==
               ~w(Ideas Planned Doing Done) ++ ["Taproom remodel"]

      %{"data" => label} = ok!(b1, :post, @bar <> "/labels", %{name: "Big job", color: "red"})

      %{"data" => c} =
        ok!(b1, :post, @bar <> "/cards", %{
          list_id: list["id"],
          title: "New bar top",
          description: "Walnut",
          due_on: "2026-11-12",
          assignee_ids: [p["bartender2"].id],
          label_ids: [label["id"]]
        })

      for text <- ["Measure", "Quote", "Order"],
          do: ok!(b1, :post, "#{@bar}/cards/#{c["id"]}/checklist", %{text: text})

      saved = card(b1, c["id"])
      assert saved["title"] == "New bar top"
      assert saved["description"] == "Walnut"
      assert saved["due_on"] == "2026-11-12"
      assert saved["list"]["name"] == "Taproom remodel"
      assert saved["assignee_ids"] == [p["bartender2"].id]
      assert Enum.map(saved["labels"], & &1["name"]) == ["Big job"]
      assert Enum.map(saved["checklist_items"], & &1["text"]) == ~w(Measure Quote Order)
      assert saved["created_by"]["name"] == "Sam Pour"
      assert saved["watching"] == false

      assert actions("bar") ==
               ~w(list_created label_created card_created checklist_added checklist_added checklist_added)

      # Nobody watches it: being assigned doesn't turn Watch on (§4.6).
      refute Repo.exists?(from w in Watch, where: w.card_id == ^c["id"])
    end

    test "edits: one card_edited event naming every field that changed", %{p: p} do
      b1 = p["bartender1"]
      c = card!(starter("bar", "Ideas"), "Old title")
      l1 = label!("bar", "One")

      ok!(b1, :patch, "#{@bar}/cards/#{c.id}", %{
        title: "New title",
        description: "Now with words",
        due_on: "2026-11-20",
        assignee_ids: [p["bartender1"].id, p["bartender2"].id],
        label_ids: [l1.id]
      })

      saved = card(b1, c.id)
      assert saved["title"] == "New title"
      assert saved["due_on"] == "2026-11-20"
      assert saved["assignee_ids"] == [p["bartender1"].id, p["bartender2"].id]
      assert saved["label_ids"] == [l1.id]

      [event] = Repo.all(from e in Event, where: e.card_id == ^c.id)
      assert event.action == "card_edited"
      fields = event.detail["fields"]
      assert fields["title"] == %{"from" => "Old title", "to" => "New title"}
      assert fields["description"] == true
      assert fields["due_on"] == %{"from" => nil, "to" => "2026-11-20"}
      assert fields["assignee_ids"]["to"] == [p["bartender1"].id, p["bartender2"].id]
      assert fields["label_ids"] == %{"from" => [], "to" => [l1.id]}

      history = ok!(p["barMgr"], :get, @bar <> "/history")
      assert history["names"]["users"][to_string(p["bartender2"].id)] == "Alex Draft"

      # The same people in another order, or nothing new: no event.
      ok!(b1, :patch, "#{@bar}/cards/#{c.id}", %{
        assignee_ids: [p["bartender2"].id, p["bartender1"].id],
        title: "New title"
      })

      assert Repo.aggregate(from(e in Event, where: e.card_id == ^c.id), :count) == 1
    end

    test "limits: blank title, long title and description, long list name", %{p: p} do
      b1 = p["bartender1"]
      ideas = starter("bar", "Ideas")

      for params <- [
            %{title: " "},
            %{title: String.duplicate("x", 201)},
            %{title: "ok", description: String.duplicate("x", 10_001)}
          ] do
        assert {422, _} = req(b1, :post, @bar <> "/cards", Map.put(params, :list_id, ideas.id))
      end

      assert {422, _} = req(b1, :post, @bar <> "/lists", %{name: String.duplicate("x", 81)})
      assert {422, _} = req(b1, :post, @bar <> "/labels", %{name: "x", color: "chartreuse"})
      assert card_titles(b1, "Ideas") == []
    end
  end

  describe "assignees (§4.1, S232)" do
    test "Company: anyone active can be on a card (office1 assigns bartender1)", %{p: p} do
      %{"data" => c} =
        ok!(p["office1"], :post, @company <> "/cards", %{
          list_id: starter("company", "Ideas").id,
          title: "Holiday party",
          assignee_ids: [p["bartender1"].id]
        })

      assert card(p["noDept"], c["id"], @company)["assignee_ids"] == [p["bartender1"].id]
    end

    test "a department board: members and owners; others named in a 422", %{p: p} do
      c = card!(starter("bar", "Ideas"), "Card")
      path = "#{@bar}/cards/#{c.id}"

      assert {422, %{"errors" => %{"assignee_ids" => [msg]}}} =
               req(p["bartender1"], :patch, path, %{assignee_ids: [p["brewer1"].id]})

      assert msg == "Jake Brewer must be a Bar member"
      assert card(p["bartender1"], c.id)["assignee_ids"] == []

      # The API accepts an owner, as the task boards do (D41 S105).
      ok!(p["bartender1"], :patch, path, %{assignee_ids: [p["owner"].id, p["floater"].id]})
      assert card(p["bartender1"], c.id)["assignee_ids"] == [p["owner"].id, p["floater"].id]
    end

    test "a device, a junk id, or more than 100 people is refused", %{p: p} do
      {device, _} = taproom_device()
      c = card!(starter("company", "Ideas"), "Card")
      path = "#{@company}/cards/#{c.id}"

      assert {422, _} = req(p["noDept"], :patch, path, %{assignee_ids: [device.id]})
      assert {422, _} = req(p["noDept"], :patch, path, %{assignee_ids: ["x"]})

      assert {422, %{"errors" => %{"assignee_ids" => ["A card can have at most 100 people"]}}} =
               req(p["noDept"], :patch, path, %{assignee_ids: Enum.to_list(1..101)})

      assert card(p["noDept"], c.id, @company)["assignee_ids"] == []
    end

    test "the picker: department members (no owners), or every active person on Company", %{
      p: p
    } do
      bar = ok!(p["bartender1"], :get, @bar <> "/people")["data"] |> Enum.map(& &1["name"])
      assert "Sam Pour" in bar and "Casey Tap" in bar and "Jordan Float" in bar
      refute p["brewer1"].name in bar
      refute Enum.any?(bar, &(&1 == p["owner"].name))

      company = ok!(p["noDept"], :get, @company <> "/people")["data"] |> Enum.map(& &1["id"])
      assert p["owner"].id in company and p["brewer1"].id in company and p["noDept"].id in company
    end
  end

  describe "moves" do
    test "cards within and between lists; positions stay dense", %{p: p} do
      b1 = p["bartender1"]
      ideas = starter("bar", "Ideas")
      doing = starter("bar", "Doing")
      [a, b, c] = for t <- ~w(A B C), do: card!(ideas, t)

      ok!(b1, :post, "#{@bar}/cards/#{c.id}/move", %{before_id: a.id})
      assert card_titles(b1, "Ideas") == ~w(C A B)

      ok!(b1, :post, "#{@bar}/cards/#{a.id}/move", %{list_id: doing.id})
      assert card_titles(b1, "Ideas") == ~w(C B)
      assert card_titles(b1, "Doing") == ~w(A)

      ok!(b1, :post, "#{@bar}/cards/#{b.id}/move", %{list_id: doing.id, before_id: a.id})
      assert card_titles(b1, "Doing") == ~w(B A)

      positions =
        Repo.all(
          from c in Card,
            where: c.list_id in [^ideas.id, ^doing.id],
            order_by: [c.list_id, c.position],
            select: {c.list_id, c.position}
        )

      assert positions == [{ideas.id, 1}, {doing.id, 1}, {doing.id, 2}]

      # Only the moves between lists are History.
      assert actions("bar") == ~w(card_moved card_moved)

      [moved | _] = Repo.all(from e in Event, where: e.action == "card_moved", order_by: e.id)
      assert moved.detail["from_list"]["name"] == "Ideas"
      assert moved.detail["to_list"]["name"] == "Doing"
    end

    test "lists move left and right", %{p: p} do
      done = starter("bar", "Done")

      ok!(p["bartender1"], :post, "#{@bar}/lists/#{done.id}/move", %{
        before_id: starter("bar", "Ideas").id
      })

      assert Enum.map(board(p["bartender1"])["lists"], & &1["name"]) ==
               ~w(Done Ideas Planned Doing)

      ok!(p["bartender1"], :post, "#{@bar}/lists/#{done.id}/move", %{})

      assert Enum.map(board(p["bartender1"])["lists"], & &1["name"]) ==
               ~w(Ideas Planned Doing Done)
    end
  end

  describe "locks (§4.5, the lock matrix)" do
    setup %{p: p} do
      ideas = starter("bar", "Ideas")
      planned = starter("bar", "Planned")
      in_locked = card!(ideas, "In a locked list")
      outside = card!(planned, "Outside")
      item = item!(in_locked, "Tick me", 1)
      ok!(p["barMgr"], :post, "#{@bar}/lists/#{ideas.id}/lock")
      %{ideas: ideas, planned: planned, in_locked: in_locked, outside: outside, item: item}
    end

    test "S228: a locked list shows who locked it", %{p: p} do
      list = list_named(p["bartender1"], "Ideas")
      assert list["locked"] == true
      assert list["locked_by"]["name"] == "Casey Tap"
      assert list["locked_at"]
    end

    test "S228: a non-manager is refused 423 on everything in a locked list", ctx do
      b1 = ctx.p["bartender1"]
      %{ideas: ideas, planned: planned, in_locked: c, outside: outside, item: item} = ctx

      refused = [
        {:patch, "#{@bar}/lists/#{ideas.id}", %{name: "Renamed"}},
        {:post, "#{@bar}/lists/#{ideas.id}/move", %{}},
        {:post, "#{@bar}/lists/#{ideas.id}/archive", %{}},
        {:post, "#{@bar}/cards", %{list_id: ideas.id, title: "New"}},
        {:patch, "#{@bar}/cards/#{c.id}", %{title: "Edited"}},
        {:post, "#{@bar}/cards/#{c.id}/move", %{list_id: planned.id}},
        {:post, "#{@bar}/cards/#{outside.id}/move", %{list_id: ideas.id}},
        {:post, "#{@bar}/cards/#{c.id}/archive", %{}},
        {:post, "#{@bar}/cards/#{c.id}/checklist", %{text: "More"}},
        {:patch, "#{@bar}/cards/#{c.id}/checklist/#{item.id}", %{done: true}},
        {:delete, "#{@bar}/cards/#{c.id}/checklist/#{item.id}", %{}},
        {:put, "#{@bar}/cards/#{c.id}/checklist/order", %{ids: [item.id]}}
      ]

      for {verb, path, params} <- refused do
        assert {423, %{"error" => "locked", "message" => "Locked by a manager"}} =
                 req(b1, verb, path, params),
               "#{verb} #{path}"
      end

      # Nothing changed.
      assert list_named(b1, "Ideas")["name"] == "Ideas"
      assert card_titles(b1, "Ideas") == ["In a locked list"]
      assert card_titles(b1, "Planned") == ["Outside"]
      assert hd(card(b1, c.id)["checklist_items"])["done"] == false

      # Locking and unlocking aren't theirs at all.
      assert {403, _} = req(b1, :post, "#{@bar}/lists/#{ideas.id}/unlock")
      assert list_named(b1, "Ideas")["locked"] == true
    end

    test "S228: barMgr keeps editing a locked list without unlocking it", ctx do
      mgr = ctx.p["barMgr"]
      ok!(mgr, :patch, "#{@bar}/lists/#{ctx.ideas.id}", %{name: "Ideas (locked)"})
      ok!(mgr, :patch, "#{@bar}/cards/#{ctx.in_locked.id}", %{title: "Manager edit"})

      ok!(mgr, :patch, "#{@bar}/cards/#{ctx.in_locked.id}/checklist/#{ctx.item.id}", %{done: true})

      saved = card(mgr, ctx.in_locked.id)
      assert saved["title"] == "Manager edit"
      assert saved["list"]["name"] == "Ideas (locked)"
      assert saved["list"]["locked"] == true
      assert hd(saved["checklist_items"])["done_by"]["name"] == "Casey Tap"
    end

    test "other lists still reorder around a locked one", %{p: p, planned: planned, ideas: ideas} do
      ok!(p["bartender1"], :post, "#{@bar}/lists/#{planned.id}/move", %{before_id: ideas.id})

      assert Enum.map(board(p["bartender1"])["lists"], & &1["name"]) ==
               ~w(Planned Ideas Doing Done)
    end

    test "S229: a locked card in an unlocked list; its neighbours still work", %{
      p: p,
      planned: planned,
      outside: outside
    } do
      b1 = p["bartender1"]
      other = card!(planned, "Neighbour")
      ok!(p["barMgr"], :post, "#{@bar}/cards/#{outside.id}/lock")

      assert card(b1, outside.id)["locked_by"]["name"] == "Casey Tap"
      assert {423, _} = req(b1, :patch, "#{@bar}/cards/#{outside.id}", %{title: "X"})

      assert {423, _} =
               req(b1, :post, "#{@bar}/cards/#{outside.id}/move", %{
                 list_id: starter("bar", "Doing").id
               })

      ok!(b1, :patch, "#{@bar}/cards/#{other.id}", %{title: "Neighbour edited"})
      ok!(b1, :post, "#{@bar}/cards/#{other.id}/move", %{before_id: outside.id})
      assert card_titles(b1, "Planned") == ["Neighbour edited", "Outside"]
    end

    test "S255: notes stay open on locked things; Watch too", %{p: p, in_locked: c} do
      b1 = p["bartender1"]
      ok!(p["barMgr"], :post, "#{@bar}/cards/#{c.id}/lock")

      ok!(b1, :post, "#{@bar}/cards/#{c.id}/notes", %{body: "Still talking"})
      ok!(b1, :put, "#{@bar}/cards/#{c.id}/watch")

      saved = card(b1, c.id)
      assert [%{"body" => "Still talking"}] = saved["notes"]
      assert saved["watching"] == true
      assert {423, _} = req(b1, :patch, "#{@bar}/cards/#{c.id}", %{description: "X"})
    end

    test "S257: a non-manager can't archive an unlocked list holding a locked card", %{
      p: p,
      planned: planned,
      outside: outside
    } do
      ok!(p["barMgr"], :post, "#{@bar}/cards/#{outside.id}/lock")

      assert {423, %{"error" => "holds_locked_card", "message" => msg}} =
               req(p["bartender1"], :post, "#{@bar}/lists/#{planned.id}/archive")

      assert msg =~ "locked card"
      assert list_named(p["bartender1"], "Planned")

      # An archived locked card doesn't count; a manager can anyway.
      ok!(p["barMgr"], :post, "#{@bar}/lists/#{planned.id}/archive")
      refute list_named(p["bartender1"], "Planned")
    end

    test "unlock brings the controls back", %{p: p, ideas: ideas, in_locked: c} do
      ok!(p["barMgr"], :post, "#{@bar}/lists/#{ideas.id}/unlock")
      ok!(p["bartender1"], :patch, "#{@bar}/cards/#{c.id}", %{title: "Free again"})
      assert card(p["bartender1"], c.id)["title"] == "Free again"
      assert list_named(p["bartender1"], "Ideas")["locked_by"] == nil
      assert actions("bar") -- ["card_edited"] == ~w(list_locked list_unlocked)
    end
  end

  describe "who locks (decision 6, S230, S231)" do
    test "S230 splitRole: no Lock on the Brewery board, Lock on the Taproom board", %{p: p} do
      brewery = starter("brewery", "Ideas")
      bar = starter("bar", "Ideas")

      assert {403, _} =
               req(p["splitRole"], :post, "/api/idea_boards/brewery/lists/#{brewery.id}/lock")

      refute Repo.get!(IdeaList, brewery.id).locked_at

      ok!(p["splitRole"], :post, "#{@bar}/lists/#{bar.id}/lock")
      assert Repo.get!(IdeaList, bar.id).locked_at
    end

    test "S231 Company: only owners lock; then nobody else changes it", %{p: p} do
      list = starter("company", "Ideas")
      card = card!(list, "Company card")

      assert {403, _} = req(p["breweryMgr"], :post, "#{@company}/lists/#{list.id}/lock")
      refute list_named(p["breweryMgr"], "Ideas", @company)["locked"]

      ok!(p["owner"], :post, "#{@company}/lists/#{list.id}/lock")
      assert list_named(p["brewer1"], "Ideas", @company)["locked"]

      for who <- ~w(breweryMgr brewer1) do
        assert {423, _} = req(p[who], :patch, "#{@company}/lists/#{list.id}", %{name: "X"})
        assert {423, _} = req(p[who], :patch, "#{@company}/cards/#{card.id}", %{title: "X"})
      end

      ok!(p["owner"], :patch, "#{@company}/cards/#{card.id}", %{title: "Owner edit"})
      assert card(p["brewer1"], card.id, @company)["title"] == "Owner edit"
    end
  end

  describe "archive, restore, delete for good (S237)" do
    test "a list goes and comes back with its cards; only a manager deletes it", %{p: p, d: d} do
      b1 = p["bartender1"]
      list = list!("bar", "Fall releases")
      c = card!(list, "Pumpkin ale")
      note!(c, b1, "Yum")
      watch!(c, b1)

      task =
        Repo.insert!(%Task{department_id: d["bar"].id, title: "Pumpkin ale", position: 1})

      sent!(c, %{
        task_id: task.id,
        department_id: d["bar"].id,
        task_title: task.title,
        card_title: c.title
      })

      ok!(b1, :post, "#{@bar}/lists/#{list.id}/archive")
      refute list_named(b1, "Fall releases")

      %{"data" => archived} = ok!(b1, :get, @bar <> "/archived")
      assert [%{"name" => "Fall releases", "card_count" => 1}] = archived["lists"]

      ok!(b1, :post, "#{@bar}/lists/#{list.id}/restore")
      assert card_titles(b1, "Fall releases") == ["Pumpkin ale"]
      assert List.last(board(b1)["lists"])["name"] == "Fall releases"

      # Delete for good: archived only, managers only.
      assert {422, %{"error" => "not_archived"}} =
               req(p["barMgr"], :delete, "#{@bar}/lists/#{list.id}")

      ok!(b1, :post, "#{@bar}/lists/#{list.id}/archive")
      assert {403, _} = req(b1, :delete, "#{@bar}/lists/#{list.id}")
      assert {204, _} = req(p["barMgr"], :delete, "#{@bar}/lists/#{list.id}")

      refute Repo.get(IdeaList, list.id)
      refute Repo.get(Card, c.id)
      refute Repo.exists?(from n in Note, where: n.card_id == ^c.id)
      refute Repo.exists?(from w in Watch, where: w.card_id == ^c.id)

      # The task stays, and remembers the card's title (lead decision 4).
      assert Repo.get(Task, task.id)

      assert %CardTask{card_id: nil, card_title: "Pumpkin ale"} =
               Repo.get_by!(CardTask, task_id: task.id)

      assert %{"cards" => 1} = Repo.get_by!(Event, action: "list_deleted").detail
    end

    test "cards: archive, restore last, delete for good", %{p: p} do
      b1 = p["bartender1"]
      ideas = starter("bar", "Ideas")
      [a, b] = for t <- ~w(A B), do: card!(ideas, t)

      ok!(b1, :post, "#{@bar}/cards/#{a.id}/archive")
      assert card_titles(b1, "Ideas") == ["B"]
      assert [%{"title" => "A"}] = ok!(b1, :get, @bar <> "/archived")["data"]["cards"]

      ok!(b1, :post, "#{@bar}/cards/#{a.id}/restore")
      assert card_titles(b1, "Ideas") == ~w(B A)

      ok!(b1, :post, "#{@bar}/cards/#{b.id}/archive")
      assert {403, _} = req(b1, :delete, "#{@bar}/cards/#{b.id}")
      assert {422, _} = req(p["barMgr"], :delete, "#{@bar}/cards/#{a.id}")
      assert {204, _} = req(p["barMgr"], :delete, "#{@bar}/cards/#{b.id}")
      refute Repo.get(Card, b.id)
    end

    test "a card whose list is archived can't be restored on its own", %{p: p} do
      list = list!("bar", "Old")
      c = card!(list, "Inside", %{archived_at: ~U[2026-11-05 12:00:00Z]})
      ok!(p["bartender1"], :post, "#{@bar}/lists/#{list.id}/archive")

      assert {422, %{"error" => "list_archived"}} =
               req(p["bartender1"], :post, "#{@bar}/cards/#{c.id}/restore")

      assert Repo.get!(Card, c.id).archived_at
    end

    test "nothing goes into an archived list", %{p: p} do
      list = list!("bar", "Old", %{archived_at: ~U[2026-11-05 12:00:00Z]})
      c = card!(starter("bar", "Ideas"), "C")

      assert {422, %{"error" => "archived"}} =
               req(p["bartender1"], :post, @bar <> "/cards", %{list_id: list.id, title: "X"})

      assert {422, _} =
               req(p["bartender1"], :post, "#{@bar}/cards/#{c.id}/move", %{list_id: list.id})

      assert card_titles(p["bartender1"], "Ideas") == ["C"]
    end
  end

  describe "labels (decision 16, S256)" do
    test "anyone adds; only managers rename or delete; delete strips locked cards too", %{p: p} do
      b1 = p["bartender1"]
      %{"data" => label} = ok!(b1, :post, @bar <> "/labels", %{name: "Equipment", color: "blue"})
      c = card!(starter("bar", "Ideas"), "Locked one")
      label_card!(c, Repo.get!(RockcutApi.IdeaBoards.Label, label["id"]))
      ok!(p["barMgr"], :post, "#{@bar}/cards/#{c.id}/lock")

      assert {403, _} = req(b1, :patch, "#{@bar}/labels/#{label["id"]}", %{name: "Gear"})
      assert {403, _} = req(b1, :delete, "#{@bar}/labels/#{label["id"]}")
      assert [%{"name" => "Equipment"}] = ok!(b1, :get, @bar <> "/labels")["data"]

      ok!(p["barMgr"], :patch, "#{@bar}/labels/#{label["id"]}", %{name: "Gear", color: "green"})
      assert [%{"name" => "Gear", "color" => "green"}] = ok!(b1, :get, @bar <> "/labels")["data"]

      assert {204, _} = req(p["barMgr"], :delete, "#{@bar}/labels/#{label["id"]}")
      assert ok!(b1, :get, @bar <> "/labels")["data"] == []
      assert card(b1, c.id)["label_ids"] == []

      assert %{"cards" => 1, "name" => "Gear"} =
               Repo.get_by!(Event, action: "label_deleted").detail
    end

    test "names are unique on a board, ignoring case and spaces (lead decision 2)", %{p: p} do
      ok!(p["bartender1"], :post, @bar <> "/labels", %{name: "Equipment", color: "blue"})

      for name <- ["equipment", " EQUIPMENT "] do
        assert {422, %{"errors" => %{"name" => ["There's already a label with that name"]}}} =
                 req(p["bartender1"], :post, @bar <> "/labels", %{name: name, color: "red"})
      end

      # Another board may use it.
      ok!(p["brewer1"], :post, "/api/idea_boards/brewery/labels", %{
        name: "equipment",
        color: "red"
      })

      assert length(ok!(p["bartender1"], :get, @bar <> "/labels")["data"]) == 1
    end
  end

  describe "checklist" do
    test "tick records who; untick; edit; reorder; remove closes up", %{p: p} do
      b1 = p["bartender1"]
      c = card!(starter("bar", "Ideas"), "C")
      [i1, i2, i3] = for {t, n} <- [{"One", 1}, {"Two", 2}, {"Three", 3}], do: item!(c, t, n)
      path = "#{@bar}/cards/#{c.id}/checklist"

      ok!(p["bartender2"], :patch, "#{path}/#{i2.id}", %{done: true})
      ok!(b1, :patch, "#{path}/#{i3.id}", %{text: "Three!"})
      ok!(b1, :put, path <> "/order", %{ids: [i3.id, i1.id, i2.id]})

      items = card(b1, c.id)["checklist_items"]
      assert Enum.map(items, & &1["text"]) == ["Three!", "One", "Two"]
      assert Enum.find(items, &(&1["id"] == i2.id))["done_by"]["name"] == "Alex Draft"

      assert hd(board(b1)["lists"])["cards"] |> hd() |> Map.get("checklist") == %{
               "done" => 1,
               "total" => 3
             }

      ok!(b1, :patch, "#{path}/#{i2.id}", %{done: false})
      ok!(b1, :delete, "#{path}/#{i1.id}")
      items = card(b1, c.id)["checklist_items"]

      assert Enum.map(items, &{&1["text"], &1["position"], &1["done"]}) == [
               {"Three!", 1, false},
               {"Two", 2, false}
             ]

      assert {422, %{"error" => "invalid_order"}} =
               req(b1, :put, path <> "/order", %{ids: [i3.id]})

      assert actions("bar") ==
               ~w(checklist_ticked checklist_edited checklist_unticked checklist_removed)
    end
  end

  describe "notes (S261, decision 14)" do
    test "newest first, authors kept; author edits; managers delete", %{p: p} do
      b1 = p["bartender1"]
      c = card!(starter("bar", "Ideas"), "Taproom remodel")
      path = "#{@bar}/cards/#{c.id}/notes"

      %{"data" => first} = ok!(b1, :post, path, %{body: "First idea"})
      # Notes land in the same second here; make the order unambiguous.
      Repo.update_all(from(n in Note, where: n.id == ^first["id"]),
        set: [inserted_at: ~U[2026-11-06 20:00:00Z]]
      )

      %{"data" => second} = ok!(b1, :post, path, %{body: "Second idea"})

      ok!(b1, :patch, "#{path}/#{first["id"]}", %{body: "First idea, edited"})

      notes = card(p["bartender2"], c.id)["notes"]
      assert Enum.map(notes, & &1["body"]) == ["Second idea", "First idea, edited"]
      assert Enum.map(notes, & &1["author"]["name"]) == ["Sam Pour", "Sam Pour"]
      assert [nil, edited_at] = Enum.map(notes, & &1["edited_at"])
      assert edited_at

      # bartender2 can't touch them; nor can the owner edit one.
      assert {403, _} =
               req(p["bartender2"], :patch, "#{path}/#{second["id"]}", %{body: "Mine now"})

      assert {403, _} = req(p["bartender2"], :delete, "#{path}/#{second["id"]}")
      assert {403, _} = req(p["owner"], :patch, "#{path}/#{second["id"]}", %{body: "Owner"})
      assert hd(card(b1, c.id)["notes"])["body"] == "Second idea"

      assert {204, _} = req(p["barMgr"], :delete, "#{path}/#{second["id"]}")
      assert Enum.map(card(b1, c.id)["notes"], & &1["body"]) == ["First idea, edited"]
      assert card_in_board(b1, c.id)["note_count"] == 1

      assert {422, _} = req(b1, :post, path, %{body: String.duplicate("x", 2_001)})
      assert actions("bar") == ~w(note_added note_added note_edited note_deleted)
    end

    test "a note from another card is 404", %{p: p} do
      a = card!(starter("bar", "Ideas"), "A")
      b = card!(starter("bar", "Ideas"), "B")
      note = note!(a, p["bartender1"], "On A")

      assert {404, _} =
               req(p["bartender1"], :patch, "#{@bar}/cards/#{b.id}/notes/#{note.id}", %{body: "X"})
    end
  end

  defp card_in_board(user, id),
    do: board(user)["lists"] |> Enum.flat_map(& &1["cards"]) |> Enum.find(&(&1["id"] == id))

  describe "Watch" do
    test "on and off, per person", %{p: p} do
      c = card!(starter("bar", "Ideas"), "C")
      ok!(p["bartender1"], :put, "#{@bar}/cards/#{c.id}/watch")
      ok!(p["bartender1"], :put, "#{@bar}/cards/#{c.id}/watch")

      assert card(p["bartender1"], c.id)["watching"] == true
      assert card(p["bartender2"], c.id)["watching"] == false
      assert Repo.aggregate(from(w in Watch, where: w.card_id == ^c.id), :count) == 1

      ok!(p["bartender1"], :delete, "#{@bar}/cards/#{c.id}/watch")
      assert card(p["bartender1"], c.id)["watching"] == false
      # Not History.
      assert actions("bar") == []
    end
  end

  describe "people leaving (§4.1)" do
    test "S243: leaving the Taproom takes floater off its cards and watches only", %{p: p} do
      bar_card = card!(starter("bar", "Ideas"), "Taproom card")
      brewery_card = card!(starter("brewery", "Ideas"), "Brewery card")
      company_card = card!(starter("company", "Ideas"), "Company card")

      for c <- [bar_card, brewery_card, company_card] do
        assign!(c, [p["floater"], p["bartender1"]])
        watch!(c, p["floater"])
      end

      ok!(p["owner"], :put, "/api/users/#{p["floater"].id}/memberships", %{
        memberships: [%{department: "brewery", role: "employee"}]
      })

      assert card(p["bartender1"], bar_card.id)["assignee_ids"] == [p["bartender1"].id]
      refute Repo.exists?(from w in Watch, where: w.card_id == ^bar_card.id)

      floater = reload(p["floater"])

      assert card(floater, brewery_card.id, "/api/idea_boards/brewery")["assignee_ids"] == [
               p["floater"].id,
               p["bartender1"].id
             ]

      assert card(floater, company_card.id, @company)["watching"] == true

      assert %Event{action: "card_unassigned", detail: %{"reason" => "left_bar"}} =
               Repo.get_by!(Event, board: "bar", card_id: bar_card.id)

      history = ok!(p["barMgr"], :get, @bar <> "/history")
      assert history["names"]["users"][to_string(p["floater"].id)] == "Jordan Float"
    end

    test "S260: deactivation takes them off every card and watch; notes stay", %{p: p} do
      temp = p["bartender2"]
      bar_card = card!(starter("bar", "Ideas"), "Taproom card")
      company_card = card!(starter("company", "Ideas"), "Company card")

      for c <- [bar_card, company_card] do
        assign!(c, [temp])
        watch!(c, temp)
      end

      note!(bar_card, temp, "I was here")

      ok!(p["owner"], :patch, "/api/users/#{temp.id}", %{active: false})

      for {c, base} <- [{bar_card, @bar}, {company_card, @company}] do
        saved = card(p["owner"], c.id, base)
        assert saved["assignee_ids"] == []
      end

      refute Repo.exists?(from w in Watch, where: w.user_id == ^temp.id)

      assert [%{"body" => "I was here", "author" => %{"name" => "Alex Draft"}}] =
               card(p["owner"], bar_card.id)["notes"]

      reasons =
        Repo.all(
          from e in Event,
            where: e.action == "card_unassigned",
            select: {e.board, e.detail["reason"]}
        )

      assert Enum.sort(reasons) == [{"bar", "deactivated"}, {"company", "deactivated"}]
    end
  end
end
