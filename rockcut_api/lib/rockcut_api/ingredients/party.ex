defmodule RockcutApi.Ingredients.Party do
  @moduledoc """
  D60 §3.2: a company the brewery deals with (Silverston's Party): a
  manufacturer (D62: a maltster on grain screens), a supplier, a partner
  brewery, or several (`roles`). A party in
  use is deactivated, not deleted.
  """
  use Ecto.Schema
  import Ecto.Changeset
  import RockcutApi.Brewing.Ranges

  schema "parties" do
    field :name, :string
    field :notes, :string
    field :active, :boolean, default: true
    # D61 decision 48: a supplier's order size in packs (BSG: 40; D62 A5
    # counts every pack); shown, never refused.
    field :order_target_packs, :integer
    # Why it can't be deleted, or nil (D61 carry-over 2; `Parties.put_delete_blocked/1`).
    field :delete_blocked, :string, virtual: true

    has_many :roles, RockcutApi.Ingredients.PartyRole

    timestamps(type: :utc_datetime)
  end

  def changeset(party, attrs) do
    party
    |> cast(attrs, [:name, :notes, :active, :order_target_packs])
    |> update_change(:name, &trim/1)
    |> validate_required([:name])
    |> validate_length(:name, max: 100)
    |> validate_range(:order_target_packs, 1, 10_000)
    |> unique_constraint(:name)
  end

  defp trim(name) when is_binary(name), do: String.trim(name)
  defp trim(name), do: name
end
