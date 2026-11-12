defmodule RockcutApiWeb.ScheduleEventSeriesSplitTest do
  @moduledoc """
  D58 §3.6 (4261): D39's split gaps, checked on D32's repeating schedule events.

    * G1: "following" actions from before a split reach past it;
    * R1: a rule change from before a split doesn't keep the split's
      internal end, and the later part follows the new rule.
  """
  use RockcutApiWeb.ConnCase

  import Ecto.Query
  import RockcutApi.PersonaFixtures

  alias RockcutApi.{Repo, Scheduling}
  alias RockcutApi.Scheduling.{Recurrence, ScheduleEvent, ScheduleEventSeries}

  setup %{} do
    p = personas()
    d = departments()

    # Trivia: Tuesdays 7–9 pm Colorado time from Tue Oct 6, 2026, no end.
    first =
      json_response(
        call(p["barMgr"], :post, "/api/schedule_events", %{
          "department_id" => d["bar"].id,
          "title" => "Trivia night",
          "starts_at" => "2026-10-07T01:00:00Z",
          "ends_at" => "2026-10-07T03:00:00Z",
          "repeat" => "weekly",
          "repeat_weekdays" => [2]
        }),
        201
      )["data"]

    # From Tue Nov 3 (the 5th date), Thursdays: the split.
    fifth = Enum.at(all(), 4)

    json_response(
      call(p["barMgr"], :patch, "/api/schedule_events/#{fifth.id}", %{
        "starts_at" => "2026-11-06T02:00:00Z",
        "ends_at" => "2026-11-06T04:00:00Z",
        "repeat" => "weekly",
        "repeat_weekdays" => [4],
        "scope" => "following"
      }),
      200
    )

    second = Enum.at(all(), 1)
    %{mgr: p["barMgr"], first: first, second: second}
  end

  defp all, do: Repo.all(from e in ScheduleEvent, order_by: e.starts_at)
  defp day(e), do: elem(Recurrence.to_local(e.starts_at), 0)
  defp after_(date), do: Enum.filter(all(), &(Date.compare(day(&1), date) == :gt))

  test "the split leaves Tuesdays to Nov 2, then Thursdays", _ctx do
    days = Enum.map(all(), &day/1)

    assert Enum.take(days, 5) == [
             ~D[2026-10-06],
             ~D[2026-10-13],
             ~D[2026-10-20],
             ~D[2026-10-27],
             ~D[2026-11-05]
           ]

    assert days |> Enum.drop(4) |> Enum.all?(&(Date.day_of_week(&1) == 4))
  end

  describe "G1: following from before the split" do
    test "delete this and all following removes the later part too", ctx do
      assert status(ctx.mgr, :delete, "/api/schedule_events/#{ctx.second.id}?scope=following") ==
               200

      assert Enum.map(all(), &day/1) == [~D[2026-10-06]]
    end

    test "an edit to this and all following reaches the later part", ctx do
      json_response(
        call(ctx.mgr, :patch, "/api/schedule_events/#{ctx.second.id}", %{
          "title" => "Trivia (new host)",
          "scope" => "following"
        }),
        200
      )

      assert after_(~D[2026-10-06]) |> Enum.map(& &1.title) |> Enum.uniq() == [
               "Trivia (new host)"
             ]
    end
  end

  describe "R1: a rule change from before the split" do
    test "the dialog isn't shown the split's internal end", ctx do
      data = json_response(call(ctx.mgr, :get, "/api/schedule_events/#{ctx.second.id}"), 200)
      assert data["data"]["series"]["until_date"] == nil
    end

    test "the new rule runs on, and the later part goes", ctx do
      json_response(
        call(ctx.mgr, :patch, "/api/schedule_events/#{ctx.second.id}", %{
          "starts_at" => "2026-10-15T01:00:00Z",
          "ends_at" => "2026-10-15T03:00:00Z",
          "repeat" => "weekly",
          "repeat_weekdays" => [3],
          "scope" => "following"
        }),
        200
      )

      later = after_(~D[2026-10-06])
      assert Enum.all?(later, &(Date.day_of_week(day(&1)) == 3))
      assert Date.compare(later |> List.last() |> day(), ~D[2027-06-01]) == :gt
    end
  end

  describe "the chain" do
    defp series_of(mgr, event_id),
      do:
        json_response(call(mgr, :get, "/api/schedule_events/#{event_id}"), 200)["data"]["series"]

    # D58 lead decisions 1 (DEV QA gap 8): after the Tuesday → Thursday
    # split, a Tuesday's dialog reads "Every Thursday", the chain's rule now.
    test "an earlier part's dialog shows the chain's current rule", ctx do
      old = series_of(ctx.mgr, ctx.second.id)
      [thu | _] = after_(~D[2026-11-01])
      latest = series_of(ctx.mgr, thu.id)

      assert old["frequency"] == "weekly"
      assert old["weekdays"] == [4]
      assert old["interval"] == 1
      assert old["until_date"] == nil
      assert old["generated_through"] == latest["generated_through"]
      # Its own part still holds Tuesdays.
      assert Repo.get!(ScheduleEventSeries, ctx.second.series_id).weekdays == [2]
    end

    test "Extend from an old part goes on in the latest one", ctx do
      old = Repo.get!(ScheduleEventSeries, ctx.second.series_id)
      thursdays = after_(~D[2026-11-01])
      latest = Repo.get!(ScheduleEventSeries, hd(thursdays).series_id)

      assert {:ok, added} = Scheduling.extend_series(old, Date.add(latest.generated_through, 60))
      assert added > 0
      assert length(after_(~D[2026-11-01])) == length(thursdays) + added
      assert Enum.all?(after_(~D[2026-11-01]), &(Date.day_of_week(day(&1)) == 4))
    end

    test "deleting the later part from its first date makes the split's end the real one", ctx do
      [thu | _] = after_(~D[2026-11-01])
      assert status(ctx.mgr, :delete, "/api/schedule_events/#{thu.id}?scope=following") == 200

      assert series_of(ctx.mgr, ctx.second.id)["until_date"] == "2026-11-02"
      assert after_(~D[2026-11-01]) == []
    end

    test "a count is the chain's total, on every part", ctx do
      # From the 3rd Thursday, 10 times in all: 4 Tuesdays + 2 Thursdays used.
      thu3 = Enum.at(after_(~D[2026-11-01]), 2)

      json_response(
        call(ctx.mgr, :patch, "/api/schedule_events/#{thu3.id}", %{
          "starts_at" => "2026-11-20T02:00:00Z",
          "ends_at" => "2026-11-20T04:00:00Z",
          "repeat" => "weekly",
          "repeat_weekdays" => [4],
          "repeat_count" => 10,
          "scope" => "following"
        }),
        200
      )

      assert length(all()) == 10
      assert series_of(ctx.mgr, ctx.second.id)["count"] == 10
      assert series_of(ctx.mgr, List.last(all()).id)["count"] == 10
    end
  end
end
