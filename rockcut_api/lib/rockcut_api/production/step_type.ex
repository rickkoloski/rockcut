defmodule RockcutApi.Production.StepType do
  @moduledoc """
  D46 §3.3: a step type. `name` is the fixed part of every step's name; the
  `behavior` tells the schedule what the step does to the beer and the tank.
  Built-in types (any behavior but `plain`) can be renamed, never retired;
  brewer-added types are always `plain`.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @behaviors ~w(plain brew set_temp transfer split cip package)
  @max_name 30

  schema "production_step_types" do
    field :name, :string
    field :full_name, :string
    field :behavior, :string, default: "plain"
    field :on_task_list, :boolean, default: true
    field :built_in, :boolean, default: false
    field :position, :integer, default: 0
    field :retired_at, :utc_datetime

    belongs_to :starts_phase, RockcutApi.Production.Phase

    timestamps(type: :utc_datetime)
  end

  def behaviors, do: @behaviors

  @doc "What a brewer edits. `behavior` and `built_in` are never cast."
  def changeset(type, attrs) do
    type
    |> cast(attrs, [:name, :full_name, :starts_phase_id, :on_task_list])
    |> update_change(:name, &String.trim/1)
    |> update_change(:full_name, &blank_to_nil/1)
    |> validate_required([:name], message: "Give the step type a name.")
    |> validate_length(:name, max: @max_name)
    |> validate_length(:full_name, max: 60)
    |> foreign_key_constraint(:starts_phase_id)
    |> unique_constraint(:name,
      name: :production_step_types_lower_name_index,
      message: "A step type with that name already exists."
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
