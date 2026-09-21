defmodule RockcutApi.Accounts.Membership do
  use Ecto.Schema
  import Ecto.Changeset

  @roles ~w(manager employee)

  schema "memberships" do
    field :role, :string

    belongs_to :user, RockcutApi.Accounts.User
    belongs_to :department, RockcutApi.Accounts.Department

    timestamps(type: :utc_datetime)
  end

  def roles, do: @roles

  def changeset(membership, attrs) do
    membership
    |> cast(attrs, [:user_id, :department_id, :role])
    |> validate_required([:user_id, :department_id, :role])
    |> validate_inclusion(:role, @roles)
    |> unique_constraint([:user_id, :department_id])
    |> foreign_key_constraint(:user_id)
    |> foreign_key_constraint(:department_id)
  end
end
