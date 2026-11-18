defmodule RockcutApi.Ingredients.PartyRole do
  @moduledoc "D60 §3.2: one role a party holds (Silverston's Party Role)."
  use Ecto.Schema
  import Ecto.Changeset

  @roles ~w(maltster supplier partner_brewery)

  schema "party_roles" do
    field :role, :string

    belongs_to :party, RockcutApi.Ingredients.Party

    timestamps(type: :utc_datetime)
  end

  def roles, do: @roles

  def changeset(role, attrs) do
    role
    |> cast(attrs, [:party_id, :role])
    |> validate_required([:party_id, :role])
    |> validate_inclusion(:role, @roles)
    |> unique_constraint([:party_id, :role])
    |> foreign_key_constraint(:party_id)
    |> RockcutApi.Changeset.validate_parents([:party_id])
  end
end
