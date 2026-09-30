defmodule RockcutApiWeb.ScheduleEventControllerTest do
  use RockcutApiWeb.ConnCase

  import RockcutApi.PersonaFixtures
  import RockcutApi.SchedulingFixtures

  alias RockcutApi.Repo
  alias RockcutApi.Notifications.Notification
  alias RockcutApi.Scheduling.ScheduleEvent

  setup do
    %{p: personas(), d: departments()}
  end

  defp iso(dt), do: DateTime.to_iso8601(dt)

  defp at(date, time),
    do: DateTime.new!(Date.from_iso8601!(date), Time.from_iso8601!(time), "Etc/UTC")

  defp new_event(d, dept \\ "bar") do
    %{
      "department_id" => d[dept].id,
      "title" => "Private party — back room",
      "notes" => "Kegs set up by 5",
      "starts_at" => iso(at("2026-10-09", "00:00:00")),
      "ends_at" => iso(at("2026-10-09", "04:00:00"))
    }
  end

  describe "create" do
    test "a Bar manager creates a draft Bar event", %{p: p, d: d} do
      conn = call(p["barMgr"], :post, "/api/schedule_events", new_event(d))

      assert %{"status" => "draft", "title" => "Private party — back room"} =
               json_response(conn, 201)["data"]
    end

    test "an employee, or another department's manager, is refused", %{p: p, d: d} do
      assert status(p["bartender1"], :post, "/api/schedule_events", new_event(d)) == 403
      assert status(p["breweryMgr"], :post, "/api/schedule_events", new_event(d)) == 403

      assert status(p["breweryMgr"], :post, "/api/schedule_events", new_event(d, "brewery")) ==
               201
    end

    test "a title is required and at most 100 characters", %{p: p, d: d} do
      assert status(p["barMgr"], :post, "/api/schedule_events", %{new_event(d) | "title" => " "}) ==
               422

      long = String.duplicate("x", 101)

      assert status(p["barMgr"], :post, "/api/schedule_events", %{new_event(d) | "title" => long}) ==
               422
    end

    test "the end must be after the start", %{p: p, d: d} do
      attrs = %{new_event(d) | "ends_at" => new_event(d)["starts_at"]}
      assert status(p["barMgr"], :post, "/api/schedule_events", attrs) == 422
    end
  end

  describe "read" do
    test "anyone reads a published event; an employee gets 404 for a draft (S4, S5)", %{
      p: p,
      d: d
    } do
      pub = event_fixture(%{department: d["bar"], status: "published"})
      draft = event_fixture(%{department: d["bar"], status: "draft"})

      assert status(p["bartender1"], :get, "/api/schedule_events/#{pub.id}") == 200
      assert status(p["bartender1"], :get, "/api/schedule_events/#{draft.id}") == 404
      assert status(p["barMgr"], :get, "/api/schedule_events/#{draft.id}") == 200
    end

    test "the list has published events plus drafts in managed departments", %{p: p, d: d} do
      pub = event_fixture(%{department: d["bar"], status: "published"})
      bar_draft = event_fixture(%{department: d["bar"], status: "draft"})
      brewery_draft = event_fixture(%{department: d["brewery"], status: "draft"})

      ids = fn who -> call(p[who], :get, "/api/schedule_events") |> data_ids() |> MapSet.new() end

      assert ids.("bartender1") == MapSet.new([pub.id])
      assert ids.("barMgr") == MapSet.new([pub.id, bar_draft.id])
      assert ids.("owner") == MapSet.new([pub.id, bar_draft.id, brewery_draft.id])
    end

    test "a week range includes an event that started before it", %{p: p, d: d} do
      spanning =
        event_fixture(%{
          department: d["bar"],
          status: "published",
          all_day: true,
          starts_at: at("2026-10-04", "06:00:00"),
          ends_at: at("2026-10-07", "06:00:00")
        })

      after_week =
        event_fixture(%{
          department: d["bar"],
          status: "published",
          starts_at: at("2026-10-13", "01:00:00"),
          ends_at: at("2026-10-13", "03:00:00")
        })

      ids =
        call(p["bartender1"], :get, "/api/schedule_events", %{
          "from" => "2026-10-05",
          "to" => "2026-10-11"
        })
        |> data_ids()

      assert spanning.id in ids
      refute after_week.id in ids
    end
  end

  describe "update and delete" do
    test "an employee gets 403 changing a published event (S4)", %{p: p, d: d} do
      pub = event_fixture(%{department: d["bar"], status: "published"})

      assert status(p["bartender1"], :patch, "/api/schedule_events/#{pub.id}", %{"title" => "x"}) ==
               403

      assert status(p["bartender1"], :delete, "/api/schedule_events/#{pub.id}") == 403
    end

    test "moving an event needs the destination department too", %{p: p, d: d} do
      e = event_fixture(%{department: d["bar"]})

      move = fn who, dept ->
        status(p[who], :patch, "/api/schedule_events/#{e.id}", %{"department_id" => d[dept].id})
      end

      assert move.("barMgr", "brewery") == 403
      assert move.("dualMgr", "office") == 200
    end

    test "a manager edits and deletes their event", %{p: p, d: d} do
      e = event_fixture(%{department: d["bar"]})

      conn = call(p["barMgr"], :patch, "/api/schedule_events/#{e.id}", %{"notes" => "Updated"})
      assert json_response(conn, 200)["data"]["notes"] == "Updated"

      assert status(p["barMgr"], :delete, "/api/schedule_events/#{e.id}") == 200
      refute Repo.get(ScheduleEvent, e.id)
    end
  end

  describe "publish" do
    test "publish and unpublish one event", %{p: p, d: d} do
      e = event_fixture(%{department: d["bar"]})

      conn = call(p["barMgr"], :post, "/api/schedule_events/#{e.id}/publish")
      assert json_response(conn, 200)["data"]["status"] == "published"

      conn = call(p["barMgr"], :post, "/api/schedule_events/#{e.id}/unpublish")
      assert json_response(conn, 200)["data"]["status"] == "draft"
    end

    test "batch publish skips events the actor can't publish", %{p: p, d: d} do
      bar = event_fixture(%{department: d["bar"]})
      office = event_fixture(%{department: d["office"]})
      brewery = event_fixture(%{department: d["brewery"]})

      conn =
        call(p["dualMgr"], :post, "/api/schedule_events/publish", %{
          "ids" => [bar.id, office.id, brewery.id]
        })

      assert json_response(conn, 200)["count"] == 2
      assert Repo.get!(ScheduleEvent, brewery.id).status == "draft"
    end
  end

  test "no event operation creates a notification", %{p: p, d: d} do
    before = Repo.aggregate(Notification, :count)

    id =
      json_response(call(p["barMgr"], :post, "/api/schedule_events", new_event(d)), 201)["data"][
        "id"
      ]

    call(p["barMgr"], :patch, "/api/schedule_events/#{id}", %{"title" => "Renamed"})
    call(p["barMgr"], :post, "/api/schedule_events/#{id}/publish")
    call(p["barMgr"], :post, "/api/schedule_events/#{id}/unpublish")
    call(p["barMgr"], :post, "/api/schedule_events/publish", %{"ids" => [id]})
    call(p["barMgr"], :delete, "/api/schedule_events/#{id}")

    assert Repo.aggregate(Notification, :count) == before
  end
end
