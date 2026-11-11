defmodule RockcutApi.IdeaBoards.People do
  @moduledoc """
  D53 Part 2 §4.1: who can be on an Idea Board card, and what happens when
  someone can't any more. The only writer of `idea_card_assignees`.

  **Who:** `Authz.can_take_idea_card?/2`: an active member of the board's
  department (owners count; the picker offers them only on an
  `owners_only` board, D59, as on the task boards), or any active person on the Company board. Only the people being
  added are checked, so someone who has since left doesn't block an
  unrelated edit. At most `Tasks.Assignees.max_people/0`, as tasks.

  **Leaving** (`drop_if_ineligible/2`, called beside
  `Tasks.unassign_if_ineligible/2` in `Accounts`' user and membership
  transactions): on each board the person can no longer open they come off
  every card and lose their watches (and anything pending for them there).
  Deactivation clears every board. Their notes stay, under their name.
  """
  import Ecto.Query, only: [from: 2]

  alias Ecto.Changeset
  alias RockcutApi.{Accounts, Authz, Repo}
  alias RockcutApi.Accounts.{Membership, User}
  alias RockcutApi.IdeaBoards
  alias RockcutApi.IdeaBoards.{Card, CardAssignee, Log, Watch, WatchPending}
  alias RockcutApi.Tasks.Assignees

  @named 5

  @doc "The picker: who can be put on a card on this board, by name, as `%{id, name}`."
  def pickable(:company) do
    Repo.all(
      from u in Accounts.persons_query(),
        where: u.active == true,
        order_by: [asc: u.name, asc: u.id],
        select: %{id: u.id, name: u.name}
    )
  end

  def pickable({:department, dept}) do
    members =
      Repo.all(
        from u in Accounts.persons_query(),
          join: m in Membership,
          on: m.user_id == u.id and m.department_id == ^dept.id,
          where: u.active == true,
          distinct: true,
          select: %{id: u.id, name: u.name}
      )

    # D59: an owners-only board offers every active owner too.
    (members ++ Assignees.pickable_owners(dept))
    |> Enum.uniq_by(& &1.id)
    |> Enum.sort_by(&{&1.name, &1.id})
  end

  @doc "A card's people, first first."
  def ids(%Card{id: id}) do
    Repo.all(
      from a in CardAssignee,
        where: a.card_id == ^id,
        order_by: [asc: a.position],
        select: a.user_id
    )
  end

  @doc """
  What `attrs` ask for (`assignee_ids`, as `Tasks.Assignees.given/1`
  parses it): the new list when it's different people from `current`, else
  nil.
  """
  def changed(attrs, current) do
    case Assignees.given(Map.take(attrs, ["assignee_ids"])) do
      ids when is_list(ids) -> if Enum.sort(ids) != Enum.sort(current), do: ids
      _ -> nil
    end
  end

  @doc """
  Check the people `attrs` would add to `current` on `board`; each one who
  can't be on a card there is an error under `assignee_ids` that names them.
  """
  def validate(changeset, board, attrs, current \\ []) do
    case Assignees.given(Map.take(attrs, ["assignee_ids"])) do
      nil ->
        changeset

      :invalid ->
        Changeset.add_error(changeset, :assignee_ids, "is invalid")

      :too_many ->
        Changeset.add_error(
          changeset,
          :assignee_ids,
          "A card can have at most #{Assignees.max_people()} people"
        )

      ids ->
        (ids -- current)
        |> Enum.map(&Accounts.get_user/1)
        |> Enum.reject(&(&1 && Authz.can_take_idea_card?(&1, board)))
        |> refusals(board)
        |> Enum.reduce(changeset, &Changeset.add_error(&2, :assignee_ids, &1))
    end
  end

  defp refusals(users, board) do
    {named, others} = Enum.split(users, @named)
    where = IdeaBoards.board_name(board)

    Enum.map(named, fn user ->
      who = if user, do: user.name, else: "That person"

      if board == :company,
        do: "#{who} can't be assigned",
        else: "#{who} must be a #{where} member"
    end) ++ if(others == [], do: [], else: ["#{length(others)} more can't be assigned"])
  end

  @doc "Give the card this list of people, first first."
  def put!(%Card{id: card_id}, ids) do
    now = Log.now()
    Repo.delete_all(from a in CardAssignee, where: a.card_id == ^card_id)

    Repo.insert_all(
      CardAssignee,
      for(
        {user_id, position} <- Enum.with_index(ids),
        do: %{card_id: card_id, user_id: user_id, position: position, inserted_at: now}
      )
    )

    :ok
  end

  @doc """
  Take `user_id` off the cards, and drop their watches, on every board they
  can no longer open. Each card they came off is logged on its board, with
  reason `deactivated` or `left_<key>`.
  """
  def drop_if_ineligible(user_id, %User{} = actor) do
    user = Accounts.get_user!(user_id)
    reason = fn key -> if user.active, do: "left_#{key}", else: "deactivated" end

    for board <- IdeaBoards.all_boards(), not Authz.can_take_idea_card?(user, board) do
      key = IdeaBoards.board_key(board)

      Repo.all(
        from c in Card,
          join: l in assoc(c, :list),
          join: a in assoc(c, :assignee_links),
          where: a.user_id == ^user_id and l.board == ^key
      )
      |> Enum.each(fn card ->
        before = ids(card)
        put!(card, before -- [user_id])

        Log.log!(key, "card_unassigned", actor, card, %{
          "from" => before,
          "to" => before -- [user_id],
          "reason" => reason.(key)
        })
      end)

      on_board = from(c in Card, join: l in assoc(c, :list), where: l.board == ^key, select: c.id)

      Repo.delete_all(
        from w in Watch, where: w.user_id == ^user_id and w.card_id in subquery(on_board)
      )

      Repo.delete_all(
        from p in WatchPending,
          where: p.watcher_id == ^user_id and p.card_id in subquery(on_board)
      )
    end

    :ok
  end
end
