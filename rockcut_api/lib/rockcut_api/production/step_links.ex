defmodule RockcutApi.Production.StepLinks do
  @moduledoc """
  D50 §2.7: links on an existing batch's steps, as the template editor has
  them. A link `from` → `to` means `to` comes after `from`; its default
  answer is what the move prompt preselects. The rules are the templates'
  (`StepGraph.insert_link!/4`): no loop (`:link_cycle`), "comes after" never
  on a later day (`:link_order`), no duplicate (`:link_exists`), and only
  within the step's batch or its split's tree (`:link_other_batch`). A
  standalone CIP has no links (`:not_found`).

  The controller runs these under `Production.Undo`.
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.Repo
  alias RockcutApi.Brewing.Batch
  alias RockcutApi.Production.{Batches, Step, StepGraph, StepLink}

  @doc """
  Link `step` with one other step of its tree: `comes_after_id` (that step
  leads to this one) or `leads_to_id` (this one leads to that), with
  `answer` (default `move_all`). `{:ok, %{batch_ids}}` or an error.
  """
  def add(%Step{batch_id: nil}, _attrs), do: {:error, :not_found}

  def add(%Step{} = step, attrs) do
    attrs = Map.new(attrs, fn {k, v} -> {to_string(k), v} end)

    Repo.transaction(fn ->
      ids = tree_ids(step.batch_id)
      graph = StepGraph.tree(ids)
      step = StepGraph.entry!(graph, step.id)
      answer = present(attrs["answer"]) || "move_all"

      {from, to} =
        case {present(attrs["comes_after_id"]), present(attrs["leads_to_id"])} do
          {id, nil} when id != nil -> {other!(graph, ids, id), step}
          {nil, id} when id != nil -> {step, other!(graph, ids, id)}
          _ -> Repo.rollback(:link_pick)
        end

      StepGraph.insert_link!(graph, from, to, answer)
      %{batch_ids: Enum.uniq([from.batch_id, to.batch_id])}
    end)
  end

  @doc "A batch link by id (nil otherwise)."
  def get(id) do
    case Batches.to_int(id) do
      nil -> nil
      id -> Repo.get(StepLink, id)
    end
  end

  @doc "The steps a link joins (Undo's scope)."
  def step_ids(%StepLink{} = link), do: [link.from_step_id, link.to_step_id]

  @doc "Change `default_answer`. `{:ok, %{batch_ids}}`."
  def update(%StepLink{} = link, attrs) do
    case link |> StepLink.answer_changeset(attrs) |> Repo.update() do
      {:ok, link} -> {:ok, %{batch_ids: batch_ids(link)}}
      error -> error
    end
  end

  @doc "Remove a link (Remove in the step dialog). `{:ok, %{batch_ids}}`."
  def remove(%StepLink{} = link) do
    ids = batch_ids(link)
    Repo.delete!(link)
    {:ok, %{batch_ids: ids}}
  end

  # The other step, which must be in this step's tree: another batch's step
  # is a readable refusal, an id that isn't a step 404.
  defp other!(graph, ids, id) do
    case Batches.to_int(id) && Repo.get(Step, Batches.to_int(id)) do
      %Step{batch_id: batch_id} = other when not is_nil(batch_id) ->
        if batch_id in ids,
          do: StepGraph.entry!(graph, other.id),
          else: Repo.rollback(:link_other_batch)

      %Step{} ->
        Repo.rollback(:link_other_batch)

      nil ->
        Repo.rollback(:not_found)
    end
  end

  # The batch and, when it's part of a split, its parent and every part.
  defp tree_ids(batch_id) do
    root = Repo.get!(Batch, batch_id)
    root_id = root.split_parent_id || root.id

    [root_id | Repo.all(from(b in Batch, where: b.split_parent_id == ^root_id, select: b.id))]
  end

  defp batch_ids(%StepLink{} = link) do
    Repo.all(
      from(s in Step,
        where: s.id in ^step_ids(link) and not is_nil(s.batch_id),
        select: s.batch_id,
        distinct: true
      )
    )
  end

  defp present(v) when v in [nil, ""], do: nil
  defp present(v), do: v
end
