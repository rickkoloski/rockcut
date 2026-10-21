defmodule RockcutApi.Production.TemplateStep do
  @moduledoc """
  D46 §3.4: one entry of a template: a step (`step_type_id`) or a phase
  marker (no type, `phase_id` required). `day_offset` counts days after the
  end of the first brew day; `vessel_index` 0 is the first tank, 1 the tank
  after the first Transfer/Filter, and so on. `temperature` is °F, for Set
  temp (required) and Brew day (the starting temperature, optional).
  `split_method` is how a Split's parts leave, `transfer` or `filter` (D47,
  Split only); `package_partial` marks a Package that takes only some of the
  beer, so it isn't the tank's exit (D47, Package only).
  """
  use Ecto.Schema
  import Ecto.Changeset

  @max_detail 40
  @max_notes 2_000
  @temperatures 28..80
  @split_methods ~w(transfer filter)

  schema "template_steps" do
    field :day_offset, :integer, default: 0
    field :vessel_index, :integer, default: 0
    field :detail, :string
    field :temperature, :integer
    field :split_method, :string
    field :package_partial, :boolean, default: false
    field :notes, :string
    field :on_task_list, :boolean, default: true
    field :position, :integer, default: 0
    field :ramp_group, :string

    belongs_to :template, RockcutApi.Production.Template
    belongs_to :step_type, RockcutApi.Production.StepType
    belongs_to :phase, RockcutApi.Production.Phase

    timestamps(type: :utc_datetime)
  end

  def temperatures, do: @temperatures
  def split_methods, do: @split_methods

  @doc "The fields a brewer edits; `Production` sets the type, template and position."
  def changeset(step, attrs) do
    step
    |> cast(attrs, [
      :phase_id,
      :day_offset,
      :vessel_index,
      :detail,
      :temperature,
      :split_method,
      :package_partial,
      :notes,
      :on_task_list
    ])
    |> update_change(:detail, &blank_to_nil/1)
    |> update_change(:notes, &blank_to_nil/1)
    |> validate_required([:day_offset], message: "Pick a day.")
    |> validate_required([:vessel_index])
    |> validate_number(:day_offset, greater_than_or_equal_to: 0, less_than_or_equal_to: 365)
    |> validate_number(:vessel_index, greater_than_or_equal_to: 0, less_than_or_equal_to: 9)
    |> validate_length(:detail, max: @max_detail)
    |> validate_length(:notes, max: @max_notes)
    |> validate_number(:temperature,
      greater_than_or_equal_to: @temperatures.first,
      less_than_or_equal_to: @temperatures.last,
      message: "Enter #{@temperatures.first}–#{@temperatures.last}°F."
    )
    |> validate_inclusion(:split_method, @split_methods, message: "Pick Transfer or Filter.")
  end

  defp blank_to_nil(nil), do: nil

  defp blank_to_nil(s) when is_binary(s) do
    case String.trim(s) do
      "" -> nil
      t -> t
    end
  end
end
