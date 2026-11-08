defmodule RockcutApiWeb.IdeaBoardControllerTest do
  @moduledoc """
  D53 Part 2 stage 2: the Idea Board reads (§4.3). The board's lists with
  card faces (labels, assignees, checklist counts, note counts, lock,
  watched-by-me, sent-task chips), a card in full, Archived, History, and
  `/api/me`'s `idea_boards`. Who may call what is the route matrix's
  (`idea_board_route_matrix_test`).
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IdeaBoardFixtures

  alias RockcutApi.Repo
  alias RockcutApi.Tasks.{Task, TaskSeries}

  setup do
    %{p: personas(~w(owner barMgr bartender1 bartender2 brewer1 noDept)), d: departments()}
  end

  defp get_json(user, path, params \\ %{}) do
    conn = call(user, :get, path, params)
    assert conn.status == 200, "#{path}: #{conn.status} #{conn.resp_body}"
    Jason.decode!(conn.resp_body)
  end

  defp card_in(lists, id),
    do: lists |> Enum.flat_map(& &1["cards"]) |> Enum.find(&(&1["id"] == id))

  describe "GET /api/idea_boards/:board/lists" do
    test "the starter lists, in order, with no cards", %{p: p} do
      %{"data" => %{"lists" => lists, "labels" => []}} =
        get_json(p["bartender1"], "/api/idea_boards/bar/lists")

      assert Enum.map(lists, & &1["name"]) == ~w(Ideas Planned Doing Done)
      assert Enum.all?(lists, &(&1["cards"] == [] and &1["locked"] == false))
    end

    test "card faces: labels, assignees, counts, lock, watching, sent tasks", %{p: p, d: d} do
      ideas = starter("bar", "Ideas")
      remodel = card!(ideas, "Taproom remodel", %{due_on: ~D[2026-11-12]})
      quiet = card!(ideas, "Quiet card")

      label = label!("bar", "Big", "red")
      label_card!(remodel, label)
      assign!(remodel, [p["bartender1"], p["bartender2"]])
      item!(remodel, "Measure", 1, p["bartender2"])
      item!(remodel, "Quote", 2)
      item!(remodel, "Paint", 3)
      note!(remodel, p["bartender2"], "First")
      note!(remodel, p["bartender1"], "Second")
      watch!(remodel, p["bartender1"])
      watch!(quiet, p["bartender2"])

      Repo.update!(
        Ecto.Changeset.change(remodel,
          locked_at: ~U[2026-11-02 15:00:00Z],
          locked_by_id: p["barMgr"].id
        )
      )

      task =
        Repo.insert!(%Task{
          department_id: d["bar"].id,
          title: "Taproom remodel",
          due_on: ~D[2026-11-12],
          position: 1
        })

      sent!(remodel, %{task_id: task.id, department_id: d["bar"].id, task_title: task.title})

      %{"data" => %{"lists" => lists, "labels" => labels}} =
        get_json(p["bartender1"], "/api/idea_boards/bar/lists")

      assert [%{"id" => label_id, "name" => "Big", "color" => "red"}] = labels
      face = card_in(lists, remodel.id)

      assert face["title"] == "Taproom remodel"
      assert face["due_on"] == "2026-11-12"
      assert face["label_ids"] == [label_id]
      assert face["assignee_ids"] == [p["bartender1"].id, p["bartender2"].id]
      assert face["checklist"] == %{"done" => 1, "total" => 3}
      assert face["note_count"] == 2
      assert face["locked"] == true
      assert face["locked_by"] == %{"id" => p["barMgr"].id, "name" => "Casey Tap"}
      assert face["watching"] == true

      assert [
               %{
                 "state" => "on_list",
                 "task_id" => tid,
                 "due_on" => "2026-11-12",
                 "department" => %{"key" => "bar"}
               }
             ] = face["sent_tasks"]

      assert tid == task.id

      # `watching` is the viewer's own: bartender1 doesn't watch the quiet card.
      assert card_in(lists, quiet.id)["watching"] == false
      assert card_in(lists, quiet.id)["checklist"] == %{"done" => 0, "total" => 0}

      %{"data" => %{"lists" => lists}} = get_json(p["bartender2"], "/api/idea_boards/bar/lists")
      assert card_in(lists, remodel.id)["watching"] == false
      assert card_in(lists, quiet.id)["watching"] == true
    end

    test "archived lists and cards stay off the board; other boards' rows never show", %{p: p} do
      ideas = starter("bar", "Ideas")
      kept = card!(ideas, "Kept")
      card!(ideas, "Gone", %{archived_at: ~U[2026-11-05 12:00:00Z]})
      old = list!("bar", "Old", %{archived_at: ~U[2026-11-05 12:00:00Z]})
      card!(old, "In the old list")
      card!(starter("brewery", "Ideas"), "Brewery idea")
      label!("brewery", "Brewery only")

      %{"data" => %{"lists" => lists, "labels" => labels}} =
        get_json(p["bartender1"], "/api/idea_boards/bar/lists")

      assert Enum.map(lists, & &1["name"]) == ~w(Ideas Planned Doing Done)
      assert lists |> Enum.flat_map(& &1["cards"]) |> Enum.map(& &1["id"]) == [kept.id]
      assert labels == []
    end

    test "sent-task chip states: done, removed, repeating", %{p: p, d: d} do
      card = card!(starter("bar", "Doing"), "Fall releases")
      bar = d["bar"].id

      done =
        Repo.insert!(%Task{
          department_id: bar,
          title: "Done one",
          due_on: ~D[2026-11-10],
          position: 1,
          completed_at: ~U[2026-11-12 18:00:00Z],
          completed_on: ~D[2026-11-12],
          completed_by_id: p["bartender2"].id,
          completed_display: "planned_day"
        })

      series =
        Repo.insert!(%TaskSeries{
          department_id: bar,
          title: "Weekly",
          frequency: "weekly",
          interval: 1,
          weekdays: [3],
          start_date: ~D[2026-11-11]
        })

      sent!(card, %{task_id: done.id, department_id: bar, task_title: "Done one"})

      sent!(card, %{
        task_id: nil,
        department_id: bar,
        task_title: "Deleted one",
        removed_at: ~U[2026-11-07 12:00:00Z]
      })

      sent!(card, %{task_series_id: series.id, department_id: bar, task_title: "Weekly"})

      %{"data" => %{"lists" => lists}} = get_json(p["bartender1"], "/api/idea_boards/bar/lists")
      chips = card_in(lists, card.id)["sent_tasks"]

      assert Enum.map(chips, &{&1["task_title"], &1["state"]}) == [
               {"Done one", "done"},
               {"Deleted one", "removed"},
               {"Weekly", "repeating"}
             ]

      assert Enum.at(chips, 0)["completed_on"] == "2026-11-12"
      assert Enum.at(chips, 2)["series"] == %{"frequency" => "weekly", "interval" => 1}

      # A task deleted by the database's nilify (no removed_at yet) reads as removed too.
      Repo.delete!(done)
      %{"data" => %{"lists" => lists}} = get_json(p["bartender1"], "/api/idea_boards/bar/lists")

      assert card_in(lists, card.id)["sent_tasks"] |> Enum.at(0) |> Map.take(~w(state task_title)) ==
               %{"state" => "removed", "task_title" => "Done one"}
    end
  end

  describe "GET /api/idea_boards/:board/cards/:id" do
    test "everything the dialog shows; notes newest first", %{p: p} do
      card =
        card!(starter("bar", "Ideas"), "Taproom remodel", %{
          description: "New bar top",
          created_by_id: p["bartender1"].id
        })

      label = label!("bar", "Big", "red")
      label_card!(card, label)
      assign!(card, [p["bartender2"]])
      item!(card, "Second", 2)
      item!(card, "First", 1, p["bartender2"])
      note!(card, p["bartender1"], "Older", ~U[2026-11-06 20:00:00Z])
      note!(card, p["bartender2"], "Newer", ~U[2026-11-06 21:14:00Z])

      %{"data" => c} = get_json(p["bartender1"], "/api/idea_boards/bar/cards/#{card.id}")

      assert c["description"] == "New bar top"
      assert c["list"]["name"] == "Ideas"
      assert c["created_by"]["name"] == "Sam Pour"
      assert [%{"name" => "Big", "color" => "red"}] = c["labels"]
      assert c["assignees"] == [%{"id" => p["bartender2"].id, "name" => "Alex Draft"}]

      assert [
               %{"text" => "First", "done" => true, "done_by" => %{"name" => "Alex Draft"}},
               %{"text" => "Second", "done" => false, "done_by" => nil}
             ] = c["checklist_items"]

      assert [
               %{"body" => "Newer", "author" => %{"name" => "Alex Draft"}, "edited_at" => nil},
               %{"body" => "Older", "author" => %{"name" => "Sam Pour"}}
             ] = c["notes"]
    end

    test "an archived card still opens (from Archived)", %{p: p} do
      card = card!(starter("bar", "Ideas"), "Shelved", %{archived_at: ~U[2026-11-05 12:00:00Z]})
      %{"data" => c} = get_json(p["bartender1"], "/api/idea_boards/bar/cards/#{card.id}")
      assert c["archived_at"] == "2026-11-05T12:00:00Z"
    end

    test "a card from another board is 404; a missing or junk id 404", %{p: p} do
      brewery_card = card!(starter("brewery", "Ideas"), "Brewery idea")

      for id <- [brewery_card.id, 999_999, "abc"],
          do: assert(status(p["owner"], :get, "/api/idea_boards/bar/cards/#{id}") == 404)
    end

    test "a board you can't open is 403 before the id (§4.2)", %{p: p} do
      card = card!(starter("bar", "Ideas"), "Taproom idea")
      assert status(p["brewer1"], :get, "/api/idea_boards/bar/cards/#{card.id}") == 403
      assert status(p["brewer1"], :get, "/api/idea_boards/bar/cards/999999") == 403
    end
  end

  test "unknown boards and `other` are 404", %{p: p} do
    for key <- ~w(other nope all) do
      assert status(p["owner"], :get, "/api/idea_boards/#{key}/lists") == 404
    end
  end

  test "GET /api/idea_boards/:board/labels", %{p: p} do
    label!("company", "Q1", "blue")

    assert %{"data" => [%{"name" => "Q1", "color" => "blue"}]} =
             get_json(p["noDept"], "/api/idea_boards/company/labels")
  end

  test "GET …/archived: archived lists with counts, archived cards of live lists", %{p: p} do
    old = list!("bar", "Old", %{archived_at: ~U[2026-11-05 12:00:00Z]})
    card!(old, "One")
    card!(old, "Two")
    shelved = card!(starter("bar", "Ideas"), "Shelved", %{archived_at: ~U[2026-11-05 13:00:00Z]})
    card!(starter("bar", "Ideas"), "Live")

    %{"data" => %{"lists" => lists, "cards" => cards}} =
      get_json(p["bartender1"], "/api/idea_boards/bar/archived")

    assert [%{"name" => "Old", "card_count" => 2}] = lists
    assert [%{"id" => id, "title" => "Shelved", "list" => %{"name" => "Ideas"}}] = cards
    assert id == shelved.id
  end

  test "GET …/history: newest first, this board's only, per card", %{p: p} do
    event!("bar", "card_created", %{card_id: 1, title: "A", actor_id: p["bartender1"].id})

    event!("bar", "card_assigned", %{
      card_id: 2,
      title: "B",
      actor_id: p["barMgr"].id,
      detail: %{"assignee_ids" => [p["bartender2"].id]}
    })

    event!("brewery", "card_created", %{card_id: 3, title: "C"})

    body = get_json(p["barMgr"], "/api/idea_boards/bar/history")
    assert Enum.map(body["data"], & &1["title"]) == ["B", "A"]
    assert hd(body["data"])["actor_name"] == "Casey Tap"
    assert body["names"]["users"] == %{to_string(p["bartender2"].id) => "Alex Draft"}
    assert body["total"] == 2

    assert get_json(p["barMgr"], "/api/idea_boards/bar/history", %{card_id: 1})["data"]
           |> Enum.map(& &1["title"]) == ["A"]
  end

  describe "the boards I can open" do
    test "GET /api/idea_boards and /api/me agree; Company last", %{p: p} do
      for {who, keys} <- [
            {"bartender1", ~w(bar company)},
            {"barMgr", ~w(bar company)},
            {"brewer1", ~w(brewery company)},
            {"noDept", ~w(company)},
            {"owner", ~w(brewery bar office sales company)}
          ] do
        %{"data" => boards} = get_json(p[who], "/api/idea_boards")
        assert Enum.map(boards, & &1["key"]) == keys, who
        assert get_json(p[who], "/api/me")["idea_boards"] == boards, who
      end
    end

    test "manage and history flags", %{p: p} do
      flags = fn who ->
        get_json(p[who], "/api/idea_boards")["data"]
        |> Map.new(&{&1["key"], {&1["manage"], &1["history"]}})
      end

      assert flags.("barMgr") == %{"bar" => {true, true}, "company" => {false, false}}
      assert flags.("bartender1") == %{"bar" => {false, false}, "company" => {false, false}}
      assert flags.("owner")["company"] == {true, true}
    end
  end
end
