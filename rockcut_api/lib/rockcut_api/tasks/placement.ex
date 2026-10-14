defmodule RockcutApi.Tasks.Placement do
  @moduledoc """
  D38 §7 rule 2: the one function that decides which cards show on a day. Pure
  (no Repo): it takes tasks and returns cards. Nothing else filters on
  `due_on`.

  | Task | Cards |
  |---|---|
  | open, `due_on` = D | one on D |
  | open, no `due_on` | one on Future |
  | done, `planned_day` | one on `due_on`, in place |
  | done, `completed_day` | one on `completed_on`, tagged with its planned day |
  | done, `both` | one in place on `due_on` (tagged done), one on `completed_on`; both locked |
  | done from Future | one on `completed_on`, tagged "from Future" |

  A card on the day a task was finished, away from its planned day, is
  `locked` (it can't be dragged), and so are both copies of a `both` task
  (S8b: "Neither copy can be dragged"). A task finished on its own day gets one card
  in place, whatever its `completed_display`.

  Each card is a map:

    * `key`: `{task_id, day}` or `{task_id, :future}`, unique on the board;
    * `day`: the `Date` it shows on, or `:future`;
    * `task`: the `Task`;
    * `planned_on`: the planned day, when the card shows elsewhere ("planned Mon 10/12");
    * `done_on`: the finished day, on the in-place copy of a `both` task ("done Wed 10/14");
    * `from_future`: finished from the Future list;
    * `locked`: can't be dragged;
    * `overdue`: open and planned before today (the amber edge).
  """

  alias RockcutApi.Tasks.Task

  @doc """
  The cards for `days` (any enumerable of dates) and the Future list, as
  `%{date => [card], :future => [card]}`. Every day in `days` has a key, empty
  or not. A day lists its own tasks by `position`, then the tasks finished
  there from other days (and from Future) by `completed_at`. The Future list
  is by `position`.
  """
  def cards(tasks, days, %Date{} = today) do
    in_range = MapSet.new(days)
    empty = Map.new([:future | Enum.to_list(days)], &{&1, []})

    tasks
    |> Enum.flat_map(&cards_for(&1, today))
    |> Enum.filter(&(&1.day == :future or MapSet.member?(in_range, &1.day)))
    |> Enum.group_by(& &1.day)
    |> Map.new(fn {day, cards} -> {day, Enum.sort_by(cards, &sort_key/1)} end)
    |> then(&Map.merge(empty, &1))
  end

  @doc """
  The Unfinished card: open tasks planned before `today`, oldest day first,
  then by `position`. Future tasks and done tasks are never on it.
  """
  def unfinished(tasks, %Date{} = today) do
    tasks
    |> Enum.filter(&(not Task.done?(&1) and overdue?(&1, today)))
    |> Enum.sort_by(&{Date.to_gregorian_days(&1.due_on), &1.position, &1.id})
  end

  ## Cards for one task

  defp cards_for(%Task{completed_at: nil, due_on: nil} = t, _today),
    do: [card(t, :future)]

  defp cards_for(%Task{completed_at: nil} = t, today),
    do: [card(t, t.due_on, overdue: overdue?(t, today))]

  defp cards_for(%Task{due_on: nil} = t, _today),
    do: [card(t, t.completed_on, from_future: true, locked: true)]

  defp cards_for(%Task{due_on: same, completed_on: same} = t, _today),
    do: [card(t, t.due_on)]

  defp cards_for(%Task{completed_display: "completed_day"} = t, _today),
    do: [finished_day_card(t)]

  defp cards_for(%Task{completed_display: "both"} = t, _today),
    do: [card(t, t.due_on, done_on: t.completed_on, locked: true), finished_day_card(t)]

  # planned_day, and anything unexpected: in place on the planned day.
  defp cards_for(%Task{} = t, _today), do: [card(t, t.due_on)]

  defp finished_day_card(t), do: card(t, t.completed_on, planned_on: t.due_on, locked: true)

  defp card(%Task{} = t, day, opts \\ []) do
    %{
      key: {t.id, day},
      day: day,
      task: t,
      planned_on: Keyword.get(opts, :planned_on),
      done_on: Keyword.get(opts, :done_on),
      from_future: Keyword.get(opts, :from_future, false),
      locked: Keyword.get(opts, :locked, false),
      overdue: Keyword.get(opts, :overdue, false)
    }
  end

  defp overdue?(%Task{due_on: nil}, _today), do: false
  defp overdue?(%Task{due_on: d}, today), do: Date.compare(d, today) == :lt

  # A day's own tasks (group 0) by position, then the ones finished there from
  # elsewhere (group 1) by when they were finished.
  defp sort_key(%{day: :future, task: t}), do: {0, t.position, 0, t.id}
  defp sort_key(%{day: day, task: %Task{due_on: day} = t}), do: {0, t.position, 0, t.id}

  defp sort_key(%{task: t}),
    do: {1, 0, DateTime.to_unix(t.completed_at), t.id}
end
