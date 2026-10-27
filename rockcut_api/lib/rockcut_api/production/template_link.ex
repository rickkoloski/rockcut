defmodule RockcutApi.Production.TemplateLink do
  @moduledoc """
  D46 §3.4: "`to_step` comes after `from_step`". `default_answer` pre-selects
  the move prompt (D47): `move_all` moves the following steps with it,
  `move_only` leaves them.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @answers ~w(move_all move_only)

  schema "template_links" do
    field :default_answer, :string, default: "move_all"

    belongs_to :template, RockcutApi.Production.Template
    belongs_to :from_step, RockcutApi.Production.TemplateStep
    belongs_to :to_step, RockcutApi.Production.TemplateStep

    timestamps(type: :utc_datetime)
  end

  def answers, do: @answers

  def changeset(link, attrs) do
    link
    |> cast(attrs, [:default_answer])
    |> validate_required([:default_answer])
    |> validate_inclusion(:default_answer, @answers)
  end
end
