defmodule RockcutApi.Ingredients.Party do
  @moduledoc """
  D60 §3.2: a company the brewery deals with (Silverston's Party): a
  maltster, a supplier, a partner brewery, or several (`roles`). A party in
  use is deactivated, not deleted.
  """
  use Ecto.Schema
  import Ecto.Changeset

  schema "parties" do
    field :name, :string
    field :notes, :string
    field :active, :boolean, default: true

    has_many :roles, RockcutApi.Ingredients.PartyRole

    timestamps(type: :utc_datetime)
  end

  def changeset(party, attrs) do
    party
    |> cast(attrs, [:name, :notes, :active])
    |> update_change(:name, &trim/1)
    |> validate_required([:name])
    |> validate_length(:name, max: 100)
    |> unique_constraint(:name)
  end

  defp trim(name) when is_binary(name), do: String.trim(name)
  defp trim(name), do: name
end
