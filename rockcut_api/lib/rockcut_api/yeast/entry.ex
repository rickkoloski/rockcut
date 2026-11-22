defmodule RockcutApi.Yeast.Entry do
  @moduledoc """
  D64 §4.5: one entry on a brink's record, never edited in place:
  `harvested` (+ lb, with its batch, step, strains and generation),
  `pitched` (− lb into a batch, with the strains and generation the record
  had), `dumped` (− the rest) and `adjusted` (± to the weight typed).
  """
  use Ecto.Schema

  @kinds ~w(harvested pitched dumped adjusted)

  schema "yeast_harvest_entries" do
    field :kind, :string
    field :quantity_lb, :decimal
    field :occurred_on, :date
    field :generation, :integer
    field :product_ids, {:array, :integer}
    field :note, :string

    belongs_to :harvest, RockcutApi.Yeast.Harvest
    belongs_to :batch, RockcutApi.Brewing.Batch
    belongs_to :production_step, RockcutApi.Production.Step
    belongs_to :entered_by, RockcutApi.Accounts.User
    belongs_to :device, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def kinds, do: @kinds
end
