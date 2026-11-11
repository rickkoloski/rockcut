defmodule RockcutApiWeb.OwnersNotScheduledTest do
  @moduledoc """
  D59 §4.2: a department with `scheduling: false` (Owners) has no positions,
  shifts or schedule events. Every way one gets a department is refused with a
  422 on `department_id`; the same request for a scheduled department works.

  Shifts take their department from their position, and shift templates and
  day/week template items carry only a position, so Copy previous week and
  applying a template (both `POST /api/shifts` from the Scheduler) can reach
  Owners only through a position in it. The API never makes one; the legacy
  rows below are inserted directly to prove the shift path refuses anyway.
  """
  use RockcutApiWeb.ConnCase

  import Ecto.Query, only: [from: 2]
  import RockcutApi.PersonaFixtures
  import RockcutApi.SchedulingFixtures

  alias RockcutApi.Repo
  alias RockcutApi.Scheduling.{Position, ScheduleEvent, ScheduleEventSeries, Shift}

  @refused %{"department_id" => ["Owners isn't on the schedule"]}

  setup do
    %{p: personas(~w(owner barMgr)), d: departments()}
  end

  defp errors(conn), do: json_response(conn, 422)["errors"]

  defp event_attrs(dept, extra \\ %{}) do
    Map.merge(
      %{
        "department_id" => dept.id,
        "title" => "Partners' dinner",
        "starts_at" => "2026-12-02T01:00:00Z",
        "ends_at" => "2026-12-02T03:00:00Z"
      },
      extra
    )
  end

  @weekly %{"repeat" => "weekly", "repeat_weekdays" => [2], "repeat_count" => 4}

  describe "positions" do
    test "create in Owners → 422; in Bar → 201", %{p: p, d: d} do
      conn =
        call(p["owner"], :post, "/api/positions", %{name: "Chair", department_id: d["owners"].id})

      assert errors(conn) == @refused
      refute Repo.get_by(Position, name: "Chair")

      conn =
        call(p["owner"], :post, "/api/positions", %{name: "Chair", department_id: d["bar"].id})

      assert json_response(conn, 201)
    end

    test "moving a position into Owners → 422; to Office → 200", %{p: p, d: d} do
      pos = position_fixture(%{department: d["bar"]})

      conn =
        call(p["owner"], :patch, "/api/positions/#{pos.id}", %{department_id: d["owners"].id})

      assert errors(conn) == @refused
      assert Repo.reload!(pos).department_id == d["bar"].id

      conn =
        call(p["owner"], :patch, "/api/positions/#{pos.id}", %{department_id: d["office"].id})

      assert json_response(conn, 200)
    end

    test "editing a position without changing its department isn't checked", %{d: d} do
      # A legacy Owners position (the API can't make one) can still be renamed.
      pos = position_fixture(%{department: d["owners"]})
      assert Position.changeset(pos, %{name: "Renamed"}).valid?
    end
  end

  describe "shifts (and Copy previous week / templates, which POST them)" do
    test "a shift on an Owners position → 422; on a Bar position → 201", %{p: p, d: d} do
      legacy = position_fixture(%{department: d["owners"]})
      bar_pos = position_fixture(%{department: d["bar"]})
      times = %{starts_at: "2026-12-01T16:00:00Z", ends_at: "2026-12-01T22:00:00Z"}

      conn = call(p["owner"], :post, "/api/shifts", Map.put(times, :position_id, legacy.id))
      assert errors(conn) == @refused
      assert Repo.aggregate(from(s in Shift, where: s.position_id == ^legacy.id), :count) == 0

      conn = call(p["owner"], :post, "/api/shifts", Map.put(times, :position_id, bar_pos.id))
      assert json_response(conn, 201)["data"]["department_id"] == d["bar"].id
    end

    test "moving a shift onto an Owners position → 422; another Bar position → 200",
         %{p: p, d: d} do
      shift = shift_fixture(%{department: d["bar"]})
      legacy = position_fixture(%{department: d["owners"]})
      other = position_fixture(%{department: d["bar"]})

      conn = call(p["owner"], :patch, "/api/shifts/#{shift.id}", %{position_id: legacy.id})
      assert errors(conn) == @refused
      assert Repo.reload!(shift).department_id == d["bar"].id

      conn = call(p["owner"], :patch, "/api/shifts/#{shift.id}", %{position_id: other.id})
      assert json_response(conn, 200)
    end

    test "Shift.changeset refuses department_id Owners directly", %{d: d} do
      cs = Shift.changeset(%Shift{}, %{department_id: d["owners"].id})
      assert {"Owners isn't on the schedule", _} = cs.errors[:department_id]
    end
  end

  describe "schedule events" do
    test "a one-off event in Owners → 422; in Bar → 201", %{p: p, d: d} do
      assert errors(call(p["owner"], :post, "/api/schedule_events", event_attrs(d["owners"]))) ==
               @refused

      refute Repo.get_by(ScheduleEvent, title: "Partners' dinner")

      assert json_response(
               call(p["owner"], :post, "/api/schedule_events", event_attrs(d["bar"])),
               201
             )
    end

    test "moving an event into Owners → 422; to Office → 200", %{p: p, d: d} do
      event = event_fixture(%{department: d["bar"]})

      conn =
        call(p["owner"], :patch, "/api/schedule_events/#{event.id}", %{
          "department_id" => d["owners"].id
        })

      assert errors(conn) == @refused
      assert Repo.reload!(event).department_id == d["bar"].id

      conn =
        call(p["owner"], :patch, "/api/schedule_events/#{event.id}", %{
          "department_id" => d["office"].id
        })

      assert json_response(conn, 200)
    end
  end

  describe "schedule event series" do
    test "a repeating event in Owners → 422, no series; in Bar → 201", %{p: p, d: d} do
      conn = call(p["owner"], :post, "/api/schedule_events", event_attrs(d["owners"], @weekly))
      assert errors(conn) == @refused
      assert Repo.aggregate(ScheduleEventSeries, :count) == 0

      conn = call(p["owner"], :post, "/api/schedule_events", event_attrs(d["bar"], @weekly))
      assert json_response(conn, 201)["count"] == 4
    end

    test "this / following edits into Owners → 422; following into Office → 200",
         %{p: p, d: d} do
      first =
        json_response(
          call(p["owner"], :post, "/api/schedule_events", event_attrs(d["bar"], @weekly)),
          201
        )[
          "data"
        ]

      occs =
        Repo.all(
          from(e in ScheduleEvent,
            where: e.series_id == ^first["series_id"],
            order_by: e.starts_at
          )
        )

      second = Enum.at(occs, 1)

      for scope <- ~w(this following) do
        conn =
          call(p["owner"], :patch, "/api/schedule_events/#{second.id}", %{
            "department_id" => d["owners"].id,
            "scope" => scope
          })

        assert errors(conn) == @refused, scope
      end

      assert Repo.all(from(e in ScheduleEvent, select: e.department_id)) |> Enum.uniq() == [
               d["bar"].id
             ]

      assert Repo.all(from(s in ScheduleEventSeries, select: s.department_id)) == [d["bar"].id]

      conn =
        call(p["owner"], :patch, "/api/schedule_events/#{second.id}", %{
          "department_id" => d["office"].id,
          "scope" => "following"
        })

      assert json_response(conn, 200)
    end

    test "ScheduleEventSeries.changeset refuses Owners directly", %{d: d} do
      cs = ScheduleEventSeries.changeset(%ScheduleEventSeries{}, %{department_id: d["owners"].id})
      assert {"Owners isn't on the schedule", _} = cs.errors[:department_id]
    end
  end
end
