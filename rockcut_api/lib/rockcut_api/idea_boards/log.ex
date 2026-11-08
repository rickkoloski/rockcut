defmodule RockcutApi.IdeaBoards.Log do
  @moduledoc """
  D53 Part 2: what every Idea Board write shares. `log!/4` appends one
  History row (`idea_events`); writes call it inside their transaction.
  `place/3` and `renumber!/2` keep `position` dense (1, 2, 3, …).
  """
  alias RockcutApi.Repo
  alias RockcutApi.Accounts.User
  alias RockcutApi.IdeaBoards.{Card, Event, IdeaList, Watchers}

  import Ecto.Query, only: [from: 2]

  @doc """
  Log `action` on `board_key`. `subject` is a card (its id, list and title
  are copied) or a list (its id and name), or `nil` for a board-wide change
  such as a label's.
  """
  def log!(board_key, action, %User{id: actor_id} = actor, subject, detail \\ %{}) do
    {card_id, list_id, title} = subject_fields(subject)

    # D53 §4.6: the card's watchers hear about it (Watchers decides which actions).
    if is_struct(subject, Card), do: Watchers.pending!(subject, action, actor, detail)

    Repo.insert!(%Event{
      board: board_key,
      action: action,
      actor_id: actor_id,
      card_id: card_id,
      list_id: list_id,
      title: title,
      detail: detail
    })
  end

  defp subject_fields(%Card{id: id, list_id: list_id, title: title}), do: {id, list_id, title}
  defp subject_fields(%IdeaList{id: id, name: name}), do: {nil, id, name}
  defp subject_fields(nil), do: {nil, nil, nil}

  @doc """
  `ids` with `id` taken out and put back ahead of `before_id`, or last when
  `before_id` is nil or not in `ids`.
  """
  def place(ids, id, before_id) do
    rest = List.delete(ids, id)

    case before_id && Enum.find_index(rest, &(&1 == before_id)) do
      nil -> rest ++ [id]
      index -> List.insert_at(rest, index, id)
    end
  end

  @doc "Give `schema` rows `ids` the positions 1, 2, 3, … in that order."
  def renumber!(schema, ids) do
    ids
    |> Enum.with_index(1)
    |> Enum.each(fn {id, position} ->
      Repo.update_all(from(r in schema, where: r.id == ^id and r.position != ^position),
        set: [position: position]
      )
    end)
  end

  @doc "Parse an id param; nil when it isn't one (`RockcutApi.Ids`)."
  defdelegate to_id(id), to: RockcutApi.Ids, as: :parse

  @doc """
  Trim a text change; `nil` stays `nil` (`cast` makes a blank string `nil`,
  and `validate_required` then says "can't be blank": fix cycle 1, gap 6).
  """
  def trim(nil), do: nil
  def trim(text) when is_binary(text), do: String.trim(text)

  def now, do: DateTime.utc_now() |> DateTime.truncate(:second)
end
