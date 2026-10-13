defmodule RockcutApiWeb.BreweryTaskSeriesControllerTest do
  @moduledoc """
  D39: recurring tasks through the API: `repeat*` on create, `scope` and
  `changed` on edit and delete, `GET …/series`, `POST …/stop_repeating`, the
  422 codes, and who may use them.
  """
  use RockcutApiWeb.ConnCase, async: false

  import Ecto.Query, only: [from: 2]
  import RockcutApi.PersonaFixtures
  import Phoenix.ConnTest

  alias RockcutApi.{BreweryTasks, Repo}
  alias RockcutApi.BreweryTasks.{Task, TaskSeries}

  setup do
    p = personas(~w(owner breweryMgr brewer1 bartender1))
    {_device, token} = taproom_device()
    %{p: p, token: token, today: BreweryTasks.today()}
  end

  # Weekly on today's weekday, from today: 53 occurrences.
  defp weekly!(user, today, attrs \\ %{}) do
    call(
      user,
      :post,
      "/api/brewery/tasks",
      Map.merge(
        %{
          title: "Keg Wash",
          due_on: Date.to_iso8601(today),
          repeat: "weekly",
          repeat_weekdays: [Date.day_of_week(today)]
        },
        attrs
      )
    )
    |> json_response(201)
    |> Map.get("data")
  end

  defp week(%{"series_id" => id}, today, n),
    do: Repo.get_by!(Task, series_id: id, series_date: Date.add(today, 7 * n))

  defp path(%Task{id: id}), do: "/api/brewery/tasks/#{id}"
  defp path(%{"id" => id}), do: "/api/brewery/tasks/#{id}"

  defp count(series_id),
    do: Repo.aggregate(from(t in Task, where: t.series_id == ^series_id), :count)

  describe "who may use the recurring routes" do
    test "Brewery members and owners", %{p: p, today: today} do
      for key <- ~w(brewer1 breweryMgr owner) do
        user = p[key]
        first = weekly!(user, today, %{title: "Keg Wash #{key}"})
        assert first["series_id"]
        assert first["series_date"] == Date.to_iso8601(today)
        assert first["series_exception"] == false

        assert %{"frequency" => "weekly", "later_open" => 52, "later_changed" => 0} =
                 call(user, :get, path(first) <> "/series")
                 |> json_response(200)
                 |> Map.get("data")

        assert %{"title" => "Just one", "series_exception" => true} =
                 call(user, :patch, path(week(first, today, 1)), %{
                   title: "Just one",
                   scope: "this"
                 })
                 |> json_response(200)
                 |> Map.get("data")

        assert call(user, :patch, path(week(first, today, 2)) <> "?scope=following", %{
                 notes: "From here"
               }).status == 200

        assert week(first, today, 9).notes == "From here"

        assert call(user, :delete, path(week(first, today, 3)) <> "?scope=this").status == 204
        assert call(user, :post, path(week(first, today, 4)) <> "/stop_repeating").status == 200
        assert count(first["series_id"]) == 4, key
      end
    end

    test "a Taproom-only person and a shared device get 403", %{p: p, token: token, today: today} do
      first = weekly!(p["owner"], today)
      iso = Date.to_iso8601(today)

      routes = [
        {:post, "/api/brewery/tasks",
         %{title: "Nope", due_on: iso, repeat: "weekly", repeat_weekdays: [1]}},
        {:get, path(first) <> "/series", %{}},
        {:post, path(first) <> "/stop_repeating", %{}},
        {:patch, path(first), %{title: "Nope", scope: "following"}},
        {:delete, path(first), %{scope: "following"}}
      ]

      for {verb, route, params} <- routes do
        assert call(p["bartender1"], verb, route, params).status == 403, "#{verb} #{route}"

        conn = call_device(token, verb, route, params)
        assert conn.status == 403, "device #{verb} #{route}"
        assert json_response(conn, 403)["error"] == "Not available on a shared device"
      end

      assert count(first["series_id"]) == 53
    end
  end

  describe "errors" do
    test "repeat_needs_day", %{p: p} do
      assert %{"error" => "repeat_needs_day", "message" => "Pick a day to repeat"} =
               call(p["brewer1"], :post, "/api/brewery/tasks", %{
                 title: "Keg Wash",
                 repeat: "weekly",
                 repeat_weekdays: [3]
               })
               |> json_response(422)
    end

    test "PATCH with repeat makes a one-off repeat; a Future one needs a day; a finished one is refused",
         %{p: p, today: today} do
      user = p["brewer1"]
      iso = Date.to_iso8601(today)
      repeat = %{repeat: "weekly", repeat_weekdays: [Date.day_of_week(today)]}

      one_off =
        call(user, :post, "/api/brewery/tasks", %{title: "Keg Wash", due_on: iso})
        |> json_response(201)
        |> Map.get("data")

      assert %{"series_id" => id, "series_date" => ^iso} =
               call(user, :patch, path(one_off), repeat) |> json_response(200) |> Map.get("data")

      assert count(id) == 53

      future =
        call(user, :post, "/api/brewery/tasks", %{title: "Hoses"})
        |> json_response(201)
        |> Map.get("data")

      assert %{"error" => "repeat_needs_day"} =
               call(user, :patch, path(future), repeat) |> json_response(422)

      done =
        call(user, :post, "/api/brewery/tasks", %{title: "Done", due_on: iso})
        |> json_response(201)
        |> Map.get("data")

      call(user, :post, "#{path(done)}/complete", %{}) |> json_response(200)

      assert %{"error" => "repeat_finished", "message" => "A finished task can't repeat"} =
               call(user, :patch, path(done), repeat) |> json_response(422)
    end

    test "scope_required on an occurrence's edit or delete without a scope", %{
      p: p,
      today: today
    } do
      user = p["brewer1"]
      first = weekly!(user, today)

      assert %{"error" => "scope_required"} =
               call(user, :patch, path(first), %{title: "X"}) |> json_response(422)

      assert %{"error" => "scope_required"} =
               call(user, :delete, path(first)) |> json_response(422)

      # A day change alone is always just this one.
      tomorrow = Date.to_iso8601(Date.add(today, 1))

      assert %{"due_on" => ^tomorrow, "series_exception" => true} =
               call(user, :patch, path(first), %{due_on: tomorrow})
               |> json_response(200)
               |> Map.get("data")
    end

    test "not_in_series for a one-off's series and stop", %{p: p, today: today} do
      user = p["brewer1"]

      one_off =
        call(user, :post, "/api/brewery/tasks", %{title: "Once", due_on: Date.to_iso8601(today)})
        |> json_response(201)
        |> Map.get("data")

      assert one_off["series_id"] == nil

      for {verb, suffix} <- [{:get, "/series"}, {:post, "/stop_repeating"}] do
        assert %{"error" => "not_in_series", "message" => "That task doesn't repeat"} =
                 call(user, verb, path(one_off) <> suffix) |> json_response(422)
      end

      assert call(user, :get, "/api/brewery/tasks/999999/series").status == 404
    end

    test "rule errors are 422 with their field", %{p: p, today: today} do
      user = p["brewer1"]
      iso = Date.to_iso8601(today)

      assert %{"errors" => %{"weekdays" => [_]}} =
               call(user, :post, "/api/brewery/tasks", %{
                 title: "K",
                 due_on: iso,
                 repeat: "weekly"
               })
               |> json_response(422)

      assert %{"errors" => %{"count" => [_]}} =
               call(user, :post, "/api/brewery/tasks", %{
                 title: "K",
                 due_on: iso,
                 repeat: "annually",
                 repeat_count: 401
               })
               |> json_response(422)

      first = weekly!(user, today)

      assert %{"errors" => %{"repeat" => ["to end the repeats, use Stop repeating"]}} =
               call(user, :patch, path(first), %{repeat: "never", scope: "following"})
               |> json_response(422)
    end
  end

  test "/series counts and stop with changed=remove", %{p: p, today: today} do
    user = p["brewer1"]
    first = weekly!(user, today)
    moved = week(first, today, 6)

    assert call(user, :post, path(moved) <> "/move", %{
             due_on: Date.to_iso8601(Date.add(moved.due_on, 1))
           }).status ==
             200

    w1 = week(first, today, 1)

    assert %{"later_open" => 50, "later_changed" => 1, "start_date" => start} =
             call(user, :get, path(w1) <> "/series") |> json_response(200) |> Map.get("data")

    assert start == Date.to_iso8601(today)

    assert %{"id" => id} =
             call(user, :post, path(w1) <> "/stop_repeating", %{changed: "remove"})
             |> json_response(200)
             |> Map.get("data")

    assert id == w1.id
    assert count(first["series_id"]) == 2
    assert Repo.get!(TaskSeries, first["series_id"]).until_date == w1.series_date
  end

  test "delete following with changed=keep keeps a moved one", %{p: p, today: today} do
    user = p["brewer1"]
    first = weekly!(user, today)
    moved = week(first, today, 6)

    call(user, :post, path(moved) <> "/move", %{
      due_on: Date.to_iso8601(Date.add(moved.due_on, 1))
    })

    assert call(user, :delete, path(week(first, today, 2)), %{scope: "following", changed: "keep"}).status ==
             204

    assert count(first["series_id"]) == 3
    assert Repo.get(Task, moved.id)
  end

  test "a rule change with following, through the API", %{p: p, today: today} do
    user = p["brewer1"]
    first = weekly!(user, today)
    w2 = week(first, today, 2)

    assert %{"series_id" => new_id} =
             call(user, :patch, path(w2), %{
               scope: "following",
               repeat: "annually"
             })
             |> json_response(200)
             |> Map.get("data")

    assert new_id != first["series_id"]
    assert count(first["series_id"]) == 2
    assert count(new_id) == 1
  end

  test "the board JSON carries series_id, series_date and series_exception", %{
    p: p,
    today: today
  } do
    user = p["brewer1"]
    first = weekly!(user, today)
    iso = Date.to_iso8601(today)

    data =
      call(user, :get, "/api/brewery/tasks", %{
        from: iso,
        to: Date.to_iso8601(Date.add(today, 30))
      })
      |> json_response(200)
      |> Map.get("data")

    cards = Enum.flat_map(data["days"], & &1["cards"])
    keg = Enum.filter(cards, &(&1["title"] == "Keg Wash"))
    assert length(keg) == 5
    assert Enum.all?(keg, &(&1["series_id"] == first["series_id"]))
    assert hd(keg)["series_date"] == iso
    assert Enum.all?(keg, &(&1["series_exception"] == false))
  end
end
