defmodule RockcutApi.Production.StepGraph do
  @moduledoc """
  D48 lead decision 2: the link logic templates (D46) and batches share, so
  there is one copy of it. A graph is a template's entries
  (`template_steps` / `template_links`, dated by `day_offset`) or a batch's
  steps (`production_steps` / `production_step_links`, dated by `due_on`).

  - `insert_link!/4`: a new link, refused if it closes a loop
    (`:link_cycle`), runs backwards in time (`:link_order`) or exists
    (`:link_exists`).
  - `slot_in!/4`: link new entries into a chain after `comes_after_id` and
    before `leads_to_id`; with both, the direct link between them goes.
  - `pass_through!/2`: delete an entry; each step it followed now leads to
    each step that followed it (`move_all` only when both links were).

  All of them run inside a transaction and roll it back on a refusal.
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.Repo
  alias RockcutApi.Production.{Step, StepLink, TemplateLink, TemplateStep}

  @answers ~w(move_all move_only)

  defstruct [:step, :link, :owner, :owner_id, :day]

  @doc "A template's entries and links."
  def template(template_id),
    do: %__MODULE__{
      step: TemplateStep,
      link: TemplateLink,
      owner: :template_id,
      owner_id: template_id,
      day: :day_offset
    }

  @doc "A batch's steps and links."
  def batch(batch_id),
    do: %__MODULE__{
      step: Step,
      link: StepLink,
      owner: :batch_id,
      owner_id: batch_id,
      day: :due_on
    }

  @doc "One of the graph's entries by id (`:not_found` otherwise)."
  def entry!(%__MODULE__{} = g, id) do
    case to_int(id) do
      nil ->
        Repo.rollback(:not_found)

      id ->
        Repo.one(from(s in g.step, where: s.id == ^id and field(s, ^g.owner) == ^g.owner_id)) ||
          Repo.rollback(:not_found)
    end
  end

  @doc """
  Link `from` → `to` with `answer` (`move_all` / `move_only`). `:link_cycle`
  if `from` can already be reached from `to`, `:link_order` if `to` is
  earlier than `from`, `:link_exists` for a duplicate.
  """
  def insert_link!(%__MODULE__{} = g, from, to, answer) do
    cond do
      from.id == to.id or reachable?(g, to.id, from.id) -> Repo.rollback(:link_cycle)
      earlier?(Map.fetch!(to, g.day), Map.fetch!(from, g.day)) -> Repo.rollback(:link_order)
      link_between(g, from.id, to.id) -> Repo.rollback(:link_exists)
      true -> :ok
    end

    g.link
    |> struct(Map.merge(link_owner(g), %{from_step_id: from.id, to_step_id: to.id}))
    |> Ecto.Changeset.cast(%{"default_answer" => answer}, [:default_answer])
    |> Ecto.Changeset.validate_required([:default_answer])
    |> Ecto.Changeset.validate_inclusion(:default_answer, @answers)
    |> Repo.insert()
    |> case do
      {:ok, link} -> link
      {:error, cs} -> Repo.rollback(cs)
    end
  end

  @doc """
  Link the new entries `first` … `last` into their chain (`attrs`):
  `comes_after_id` (with `comes_after_answer`) into `first`, `leads_to_id`
  (with `leads_to_answer`) out of `last`. With both, the direct link between
  them goes: the new entries slot in.
  """
  def slot_in!(%__MODULE__{} = g, first, last, attrs) do
    after_step = present(attrs["comes_after_id"]) && entry!(g, attrs["comes_after_id"])
    lead_step = present(attrs["leads_to_id"]) && entry!(g, attrs["leads_to_id"])

    if after_step && lead_step do
      case link_between(g, after_step.id, lead_step.id) do
        nil -> :ok
        direct -> Repo.delete!(direct)
      end
    end

    if after_step,
      do: insert_link!(g, after_step, first, attrs["comes_after_answer"] || "move_all")

    if lead_step, do: insert_link!(g, last, lead_step, attrs["leads_to_answer"] || "move_all")
    :ok
  end

  @doc """
  Delete `entry`, passing its links through: each step it followed now
  leads to each step that followed it, `move_all` only when both links
  were (no duplicate, no self-link).
  """
  def pass_through!(%__MODULE__{} = g, entry) do
    into = Repo.all(from(l in g.link, where: l.to_step_id == ^entry.id))
    out = Repo.all(from(l in g.link, where: l.from_step_id == ^entry.id))

    for a <- into, b <- out, a.from_step_id != b.to_step_id do
      answer =
        if a.default_answer == "move_all" and b.default_answer == "move_all",
          do: "move_all",
          else: "move_only"

      unless link_between(g, a.from_step_id, b.to_step_id) do
        g.link
        |> struct(
          Map.merge(link_owner(g), %{
            from_step_id: a.from_step_id,
            to_step_id: b.to_step_id,
            default_answer: answer
          })
        )
        |> Repo.insert!()
      end
    end

    Repo.delete!(entry)
  end

  @doc "The link `from_id` → `to_id`, or nil."
  def link_between(%__MODULE__{} = g, from_id, to_id) do
    Repo.one(from(l in g.link, where: l.from_step_id == ^from_id and l.to_step_id == ^to_id))
  end

  @doc "Whether `target` can be reached from `start` along the graph's links."
  def reachable?(%__MODULE__{} = g, start, target) do
    ids = from(s in g.step, where: field(s, ^g.owner) == ^g.owner_id, select: s.id)

    edges =
      Repo.all(
        from(l in g.link,
          where: l.from_step_id in subquery(ids),
          select: {l.from_step_id, l.to_step_id}
        )
      )
      |> Enum.group_by(&elem(&1, 0), &elem(&1, 1))

    walk([start], MapSet.new(), edges, target)
  end

  defp walk([], _seen, _edges, _target), do: false
  defp walk([target | _], _seen, _edges, target), do: true

  defp walk([id | rest], seen, edges, target) do
    if MapSet.member?(seen, id),
      do: walk(rest, seen, edges, target),
      else: walk(Map.get(edges, id, []) ++ rest, MapSet.put(seen, id), edges, target)
  end

  defp link_owner(%__MODULE__{link: TemplateLink, owner_id: tid}), do: %{template_id: tid}
  defp link_owner(%__MODULE__{}), do: %{}

  defp earlier?(%Date{} = a, %Date{} = b), do: Date.compare(a, b) == :lt
  defp earlier?(a, b) when is_integer(a) and is_integer(b), do: a < b

  defp present(v) when v in [nil, ""], do: nil
  defp present(v), do: v

  defp to_int(i) when is_integer(i), do: i

  defp to_int(s) when is_binary(s) do
    case Integer.parse(s) do
      {i, ""} -> i
      _ -> nil
    end
  end

  defp to_int(_), do: nil
end
