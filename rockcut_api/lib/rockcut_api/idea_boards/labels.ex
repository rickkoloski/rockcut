defmodule RockcutApi.IdeaBoards.Labels do
  @moduledoc """
  D53 Part 2: a board's labels (decision 16). Anyone on the board adds one
  (`:write`); renaming, recoloring and deleting are `:manage` (callers
  authorize). Names are unique on a board ignoring case. Deleting a label
  takes it off every card, locked ones included.
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.Repo
  alias RockcutApi.Accounts.User
  alias RockcutApi.IdeaBoards
  alias RockcutApi.IdeaBoards.{Label, Log}

  @doc "A label on this board, else `{:error, :not_found}`."
  def fetch(board, id) do
    key = IdeaBoards.board_key(board)

    case Log.to_id(id) && Repo.get_by(Label, id: Log.to_id(id), board: key) do
      %Label{} = label -> {:ok, label}
      _ -> {:error, :not_found}
    end
  end

  @doc "Add a label at the end."
  def create(board, attrs, %User{} = actor) do
    key = IdeaBoards.board_key(board)

    Repo.transaction(fn ->
      position =
        (Repo.one(from l in Label, where: l.board == ^key, select: max(l.position)) || 0) + 1

      case Repo.insert(Label.changeset(%Label{board: key, position: position}, attrs)) do
        {:ok, label} ->
          Log.log!(key, "label_created", actor, nil, label_detail(label))
          label

        {:error, cs} ->
          Repo.rollback(cs)
      end
    end)
  end

  @doc "Rename or recolor a label."
  def update(%Label{} = label, attrs, %User{} = actor) do
    Repo.transaction(fn ->
      case Repo.update(Label.changeset(label, attrs)) do
        {:ok, updated} ->
          if {updated.name, updated.color} != {label.name, label.color} do
            Log.log!(label.board, "label_updated", actor, nil, %{
              "label_id" => label.id,
              "from" => %{"name" => label.name, "color" => label.color},
              "to" => %{"name" => updated.name, "color" => updated.color}
            })
          end

          updated

        {:error, cs} ->
          Repo.rollback(cs)
      end
    end)
  end

  @doc "Delete a label; it comes off every card (`cards` in History: how many)."
  def delete(%Label{} = label, %User{} = actor) do
    Repo.transaction(fn ->
      cards =
        Repo.aggregate(from(cl in "idea_card_labels", where: cl.label_id == ^label.id), :count)

      Log.log!(
        label.board,
        "label_deleted",
        actor,
        nil,
        Map.put(label_detail(label), "cards", cards)
      )

      Repo.delete!(label)
      :deleted
    end)
  end

  defp label_detail(label),
    do: %{"label_id" => label.id, "name" => label.name, "color" => label.color}
end
