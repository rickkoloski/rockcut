defmodule RockcutApi.Production.Template do
  @moduledoc """
  D46 §3.4: a process template. `issues` (virtual) lists what keeps it from
  being complete (`Production.issues/1`); an incomplete template is kept,
  but only complete ones are offered when planning a batch (D47).
  """
  use Ecto.Schema
  import Ecto.Changeset

  @max_name 60

  schema "process_templates" do
    field :name, :string
    field :notes, :string
    field :position, :integer, default: 0
    field :retired_at, :utc_datetime
    field :issues, {:array, :map}, virtual: true, default: []
    field :step_count, :integer, virtual: true

    has_many :steps, RockcutApi.Production.TemplateStep, foreign_key: :template_id
    has_many :links, RockcutApi.Production.TemplateLink, foreign_key: :template_id

    timestamps(type: :utc_datetime)
  end

  def changeset(template, attrs) do
    template
    |> cast(attrs, [:name, :notes])
    |> update_change(:name, &String.trim/1)
    |> validate_required([:name], message: "Give the template a name.")
    |> validate_length(:name, max: @max_name)
    |> validate_length(:notes, max: 2_000)
    |> unique_constraint(:name,
      name: :process_templates_lower_name_index,
      message: "A template with that name already exists."
    )
  end
end
