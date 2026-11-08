defmodule RockcutApi.IdeaBoards.Watchers do
  @moduledoc """
  D53 Part 2 §4.6: Watch notifications, batched.

  **Ledger.** `pending!/4` runs inside every card write's transaction (from
  `Log.log!/5`): each person watching the card, except whoever made the
  change, gets one `idea_watch_pending` row for it. Moves within a list and
  checklist reorders aren't History, so they're never here either (lead
  decisions 2, item 3).

  **Flush.** `flush/1` runs on the `Reminders.Scheduler` tick (every 5
  minutes). A card's window opens with its oldest pending row and closes
  10 minutes later; on the first tick after that, each watcher gets one
  `idea_card_changed` notification naming every change in it ("Casey
  changed Taproom remodel" / "moved to Doing, 2 notes"), and the rows go.
  So a notification arrives 10–15 minutes after the first change. A watcher
  who has since lost the board, been deactivated or stopped watching gets
  nothing (unwatching and leaving also delete their rows).
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Accounts, Authz, Notifications, Repo}
  alias RockcutApi.Accounts.User
  alias RockcutApi.IdeaBoards
  alias RockcutApi.IdeaBoards.{Card, Watch, WatchPending}

  @window_seconds 600

  # The History actions on a card that its watchers hear about.
  @actions ~w(card_edited card_moved card_locked card_unlocked card_archived card_restored
              card_unassigned card_sent checklist_added checklist_edited checklist_ticked
              checklist_unticked checklist_removed note_added note_edited note_deleted)

  def window_seconds, do: @window_seconds

  @doc "Record `action` on `card` by `actor` for each of the card's other watchers."
  def pending!(%Card{id: card_id}, action, %User{id: actor_id}, detail) when action in @actions do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    rows =
      Repo.all(
        from w in Watch,
          where: w.card_id == ^card_id and w.user_id != ^actor_id,
          select: w.user_id
      )
      |> Enum.map(fn watcher_id ->
        %{
          card_id: card_id,
          watcher_id: watcher_id,
          actor_id: actor_id,
          change: action,
          detail: summary_detail(action, detail),
          inserted_at: now
        }
      end)

    if rows != [], do: Repo.insert_all(WatchPending, rows)
    :ok
  end

  def pending!(_card, _action, _actor, _detail), do: :ok

  # Only what the notification's wording needs.
  defp summary_detail("card_moved", detail),
    do: %{"to_list" => get_in(detail, ["to_list", "name"])}

  defp summary_detail("card_edited", detail), do: %{"fields" => Map.keys(detail["fields"] || %{})}
  defp summary_detail("card_sent", detail), do: Map.take(detail, ["department", "count"])
  defp summary_detail(_action, _detail), do: %{}

  @doc """
  Send what's due at `now`: for every card whose oldest pending row is at
  least #{@window_seconds} seconds old, one notification per watcher, then
  delete the rows it covered. Returns the number of notifications sent.
  """
  def flush(%DateTime{} = now \\ DateTime.utc_now()) do
    cutoff = DateTime.add(now, -@window_seconds, :second)

    Repo.all(
      from p in WatchPending,
        group_by: p.card_id,
        having: min(p.inserted_at) <= ^cutoff,
        select: p.card_id
    )
    |> Enum.map(&flush_card/1)
    |> Enum.sum()
  end

  defp flush_card(card_id) do
    rows =
      Repo.all(
        from p in WatchPending, where: p.card_id == ^card_id, order_by: p.id, preload: [:actor]
      )

    card = Repo.get!(Card, card_id) |> Repo.preload(:list)
    board = IdeaBoards.board_for_key(card.list.board)

    sent =
      rows
      |> Enum.group_by(& &1.watcher_id)
      |> Enum.count(fn {watcher_id, changes} ->
        watcher = Accounts.get_user(watcher_id)

        if watcher && board && still_watching?(watcher, card) &&
             Authz.can?(watcher, :read, {:idea_board, board}) do
          Notifications.idea_card_changed(watcher, payload(card, changes))
          true
        end
      end)

    ids = Enum.map(rows, & &1.id)
    Repo.delete_all(from p in WatchPending, where: p.id in ^ids)
    sent
  end

  defp still_watching?(%User{id: user_id}, %Card{id: card_id}),
    do: Repo.exists?(from w in Watch, where: w.card_id == ^card_id and w.user_id == ^user_id)

  @doc """
  The notification for `changes` (pending rows, oldest first, actors
  preloaded) to `card`: who changed it in the title, what changed in the
  body, and the card's URL.
  """
  def payload(%Card{} = card, changes) do
    %{
      title: "#{actors(changes)} changed #{card.title}",
      body: changes |> phrases() |> Enum.join(", "),
      data: %{
        "url" => "/boards/#{card.list.board}/cards/#{card.id}",
        "board" => card.list.board,
        "card_id" => card.id
      }
    }
  end

  defp actors(changes) do
    names =
      changes
      |> Enum.map(&first_name(&1.actor))
      |> Enum.uniq()

    case names do
      [one] -> one
      [a, b] -> "#{a} and #{b}"
      [a | rest] -> "#{a} and #{length(rest)} others"
    end
  end

  defp first_name(nil), do: "Someone"

  defp first_name(%User{name: name}),
    do: name |> to_string() |> String.split() |> List.first() || "Someone"

  # One phrase per kind of change, in the order they first happened; counted
  # where there can be several ("2 notes"), the latest where only it matters
  # ("moved to Doing").
  defp phrases(changes) do
    changes
    |> Enum.flat_map(&kinds/1)
    |> Enum.reduce({[], %{}}, fn {kind, value}, {order, acc} ->
      order = if Map.has_key?(acc, kind), do: order, else: order ++ [kind]
      {order, Map.update(acc, kind, [value], &(&1 ++ [value]))}
    end)
    |> then(fn {order, acc} -> Enum.map(order, &phrase(&1, acc[&1])) end)
  end

  # An edit's fields, in the card dialog's order.
  @field_kinds [
    {"title", :title},
    {"description", :description},
    {"due_on", :due_on},
    {"assignee_ids", :people},
    {"label_ids", :labels}
  ]

  defp kinds(%WatchPending{change: "card_edited", detail: detail}) do
    fields = detail["fields"] || []
    for {field, kind} <- @field_kinds, field in fields, do: {kind, true}
  end

  defp kinds(%WatchPending{change: "card_moved", detail: detail}),
    do: [{:moved, detail["to_list"]}]

  defp kinds(%WatchPending{change: "card_unassigned"}), do: [{:people, true}]

  defp kinds(%WatchPending{change: "card_sent", detail: detail}),
    do: [{:sent, detail["department"]}]

  defp kinds(%WatchPending{change: change}), do: [{String.to_existing_atom(change), true}]

  defp phrase(:title, _), do: "renamed"
  defp phrase(:description, _), do: "description"
  defp phrase(:due_on, _), do: "due date"
  defp phrase(:people, _), do: "people"
  defp phrase(:labels, _), do: "labels"
  defp phrase(:moved, lists), do: "moved to #{List.last(lists)}"
  defp phrase(:sent, [dept | _]), do: "sent to the #{dept} task list"
  defp phrase(:card_locked, _), do: "locked"
  defp phrase(:card_unlocked, _), do: "unlocked"
  defp phrase(:card_archived, _), do: "archived"
  defp phrase(:card_restored, _), do: "restored"
  defp phrase(:checklist_added, n), do: counted(n, "checklist item", "added")
  defp phrase(:checklist_ticked, n), do: "ticked " <> counted(n, "item")
  defp phrase(:checklist_unticked, n), do: "unticked " <> counted(n, "item")
  defp phrase(:checklist_removed, n), do: counted(n, "checklist item", "removed")
  defp phrase(:checklist_edited, _), do: "checklist"
  defp phrase(:note_added, n), do: counted(n, "note")
  defp phrase(:note_edited, n), do: "edited " <> counted(n, "note")
  defp phrase(:note_deleted, n), do: "removed " <> counted(n, "note")

  defp counted(list, noun),
    do: if(length(list) == 1, do: "1 #{noun}", else: "#{length(list)} #{noun}s")

  defp counted(list, noun, verb), do: counted(list, noun) <> " " <> verb
end
