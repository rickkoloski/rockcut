defmodule RockcutApi.Yeast.Harvest do
  @moduledoc """
  D64 §4.5: the yeast in a brink, one record from the first harvest into an
  empty brink until it's emptied (`in_brink` → `emptied`; `voided` when an
  un-checked harvest leaves it with none, Stop 3). The generation, co-ferment
  mark and strains (`yeast_harvest_products`) are a cache of the fold over its
  `harvested` entries (`Yeast.Rules`). Only `Yeast.Harvests` writes it.
  """
  use Ecto.Schema

  schema "yeast_harvests" do
    field :status, :string, default: "in_brink"
    field :generation, :integer, default: 1
    field :coferment, :boolean, default: false
    field :emptied_on, :date
    field :notes, :string
    field :lock_version, :integer, default: 1

    belongs_to :brink, RockcutApi.Yeast.Brink
    has_many :entries, RockcutApi.Yeast.Entry
    has_many :counts, RockcutApi.Yeast.Count
    has_many :product_links, RockcutApi.Yeast.HarvestProduct

    timestamps(type: :utc_datetime)
  end
end
