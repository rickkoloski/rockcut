defmodule RockcutApi.Production.Step do
  @moduledoc """
  D47 §3.5: one step of a scheduled batch, copied from its template entry
  (`template_step_id`), or a standalone CIP & Sanitize (no batch, a
  `tank_id`). A phase marker has no type. A typed step's name always comes
  from its type (renaming a type renames every batch's step); `name` is only
  for a custom step (D48: no type, a name, no phase). `due_on` is the day it's planned for, or the day
  it was done (checking off on another day moves it there).
  """
  use Ecto.Schema
  import Ecto.Changeset

  alias RockcutApi.Production.TemplateStep

  schema "production_steps" do
    field :name, :string
    field :vessel_index, :integer, default: 0
    field :detail, :string
    field :temperature, :integer
    field :split_method, :string
    field :package_partial, :boolean, default: false
    field :notes, :string
    field :on_task_list, :boolean, default: true
    field :position, :integer, default: 0
    field :due_on, :date
    field :done_on, :date
    field :completed_at, :utc_datetime
    field :added, :boolean, default: false
    # D48: the Set temp steps of one ramp share it (copied from the template).
    field :ramp_group, :string

    belongs_to :batch, RockcutApi.Brewing.Batch
    belongs_to :tank, RockcutApi.Production.Tank
    belongs_to :step_type, RockcutApi.Production.StepType
    belongs_to :phase, RockcutApi.Production.Phase
    belongs_to :done_by, RockcutApi.Accounts.User
    belongs_to :assignee, RockcutApi.Accounts.User
    belongs_to :template_step, RockcutApi.Production.TemplateStep

    timestamps(type: :utc_datetime)
  end

  @doc "A phase marker: no type and no name of its own (a custom step has a name; D48)."
  def marker?(%__MODULE__{step_type_id: nil, name: nil}), do: true
  def marker?(%__MODULE__{}), do: false

  @doc """
  What the step dialog edits: the addition to the name, the temperature (Set
  temp), Full / Partial (a Package; `Steps` checks it's unfinished), notes,
  the task-list switch and the assignee (`Steps` checks Brewery membership).
  """
  def edit_changeset(step, attrs) do
    step
    |> cast(attrs, [:detail, :temperature, :package_partial, :notes, :on_task_list, :assignee_id])
    |> update_change(:detail, &blank_to_nil/1)
    |> update_change(:notes, &blank_to_nil/1)
    |> validate_length(:detail, max: 40)
    |> validate_length(:notes, max: 2_000)
    |> validate_number(:temperature,
      greater_than_or_equal_to: TemplateStep.temperatures().first,
      less_than_or_equal_to: TemplateStep.temperatures().last,
      message: "Enter #{TemplateStep.temperatures().first}–#{TemplateStep.temperatures().last}°F."
    )
  end

  defp blank_to_nil(nil), do: nil

  defp blank_to_nil(s) when is_binary(s) do
    case String.trim(s) do
      "" -> nil
      t -> t
    end
  end
end
