defmodule RockcutApi.IdeaBoards do
  @moduledoc """
  Idea Boards (D53 Part 2): one board per assignable department plus the
  Company board, each with lists of cards (spec §4).

  **The board.** A board is `{:department, %Department{}}` or `:company`
  (`RockcutApiWeb.Plugs.IdeaBoard` resolves it from the path); rows store
  its key (`board_key/1`): the department's key or `"company"`. Every
  function that reads or writes a board takes it first, and lookups by id
  match the board too, so an id from another board is not found.

  Callers authorize first (`Authz.can?(person, :read, {:idea_board, board})`
  and friends). The context validates data only.

  **Order.** Lists by `position` within a board, cards by `position` within a
  list, both dense (1, 2, 3, …). Archived lists and cards keep their rows and
  leave the board until they're restored.
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Accounts, Authz, Repo}
  alias RockcutApi.Accounts.{Department, User}

  alias RockcutApi.IdeaBoards.{
    Card,
    CardTask,
    ChecklistItem,
    Event,
    IdeaList,
    Label,
    Note,
    Watch
  }

  @company "company"
  @history_page_size 50

  @doc "The key a board's rows carry: the department's key, or `company`."
  def board_key(:company), do: @company
  def board_key({:department, %Department{key: key}}), do: key

  @doc """
  The board for `key`: an assignable department's key, or `company`. `nil`
  for anything else (`other`, unknown keys).
  """
  def board_for_key(@company), do: :company

  def board_for_key(key) when is_binary(key) do
    case Accounts.get_department_by_key(key) do
      %Department{assignable: true} = dept -> {:department, dept}
      _ -> nil
    end
  end

  def board_for_key(_), do: nil

  @doc """
  The boards `user` can open, departments in department order (by id) then
  Company, each `%{key, name, color, manage, history}`: `manage` is locking,
  changing locked things and deleting archived ones (§4.2), `history` the
  change log. Owners get all five, `noDept` the Company board, a shared
  tablet its home board and Company.
  """
  def boards_for(%User{} = user) do
    for board <- all_boards(),
        Authz.can?(user, :read, {:idea_board, board}) do
      %{
        key: board_key(board),
        name: board_name(board),
        color: board_color(board),
        manage: Authz.can?(user, :manage, {:idea_board, board}),
        history: Authz.can?(user, :history, {:idea_board, board})
      }
    end
  end

  @doc "Every board: the assignable departments' in department order (by id), then Company."
  def all_boards do
    departments =
      Accounts.list_departments()
      |> Enum.filter(& &1.assignable)
      |> Enum.sort_by(& &1.id)
      |> Enum.map(&{:department, &1})

    departments ++ [:company]
  end

  def board_name(:company), do: "Company"
  def board_name({:department, %Department{name: name}}), do: name

  defp board_color(:company), do: nil
  defp board_color({:department, %Department{color: color}}), do: color

  ## Reads

  @doc """
  The board's read model for `viewer`: its lists that aren't archived, in
  order, each with its cards that aren't archived, in order, and the board's
  labels. Each card has what its face shows (labels, assignees, checklist
  counts, note count, lock, sent tasks) and `watching` (the viewer's Watch).
  """
  def board(board, %User{} = viewer) do
    key = board_key(board)

    lists =
      Repo.all(
        from l in IdeaList,
          where: l.board == ^key and is_nil(l.archived_at),
          order_by: [asc: l.position, asc: l.id],
          preload: [:locked_by]
      )

    cards =
      Repo.all(
        from c in Card,
          where: c.list_id in ^Enum.map(lists, & &1.id) and is_nil(c.archived_at),
          order_by: [asc: c.position, asc: c.id]
      )
      |> preload_faces(viewer)
      |> Enum.group_by(& &1.list_id)

    %{
      lists: Enum.map(lists, &Map.put(&1, :cards, Map.get(cards, &1.id, []))),
      labels: labels(board)
    }
  end

  @doc "The board's labels, in order."
  def labels(board) do
    key = board_key(board)
    Repo.all(from l in Label, where: l.board == ^key, order_by: [asc: l.position, asc: l.id])
  end

  @doc """
  One card on this board, archived or not, with everything the card dialog
  shows: its list, labels, assignees, checklist (with who ticked), notes
  (newest first, with authors), sent tasks, lock and `watching` for
  `viewer`. `{:error, :not_found}` for an id from another board.
  """
  def get_card(board, id, %User{} = viewer) do
    case fetch_card(board, id) do
      {:ok, card} ->
        card =
          card
          |> Repo.preload([
            :created_by,
            :locked_by,
            list: :locked_by,
            checklist_items: :done_by,
            notes: :author
          ])

        [card] = preload_faces([card], viewer)
        {:ok, card}

      error ->
        error
    end
  end

  @doc """
  Lead decision 2: an archived card, or any card in an archived list, is
  read-only until it's restored (list preloaded).
  """
  def archived?(%Card{archived_at: at, list: %IdeaList{archived_at: list_at}}),
    do: not is_nil(at) or not is_nil(list_at)

  @doc "A card on this board, with its list. `{:error, :not_found}` otherwise."
  def fetch_card(board, id) do
    key = board_key(board)

    with {id, ""} <- Integer.parse(to_string(id)),
         %Card{} = card <-
           Repo.one(
             from c in Card,
               join: l in assoc(c, :list),
               where: c.id == ^id and l.board == ^key,
               preload: [list: l]
           ) do
      {:ok, card}
    else
      _ -> {:error, :not_found}
    end
  end

  @doc """
  What "Archived" shows: the board's archived lists (newest first, each
  with its card count) and its archived cards whose list isn't archived
  (newest first, each with its list).
  """
  def archived(board) do
    key = board_key(board)

    lists =
      Repo.all(
        from l in IdeaList,
          where: l.board == ^key and not is_nil(l.archived_at),
          left_join: c in assoc(l, :cards),
          group_by: l.id,
          order_by: [desc: l.archived_at, desc: l.id],
          select: {l, count(c.id)}
      )
      |> Enum.map(fn {list, count} -> Map.put(list, :card_count, count) end)

    cards =
      Repo.all(
        from c in Card,
          join: l in assoc(c, :list),
          where: l.board == ^key and is_nil(l.archived_at) and not is_nil(c.archived_at),
          order_by: [desc: c.archived_at, desc: c.id],
          preload: [list: l]
      )

    %{lists: lists, cards: cards}
  end

  ## Send to task list (§4.7)

  @doc """
  The task boards `user` may send a card on `board` to: its own
  department's (for a department board), or every department whose task
  board they can write on (Company). In department order.
  """
  def send_departments({:department, dept}, %User{} = user),
    do: if(Authz.can?(user, :write, {:tasks, dept}), do: [dept], else: [])

  def send_departments(:company, %User{} = user) do
    for {:department, dept} <- all_boards(), Authz.can?(user, :write, {:tasks, dept}), do: dept
  end

  @doc """
  "From the <board> board" for task JSON (§4.7): `%{task_id => %{title,
  board_name, board, card_id, link}}` for the tasks in `tasks` (maps or structs with `id` and
  `series_id`) that came from a card, directly or as an occurrence of a
  sent series. `link` is false when the card was deleted for good or
  `viewer` can't open its board; the title is still there.
  """
  def from_idea([], _viewer), do: %{}

  def from_idea(tasks, %User{} = viewer) do
    task_ids = Enum.map(tasks, &get(&1, :id))
    series_ids = tasks |> Enum.map(&get(&1, :series_id)) |> Enum.reject(&is_nil/1)

    links =
      Repo.all(
        from ct in CardTask,
          left_join: c in assoc(ct, :card),
          left_join: l in assoc(c, :list),
          where: ct.task_id in ^task_ids or ct.task_series_id in ^series_ids,
          order_by: [desc: ct.id],
          select: {ct, c.title, l.board}
      )

    readable =
      links
      |> Enum.map(fn {_, _, key} -> key end)
      |> Enum.reject(&is_nil/1)
      |> Enum.uniq()
      |> Map.new(fn key ->
        board = board_for_key(key)
        {key, board != nil and Authz.can?(viewer, :read, {:idea_board, board})}
      end)

    Enum.reduce(tasks, %{}, fn task, acc ->
      id = get(task, :id)
      series_id = get(task, :series_id)

      case Enum.find(links, fn {ct, _, _} ->
             ct.task_id == id or (series_id != nil and ct.task_series_id == series_id)
           end) do
        nil ->
          acc

        {ct, title, key} ->
          linked? = ct.card_id != nil and Map.get(readable, key, false)
          card_board = key && board_for_key(key)

          Map.put(acc, id, %{
            title: title || ct.card_title,
            # "From the Taproom board: …" (Matt, 2026-11-08); nil once the
            # card is deleted for good.
            board_name: card_board && board_name(card_board),
            board: if(linked?, do: key),
            card_id: if(linked?, do: ct.card_id),
            link: linked?
          })
      end
    end)
  end

  defp get(%{} = task, key), do: Map.get(task, key)

  ## History

  @doc """
  The board's change log, newest first, #{@history_page_size} per page
  (1-based), optionally for one card, with actors. Returns
  `%{events, page, total, names: %{users}}`: `names` maps the user ids the
  page's `detail`s mention (assignees, a deleted note's author) to their
  current names.
  """
  def list_events(board, card_id \\ nil, page \\ 1) do
    page = max(page, 1)
    key = board_key(board)
    base = from(ev in Event, where: ev.board == ^key)
    base = if card_id, do: from(ev in base, where: ev.card_id == ^card_id), else: base

    events =
      Repo.all(
        from ev in base,
          order_by: [desc: ev.id],
          limit: @history_page_size,
          offset: ^((page - 1) * @history_page_size),
          preload: [:actor]
      )

    user_ids =
      events
      |> Enum.flat_map(&detail_user_ids(&1.detail))
      |> Enum.filter(&is_integer/1)
      |> Enum.uniq()

    %{
      events: events,
      page: page,
      total: Repo.aggregate(base, :count),
      names: %{
        users:
          Repo.all(from u in User, where: u.id in ^user_ids, select: {u.id, u.name}) |> Map.new()
      }
    }
  end

  def history_page_size, do: @history_page_size

  # The people an event names: a new card's `assignee_ids`, an edit's
  # `fields.assignee_ids` from/to, someone taken off (`from`/`to`), a deleted
  # note's `author_id`.
  defp detail_user_ids(detail) do
    edited = get_in(detail, ["fields", "assignee_ids"]) || %{}

    List.wrap(detail["assignee_ids"]) ++
      List.wrap(edited["from"]) ++
      List.wrap(edited["to"]) ++
      List.wrap(detail["from"]) ++ List.wrap(detail["to"]) ++ List.wrap(detail["author_id"])
  end

  ## Card faces

  # What a card's face shows, for many cards at once: labels, assignees, sent
  # tasks (with their task and series), and the virtual counts and
  # `watching`, each by one query.
  defp preload_faces([], _viewer), do: []

  defp preload_faces(cards, %User{} = viewer) do
    ids = Enum.map(cards, & &1.id)

    cards =
      Repo.preload(cards, [
        :labels,
        :locked_by,
        :assignees,
        sent_tasks: [:department, :task, :task_series]
      ])

    checklist =
      Repo.all(
        from i in ChecklistItem,
          where: i.card_id in ^ids,
          group_by: i.card_id,
          select: {i.card_id, {count(i.id), filter(count(i.id), not is_nil(i.done_at))}}
      )
      |> Map.new()

    notes =
      Repo.all(
        from n in Note,
          where: n.card_id in ^ids,
          group_by: n.card_id,
          select: {n.card_id, count(n.id)}
      )
      |> Map.new()

    watched =
      Repo.all(
        from w in Watch, where: w.card_id in ^ids and w.user_id == ^viewer.id, select: w.card_id
      )
      |> MapSet.new()

    Enum.map(cards, fn card ->
      {total, done} = Map.get(checklist, card.id, {0, 0})

      Map.merge(card, %{
        checklist_total: total,
        checklist_done: done,
        note_count: Map.get(notes, card.id, 0),
        watching: MapSet.member?(watched, card.id)
      })
    end)
  end

  @doc """
  A sent task's chip state (§4.7): `removed` once its task (or series) is
  gone, `repeating` for a series still there, `done` once its task is
  checked off, otherwise `on_list`.
  """
  def sent_state(%CardTask{task_series_id: id, task_series: s})
      when not is_nil(id) and not is_nil(s),
      do: "repeating"

  def sent_state(%CardTask{task: %{completed_at: at}}) when not is_nil(at), do: "done"
  def sent_state(%CardTask{task_id: id}) when not is_nil(id), do: "on_list"
  def sent_state(%CardTask{}), do: "removed"
end
