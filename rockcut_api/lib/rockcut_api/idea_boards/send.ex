defmodule RockcutApi.IdeaBoards.Send do
  @moduledoc """
  D53 Part 2 §4.7: Send to task list. A card becomes one task, or one task
  per open checklist item, on a department's task board, in one
  transaction with an `idea_card_tasks` row per task, the card's History
  (`card_sent`, which its watchers hear about) and the card's "Then" (stay,
  move to a list, archive).

  Every task goes through `Tasks.create/4` (and so `Tasks.Assignees` and,
  for a repeat, `Tasks.Series`): there's no second writer of tasks. Callers
  authorize first: `:change` on the card (a locked card is a manager's to
  send), `:write` on the target task board, and `:change` on a "Then" list.

  **Params** (string keys), each with the dialog's default when absent:

    * `checklist`: `notes` (one task; the checklist goes in its notes) or
      `per_item` (one task per open item). Default `notes`.
    * `due_on`: a date, or `nil`/`""` for Future. Absent: the card's due
      date, or Today when that's past, or Future when it has none.
    * `assignee_ids`: absent → the card's people who can take a task on that
      board; the others are "left off".
    * The task dialog's `repeat*` params: one-task mode only, else 422
      `repeat_per_item`.
    * `then`: `stay` (default), `move` (with `then_list_id`) or `archive`.
  """
  alias RockcutApi.{Accounts, Authz, Repo, Tasks}
  alias RockcutApi.Accounts.{Department, User}
  alias RockcutApi.IdeaBoards
  alias RockcutApi.IdeaBoards.{Card, CardTask, Cards, ChecklistItem, IdeaList, Log, People}
  alias RockcutApi.Tasks.{Series, Task}

  import Ecto.Query, only: [from: 2]

  @cut_suffix "… see the card on the board"
  @repeat_keys ~w(repeat repeat_interval repeat_weekdays repeat_month_rule repeat_day_of_month
                  repeat_week_of_month repeat_weekday repeat_until repeat_count)

  @doc """
  Send `card` (on `board`, with its list) to `dept`'s task board as
  `actor`. `then_list` is the list for `then: "move"` (looked up and
  authorized by the caller), else nil. Returns `{:ok, [task]}`.
  """
  def send(
        board,
        %Card{} = card,
        %Department{} = dept,
        params,
        then_list,
        %User{} = actor,
        today \\ Tasks.today()
      ) do
    items = checklist(card)
    mode = params["checklist"] || "notes"

    with :ok <- check_mode(mode, items, params),
         {:ok, then} <- then_step(params["then"], then_list) do
      base = %{
        "due_on" => due_on(params, card, today),
        "assignee_ids" => assignee_ids(params, card, dept)
      }

      specs =
        case mode do
          "notes" ->
            [
              base
              |> Map.merge(%{"title" => card.title, "notes" => notes(card.description, items)})
              |> Map.merge(Map.take(params, @repeat_keys))
            ]

          "per_item" ->
            for item <- items, is_nil(item.done_at), do: Map.put(base, "title", item.text)
        end

      Repo.transaction(
        fn ->
          tasks = Enum.map(specs, &create_task!(dept, &1, actor, today))
          Enum.each(tasks, &link!(card, &1, dept))

          Log.log!(IdeaBoards.board_key(board), "card_sent", actor, card, %{
            "department" => dept.name,
            "department_key" => dept.key,
            "count" => length(tasks),
            "task_ids" => Enum.map(tasks, & &1.id),
            "checklist" => mode,
            "repeat" => Enum.any?(tasks, &(not is_nil(&1.series_id)))
          })

          do_then!(board, card, then, actor)
          tasks
        end,
        mode: :immediate
      )
    end
  end

  defp check_mode("notes", _items, _params), do: :ok

  defp check_mode("per_item", items, params) do
    cond do
      Series.repeat?(params) -> {:error, :repeat_per_item}
      not Enum.any?(items, &is_nil(&1.done_at)) -> {:error, :no_open_items}
      true -> :ok
    end
  end

  defp check_mode(_mode, _items, _params), do: {:error, :invalid_checklist_mode}

  defp then_step(then, _list) when then in [nil, "", "stay"], do: {:ok, :stay}
  defp then_step("archive", _list), do: {:ok, :archive}
  defp then_step("move", %IdeaList{archived_at: nil} = list), do: {:ok, {:move, list}}
  defp then_step("move", %IdeaList{}), do: {:error, :archived}
  defp then_step(_then, _list), do: {:error, :invalid_then}

  defp do_then!(_board, _card, :stay, _actor), do: :ok

  defp do_then!(board, card, :archive, actor),
    do: ok_or_rollback(Cards.archive(board, Repo.get!(Card, card.id), actor))

  defp do_then!(board, card, {:move, list}, actor),
    do: ok_or_rollback(Cards.move(board, Repo.get!(Card, card.id), list, nil, actor))

  defp create_task!(dept, attrs, actor, today) do
    case Tasks.create(dept, attrs, actor, today) do
      {:ok, %Task{} = task} -> task
      {:error, reason} -> Repo.rollback(reason)
    end
  end

  defp link!(card, %Task{} = task, dept) do
    Repo.insert!(%CardTask{
      card_id: card.id,
      card_title: card.title,
      task_id: task.id,
      task_series_id: task.series_id,
      department_id: dept.id,
      task_title: task.title
    })
  end

  defp ok_or_rollback({:ok, value}), do: value
  defp ok_or_rollback({:error, reason}), do: Repo.rollback(reason)

  # The day: given (nil or "" = Future), else the card's due date with a
  # past one moved to today.
  defp due_on(params, card, today) do
    case Map.fetch(params, "due_on") do
      {:ok, value} when value in [nil, ""] -> nil
      {:ok, value} -> value
      :error -> default_day(card.due_on, today)
    end
  end

  @doc "The dialog's Day default: the card's due date, Today when it's past, else Future (nil)."
  def default_day(nil, _today), do: nil

  def default_day(%Date{} = due, today),
    do: if(Date.compare(due, today) == :lt, do: today, else: due)

  defp assignee_ids(%{"assignee_ids" => ids}, _card, _dept), do: ids
  defp assignee_ids(_params, card, dept), do: default_assignees(card, dept).on

  @doc """
  The dialog's Assignees default for `dept`: `on`, the card's people who can
  take a task there (in order), and `left_off`, the others ("not in
  Taproom, left off"), as `%{id, name}`.
  """
  def default_assignees(%Card{} = card, %Department{} = dept) do
    people = card |> People.ids() |> Enum.map(&Accounts.get_user/1) |> Enum.reject(&is_nil/1)
    {on, off} = Enum.split_with(people, &Authz.can_take_task?(&1, dept))
    %{on: Enum.map(on, & &1.id), left_off: Enum.map(off, &%{id: &1.id, name: &1.name})}
  end

  defp checklist(%Card{id: id}) do
    Repo.all(
      from i in ChecklistItem, where: i.card_id == ^id, order_by: [asc: i.position, asc: i.id]
    )
  end

  @doc """
  One task's notes (§4.7): the description, then the checklist as `☐ item`
  / `☑ item` lines, at most #{Task.max_notes()} characters. Too long: the
  description is cut with "#{@cut_suffix}" so the checklist survives; the
  checklist is cut only when it alone doesn't fit (whole lines, then the
  same suffix).
  """
  def notes(description, items) do
    max = Task.max_notes()
    description = if description, do: String.trim(description), else: ""

    lines =
      Enum.map(items, fn item ->
        if item.done_at, do: "☑ " <> item.text, else: "☐ " <> item.text
      end)

    checklist = Enum.join(lines, "\n")

    whole =
      [description, checklist] |> Enum.reject(&(&1 == "")) |> Enum.join("\n\n")

    cond do
      String.length(whole) <= max ->
        blank_to_nil(whole)

      checklist == "" ->
        cut(description, max)

      true ->
        room = max - String.length("\n\n" <> checklist) - String.length(@cut_suffix)

        if description != "" and room > 0 do
          String.trim_trailing(String.slice(description, 0, room)) <>
            @cut_suffix <> "\n\n" <> checklist
        else
          cut_lines(lines, max)
        end
    end
  end

  defp cut(text, max),
    do:
      String.trim_trailing(String.slice(text, 0, max - String.length(@cut_suffix))) <> @cut_suffix

  # As many whole lines as fit with the suffix on its own line after them.
  defp cut_lines(lines, max) do
    budget = max - String.length("\n" <> @cut_suffix)

    {kept, _} =
      Enum.reduce_while(lines, {[], 0}, fn line, {acc, used} ->
        add = String.length(line) + if(acc == [], do: 0, else: 1)

        if used + add <= budget,
          do: {:cont, {[line | acc], used + add}},
          else: {:halt, {acc, used}}
      end)

    (Enum.reverse(kept) ++ [@cut_suffix]) |> Enum.join("\n")
  end

  defp blank_to_nil(""), do: nil
  defp blank_to_nil(s), do: s
end
