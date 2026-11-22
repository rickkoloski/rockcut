defmodule RockcutApi.Yeast.Brink do
  @moduledoc """
  D64 §4.4: a yeast brink (YB1–YB4 seeded). The settings set its name,
  empty weight (shown beside every lb field; never subtracted), order and
  whether it's active; `dirty` / `dirty_since` are the stock actions' (an
  emptied brink is dirty until cleaned), never cast here.
  """
  use Ecto.Schema
  import Ecto.Changeset
  import RockcutApi.Brewing.Ranges

  schema "yeast_brinks" do
    field :name, :string
    field :empty_weight_lb, :decimal
    field :position, :integer, default: 0
    field :active, :boolean, default: true
    field :dirty, :boolean, default: false
    field :dirty_since, :date

    has_many :harvests, RockcutApi.Yeast.Harvest

    timestamps(type: :utc_datetime)
  end

  def changeset(brink, attrs) do
    brink
    |> cast(RockcutApi.Changeset.blank_to_nil(attrs, :position), [
      :name,
      :empty_weight_lb,
      :position,
      :active
    ])
    |> update_change(:name, &String.trim/1)
    |> validate_required([:name])
    |> validate_length(:name, max: 40)
    |> validate_number(:empty_weight_lb, greater_than: 0, less_than_or_equal_to: 10_000)
    |> validate_places(:empty_weight_lb, 2)
    |> validate_number(:position, greater_than_or_equal_to: 0, less_than: 10_000)
    |> unique_constraint(:name,
      name: :yeast_brinks_lower_name_index,
      error_key: :base,
      message: "There's already a brink with that name"
    )
  end
end
