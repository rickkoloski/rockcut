defmodule RockcutApi.BreweryTasks.PlacementTest do
  use ExUnit.Case, async: true

  alias RockcutApi.BreweryTasks.{Placement, Task}

  # Wed 10/14 is today; the board shows Mon 10/12 – Sun 10/18.
  @today ~D[2026-10-14]
  @mon ~D[2026-10-12]
  @tue ~D[2026-10-13]
  @thu ~D[2026-10-15]
  @days Date.range(@mon, ~D[2026-10-18])

  defp task(id, attrs) do
    struct!(%Task{id: id, title: "Task #{id}", position: 0}, attrs)
  end

  defp done(id, attrs) do
    {at, attrs} = Keyword.pop(attrs, :at, ~U[2026-10-14 18:00:00Z])
    task(id, Keyword.merge([completed_at: at, completed_on: @today], attrs))
  end

  defp cards(tasks, days \\ @days), do: Placement.cards(tasks, days, @today)
  defp keys(list), do: Enum.map(list, & &1.key)

  defp all_cards(by_day), do: by_day |> Map.values() |> List.flatten()

  describe "cards/3: the placement table" do
    test "every day in the range has a key, and so does Future" do
      by_day = cards([])
      assert Map.keys(by_day) |> Enum.sort() == Enum.sort([:future | Enum.to_list(@days)])
      assert Enum.all?(Map.values(by_day), &(&1 == []))
    end

    test "open, due_on = D: one card on D" do
      by_day = cards([task(1, due_on: @thu)])

      assert [%{key: {1, @thu}, day: @thu, locked: false} = c] = by_day[@thu]
      assert %{planned_on: nil, done_on: nil, from_future: false, overdue: false} = c
      assert length(all_cards(by_day)) == 1
    end

    test "open on a past day is overdue; on today or later it isn't" do
      by_day = cards([task(1, due_on: @mon), task(2, due_on: @today), task(3, due_on: @thu)])

      assert [%{overdue: true}] = by_day[@mon]
      assert [%{overdue: false}] = by_day[@today]
      assert [%{overdue: false}] = by_day[@thu]
    end

    test "open, no due_on: one card on Future" do
      by_day = cards([task(1, due_on: nil)])

      assert [%{key: {1, :future}, day: :future, locked: false, overdue: false}] =
               by_day[:future]

      assert length(all_cards(by_day)) == 1
    end

    test "done, planned_day: one card in place on due_on" do
      by_day = cards([done(1, due_on: @mon, completed_display: "planned_day")])

      assert [%{key: {1, @mon}, locked: false, planned_on: nil, done_on: nil}] = by_day[@mon]
      assert by_day[@today] == []
      assert length(all_cards(by_day)) == 1
    end

    test "done, completed_day: one card on completed_on, tagged and locked" do
      by_day = cards([done(1, due_on: @mon, completed_display: "completed_day")])

      assert by_day[@mon] == []

      assert [%{key: {1, @today}, planned_on: @mon, done_on: nil, locked: true}] =
               by_day[@today]
    end

    test "done, both: one in place tagged done, one on completed_on locked" do
      by_day = cards([done(1, due_on: @mon, completed_display: "both")])

      assert [%{key: {1, @mon}, done_on: @today, planned_on: nil, locked: false}] =
               by_day[@mon]

      assert [%{key: {1, @today}, planned_on: @mon, done_on: nil, locked: true}] =
               by_day[@today]

      assert all_cards(by_day) |> Enum.count(& &1.locked) == 1
    end

    test "done early (future day), both: the finished-day copy is the locked one" do
      by_day = cards([done(1, due_on: @thu, completed_display: "both")])

      assert [%{locked: false, done_on: @today}] = by_day[@thu]
      assert [%{locked: true, planned_on: @thu}] = by_day[@today]
    end

    test "done from Future: one card on completed_on, tagged from Future, locked" do
      by_day = cards([done(1, due_on: nil, completed_display: "completed_day")])

      assert by_day[:future] == []

      assert [%{key: {1, @today}, from_future: true, planned_on: nil, locked: true}] =
               by_day[@today]
    end

    test "done on its own day: one card in place, whatever the display" do
      for display <- ~w(planned_day completed_day both) do
        by_day = cards([done(1, due_on: @today, completed_display: display)])

        assert [%{key: {1, @today}, locked: false, planned_on: nil, done_on: nil}] =
                 by_day[@today],
               display

        assert length(all_cards(by_day)) == 1
      end
    end

    test "done tasks never show on Future, and are never overdue" do
      by_day = cards([done(1, due_on: @mon, completed_display: "planned_day")])

      assert by_day[:future] == []
      assert [%{overdue: false}] = by_day[@mon]
    end
  end

  describe "cards/3: the range" do
    test "days outside the range get no cards; Future always does" do
      days = Date.range(@today, @thu)

      by_day =
        cards(
          [
            task(1, due_on: @mon),
            task(2, due_on: nil),
            done(3, due_on: @mon, completed_display: "both")
          ],
          days
        )

      refute Map.has_key?(by_day, @mon)
      assert keys(by_day[:future]) == [{2, :future}]
      # Only the finished-day copy of the "both" task is in range.
      assert keys(by_day[@today]) == [{3, @today}]
    end
  end

  describe "cards/3: ordering" do
    test "a day's own tasks by position, then tasks finished there by completed_at" do
      tasks = [
        task(1, due_on: @today, position: 2),
        task(2, due_on: @today, position: 0),
        done(3, due_on: @today, position: 1, completed_display: "planned_day"),
        done(4, due_on: @mon, completed_display: "completed_day", at: ~U[2026-10-14 20:00:00Z]),
        done(5, due_on: nil, completed_display: "completed_day", at: ~U[2026-10-14 15:00:00Z]),
        done(6, due_on: @tue, completed_display: "both", at: ~U[2026-10-14 17:00:00Z])
      ]

      assert keys(cards(tasks)[@today]) == [
               {2, @today},
               {3, @today},
               {1, @today},
               {5, @today},
               {6, @today},
               {4, @today}
             ]
    end

    test "the Future list is by position" do
      tasks = [task(1, due_on: nil, position: 1), task(2, due_on: nil, position: 0)]
      assert keys(cards(tasks)[:future]) == [{2, :future}, {1, :future}]
    end
  end

  describe "unfinished/2" do
    test "open tasks before today, oldest day first, then by position" do
      tasks = [
        task(1, due_on: @tue, position: 0),
        task(2, due_on: @mon, position: 1),
        task(3, due_on: @mon, position: 0),
        task(4, due_on: ~D[2026-09-30], position: 5)
      ]

      assert Placement.unfinished(tasks, @today) |> Enum.map(& &1.id) == [4, 3, 2, 1]
    end

    test "today, later days, Future and done tasks are never on it" do
      tasks = [
        task(1, due_on: @today),
        task(2, due_on: @thu),
        task(3, due_on: nil),
        done(4, due_on: @mon, completed_display: "planned_day"),
        done(5, due_on: @mon, completed_display: "both"),
        task(6, due_on: @mon)
      ]

      assert Placement.unfinished(tasks, @today) |> Enum.map(& &1.id) == [6]
    end
  end
end
