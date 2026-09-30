defmodule RockcutApiWeb.ScheduleEventSeriesTest do
  @moduledoc "D32 §3.7 — repeating events through the API (S13–S18)."
  use RockcutApiWeb.ConnCase

  import Ecto.Query
  import RockcutApi.PersonaFixtures

  alias RockcutApi.{Repo, Scheduling}
  alias RockcutApi.Notifications.Notification
  alias RockcutApi.Scheduling.{Recurrence, ScheduleEvent, ScheduleEventSeries}

  setup do
    %{p: personas(), d: departments()}
  end

  # Trivia: Tuesdays 7–9 pm Colorado time, from Tue Oct 6, 2026 (MDT).
  defp trivia(d, extra \\ %{}) do
    Map.merge(
      %{
        "department_id" => d["bar"].id,
        "title" => "Trivia night",
        "notes" => "House-run",
        "starts_at" => "2026-10-07T01:00:00Z",
        "ends_at" => "2026-10-07T03:00:00Z",
        "repeat" => "weekly",
        "repeat_weekdays" => [2],
        "repeat_count" => 8
      },
      extra
    )
  end

  defp create!(user, attrs) do
    body = json_response(call(user, :post, "/api/schedule_events", attrs), 201)
    {body["data"], body["count"]}
  end

  defp occurrences(series_id) do
    from(e in ScheduleEvent, where: e.series_id == ^series_id, order_by: e.starts_at)
    |> Repo.all()
  end

  defp local(e), do: Recurrence.to_local(e.starts_at)

  describe "create (S13, S14)" do
    test "a weekly series creates draft occurrences on the right days and times", %{p: p, d: d} do
      {first, count} = create!(p["barMgr"], trivia(d))
      assert count == 8

      occs = occurrences(first["series_id"])
      assert length(occs) == 8
      assert Enum.all?(occs, &(&1.status == "draft"))
      assert Enum.all?(occs, fn e -> Date.day_of_week(elem(local(e), 0)) == 2 end)
      # Every one is at 7 pm local, including those after DST ends on Nov 1.
      assert Enum.all?(occs, fn e -> elem(local(e), 1) == ~T[19:00:00] end)
      assert first["series"]["frequency"] == "weekly"
    end

    test "a monthly series with a far end date is capped at 12 months", %{p: p, d: d} do
      attrs =
        trivia(d, %{
          "title" => "Bingo",
          "starts_at" => "2026-10-19T01:00:00Z",
          "ends_at" => "2026-10-19T03:00:00Z",
          "repeat" => "monthly_weekday",
          "repeat_week_of_month" => 3,
          "repeat_weekday" => 7,
          "repeat_count" => nil,
          "repeat_until" => "2028-12-31"
        })

      # 12 months from Oct 18, 2026 runs through Oct 17, 2027: 13 third Sundays.
      {first, count} = create!(p["barMgr"], attrs)
      assert count == 13

      dates = first["series_id"] |> occurrences() |> Enum.map(&elem(local(&1), 0))
      assert hd(dates) == ~D[2026-10-18]
      assert List.last(dates) == ~D[2027-10-17]
      assert Enum.all?(dates, &(Date.day_of_week(&1) == 7 and &1.day in 15..21))
    end

    test "an all-day series spans local days", %{p: p, d: d} do
      attrs =
        trivia(d, %{
          "all_day" => true,
          "starts_at" => "2026-10-09T06:00:00Z",
          "ends_at" => "2026-10-11T06:00:00Z",
          "repeat_weekdays" => [5],
          "repeat_count" => 4
        })

      {first, 4} = create!(p["barMgr"], attrs)
      occs = occurrences(first["series_id"])
      assert Enum.all?(occs, & &1.all_day)

      assert Enum.all?(occs, fn e ->
               DateTime.diff(e.ends_at, e.starts_at) in [172_800, 176_400]
             end)
    end

    test "invalid rules are refused", %{p: p, d: d} do
      bad = [
        %{"repeat_weekdays" => []},
        %{"repeat_until" => "2026-12-01"},
        %{
          "repeat" => "monthly_weekday",
          "repeat_week_of_month" => 3,
          "repeat_weekday" => 7,
          "repeat_interval" => 2
        },
        %{"repeat" => "monthly_weekday", "repeat_week_of_month" => 5, "repeat_weekday" => 7}
      ]

      for extra <- bad do
        assert status(p["barMgr"], :post, "/api/schedule_events", trivia(d, extra)) == 422,
               inspect(extra)
      end

      assert Repo.aggregate(ScheduleEventSeries, :count) == 0
      assert Repo.aggregate(ScheduleEvent, :count) == 0
    end

    test "series links can't be set from request params", %{p: p, d: d} do
      {other, _} = create!(p["barMgr"], trivia(d))
      attrs = %{trivia(d) | "repeat" => nil} |> Map.put("series_id", other["series_id"])

      {e, 1} = create!(p["barMgr"], attrs)
      assert e["series_id"] == nil
    end
  end

  describe "edit (S15)" do
    test "this event only changes one date and marks it", %{p: p, d: d} do
      {first, _} = create!(p["barMgr"], trivia(d))
      [_, second | _] = occurrences(first["series_id"])

      conn =
        call(p["barMgr"], :patch, "/api/schedule_events/#{second.id}", %{
          "starts_at" => "2026-10-14T02:00:00Z",
          "ends_at" => "2026-10-14T04:00:00Z",
          "scope" => "this"
        })

      assert %{"series_exception" => true} = json_response(conn, 200)["data"]

      times = first["series_id"] |> occurrences() |> Enum.map(&elem(local(&1), 1))
      assert Enum.count(times, &(&1 == ~T[20:00:00])) == 1
      assert Enum.count(times, &(&1 == ~T[19:00:00])) == 7
    end

    test "this and following renames later dates and overwrites changed ones", %{p: p, d: d} do
      {first, _} = create!(p["barMgr"], trivia(d))
      occs = occurrences(first["series_id"])
      third = Enum.at(occs, 2)
      fifth = Enum.at(occs, 4)

      call(p["barMgr"], :patch, "/api/schedule_events/#{fifth.id}", %{
        "title" => "Special",
        "scope" => "this"
      })

      conn =
        call(p["barMgr"], :patch, "/api/schedule_events/#{third.id}", %{
          "title" => "Trivia (new host)",
          "scope" => "following"
        })

      assert json_response(conn, 200)

      titles = first["series_id"] |> occurrences() |> Enum.map(& &1.title)
      assert Enum.take(titles, 2) == ["Trivia night", "Trivia night"]
      assert Enum.drop(titles, 2) |> Enum.uniq() == ["Trivia (new host)"]
      refute Repo.get!(ScheduleEvent, fifth.id).series_exception
    end

    test "this and following moves the time and keeps each date's status", %{p: p, d: d} do
      {first, _} = create!(p["barMgr"], trivia(d))
      occs = occurrences(first["series_id"])
      Scheduling.publish_event(Enum.at(occs, 5))

      call(p["barMgr"], :patch, "/api/schedule_events/#{Enum.at(occs, 3).id}", %{
        "starts_at" => "2026-10-28T02:00:00Z",
        "ends_at" => "2026-10-28T04:00:00Z",
        "scope" => "following"
      })

      after_ = occurrences(first["series_id"])

      assert Enum.take(after_, 3) |> Enum.map(&elem(local(&1), 1)) |> Enum.uniq() == [
               ~T[19:00:00]
             ]

      # 8 pm local on every later date, before and after DST ends.
      assert Enum.drop(after_, 3) |> Enum.map(&elem(local(&1), 1)) |> Enum.uniq() == [
               ~T[20:00:00]
             ]

      assert Enum.at(after_, 5).status == "published"
    end

    test "changing the rule with this and following splits the series", %{p: p, d: d} do
      {first, _} = create!(p["barMgr"], trivia(d))
      old_id = first["series_id"]
      fifth = Enum.at(occurrences(old_id), 4)

      conn =
        call(p["barMgr"], :patch, "/api/schedule_events/#{fifth.id}", %{
          "starts_at" => "2026-11-06T02:00:00Z",
          "ends_at" => "2026-11-06T04:00:00Z",
          "repeat" => "weekly",
          "repeat_weekdays" => [4],
          "repeat_count" => 3,
          "scope" => "following"
        })

      new_id = json_response(conn, 200)["data"]["series_id"]
      assert new_id != old_id

      assert length(occurrences(old_id)) == 4
      assert Repo.get!(ScheduleEventSeries, old_id).until_date == ~D[2026-11-02]

      new_dates = new_id |> occurrences() |> Enum.map(&elem(local(&1), 0))
      assert new_dates == [~D[2026-11-05], ~D[2026-11-12], ~D[2026-11-19]]
    end
  end

  describe "delete (S16)" do
    test "this event only removes one date", %{p: p, d: d} do
      {first, _} = create!(p["barMgr"], trivia(d))
      second = Enum.at(occurrences(first["series_id"]), 1)

      assert status(p["barMgr"], :delete, "/api/schedule_events/#{second.id}?scope=this") == 200
      assert length(occurrences(first["series_id"])) == 7
    end

    test "this and following removes later dates and ends the series", %{p: p, d: d} do
      {first, _} = create!(p["barMgr"], trivia(d))
      third = Enum.at(occurrences(first["series_id"]), 2)

      assert status(p["barMgr"], :delete, "/api/schedule_events/#{third.id}?scope=following") ==
               200

      assert length(occurrences(first["series_id"])) == 2
      assert Repo.get!(ScheduleEventSeries, first["series_id"]).until_date == ~D[2026-10-19]
    end

    test "deleting from the first date removes the whole series", %{p: p, d: d} do
      {first, _} = create!(p["barMgr"], trivia(d))

      assert status(p["barMgr"], :delete, "/api/schedule_events/#{first["id"]}?scope=following") ==
               200

      refute Repo.get(ScheduleEventSeries, first["series_id"])
      assert Repo.aggregate(ScheduleEvent, :count) == 0
    end
  end

  describe "extend (S17)" do
    test "adds drafts past the old horizon, idempotently, and skips deleted dates", %{p: p, d: d} do
      # Tue Oct 6, 2026 through Tue Oct 5, 2027: 53 Tuesdays.
      {first, 53} = create!(p["barMgr"], trivia(d, %{"repeat_count" => nil}))
      series = Repo.get!(ScheduleEventSeries, first["series_id"])
      assert series.generated_through == ~D[2027-10-05]

      one = Enum.at(occurrences(series.id), 10)
      Scheduling.delete_event(one, "this")
      series = Repo.get!(ScheduleEventSeries, series.id)

      assert {:ok, added} = Scheduling.extend_series(series, ~D[2027-03-01])
      assert added == 21
      series = Repo.get!(ScheduleEventSeries, series.id)
      assert {:ok, 0} = Scheduling.extend_series(series, ~D[2027-03-01])

      dates = series.id |> occurrences() |> Enum.map(&elem(local(&1), 0))
      assert length(dates) == 52 + 21
      assert Enum.all?(dates, &(Date.day_of_week(&1) == 2))
      refute elem(local(one), 0) in dates
    end

    test "only the department's managers can extend (S18)", %{p: p, d: d} do
      {first, _} = create!(p["barMgr"], trivia(d))
      path = "/api/schedule_event_series/#{first["series_id"]}/extend"

      assert status(p["breweryMgr"], :post, path) == 403
      assert status(p["bartender1"], :post, path) == 403
      assert status(p["barMgr"], :post, path) == 200
    end
  end

  describe "other personas (S18)" do
    test "can't change a taproom series; employees see published dates only", %{p: p, d: d} do
      {first, _} = create!(p["barMgr"], trivia(d))
      [a, b | _] = occurrences(first["series_id"])
      Scheduling.publish_event(a)

      assert status(p["breweryMgr"], :patch, "/api/schedule_events/#{a.id}", %{
               "title" => "x",
               "scope" => "following"
             }) == 403

      assert status(p["bartender1"], :delete, "/api/schedule_events/#{a.id}?scope=following") ==
               403

      assert status(p["bartender1"], :get, "/api/schedule_events/#{a.id}") == 200
      assert status(p["bartender1"], :get, "/api/schedule_events/#{b.id}") == 404
    end
  end

  test "no series operation creates a notification", %{p: p, d: d} do
    before = Repo.aggregate(Notification, :count)

    {first, _} = create!(p["barMgr"], trivia(d))
    [a, b, c | _] = occurrences(first["series_id"])

    call(p["barMgr"], :patch, "/api/schedule_events/#{b.id}", %{
      "title" => "x",
      "scope" => "following"
    })

    call(p["barMgr"], :post, "/api/schedule_events/publish", %{"ids" => [a.id, b.id]})
    call(p["barMgr"], :post, "/api/schedule_event_series/#{first["series_id"]}/extend")
    call(p["barMgr"], :delete, "/api/schedule_events/#{c.id}?scope=following")

    assert Repo.aggregate(Notification, :count) == before
  end
end
