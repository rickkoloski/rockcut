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
    |> validate_change(:user_id, fn :user_id, id ->
      # D33: a shared device never has memberships, whatever the insert path.
      if RockcutApi.Accounts.device_id?(id), do: [user_id: "can't be a shared device"], else: []
    end)
    |> RockcutApi.Changeset.validate_parents([:user_id, :department_id])
    |> validate_no_owners_only_manager()
  end

  # D59 §4.3: an owners-only department has no managers, whatever the path
  # (API, synthetic setup, console).
  defp validate_no_owners_only_manager(changeset) do
    with true <- changeset.valid?,
         true <- changed?(changeset, :role) or changed?(changeset, :department_id),
         "manager" <- get_field(changeset, :role),
         %{owners_only: true, name: name} <-
           RockcutApi.Repo.get(
             RockcutApi.Accounts.Department,
             get_field(changeset, :department_id)
           ) do
      add_error(changeset, :role, "#{name} has no managers")
    else
      _ -> changeset
    end
  end
end
