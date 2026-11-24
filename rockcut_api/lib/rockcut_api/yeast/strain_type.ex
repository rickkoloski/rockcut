defmodule RockcutApi.Yeast.StrainType do
  @moduledoc """
  D64 (spec Amendment 2, A13): a strain's type (Ale, Lager, Brett, Lacto),
  an editable list in the yeast settings. The name is unique in any case; a
  type is retired, not deleted, once a strain uses it
  (`RockcutApi.Yeast.StrainTypes`).
  """
  use Ecto.Schema
  import Ecto.Changeset

  schema "yeast_strain_types" do
    field :name, :string
    field :position, :integer, default: 0
    field :retired_at, :utc_datetime
    # How many strains use it (`StrainTypes.list/0`); a type in use isn't deleted.
    field :in_use, :integer, virtual: true, default: 0

    timestamps(type: :utc_datetime)
  end

  def changeset(type, attrs) do
    type
    |> cast(RockcutApi.Changeset.blank_to_nil(attrs, :position), [:name, :position])
    |> update_change(:name, &String.trim/1)
    |> validate_required([:name])
    |> validate_length(:name, max: 40)
    |> validate_number(:position, greater_than_or_equal_to: 0, less_than: 10_000)
    |> unique_constraint(:name,
      name: :yeast_strain_types_lower_name_index,
      error_key: :base,
      message: "There's already a strain type with that name"
    )
  end
end
