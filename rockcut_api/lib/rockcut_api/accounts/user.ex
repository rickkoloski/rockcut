defmodule RockcutApi.Accounts.User do
  use Ecto.Schema
  import Ecto.Changeset

  schema "users" do
    field :email, :string
    field :password_hash, :string
    field :name, :string
    field :role, :string, default: "user"
    field :active, :boolean, default: true
    field :must_change_password, :boolean, default: false

    field :password, :string, virtual: true

    timestamps(type: :utc_datetime)
  end

  @doc "Used when creating a new user — requires email, password, and name."
  def registration_changeset(user, attrs) do
    user
    |> cast(attrs, [:email, :password, :name, :role, :active, :must_change_password])
    |> validate_required([:email, :password, :name])
    |> validate_format(:email, ~r/^[^\s]+@[^\s]+$/, message: "must be a valid email address")
    |> validate_length(:password, min: 6, message: "must be at least 6 characters")
    |> unique_constraint(:email)
    |> maybe_hash_password()
  end

  @doc "Used for admin updates — password is optional."
  def changeset(user, attrs) do
    user
    |> cast(attrs, [:email, :password, :name, :role, :active, :must_change_password])
    |> validate_required([:email, :name])
    |> validate_format(:email, ~r/^[^\s]+@[^\s]+$/, message: "must be a valid email address")
    |> validate_length(:password, min: 6, message: "must be at least 6 characters")
    |> unique_constraint(:email)
    |> maybe_hash_password()
  end

  @doc "Used for self-service password change — requires password + confirmation."
  def password_changeset(user, attrs) do
    user
    |> cast(attrs, [:password])
    |> validate_required([:password])
    |> validate_length(:password, min: 6, message: "must be at least 6 characters")
    |> validate_confirmation(:password, required: true)
    |> maybe_hash_password()
    |> put_change(:must_change_password, false)
  end

  defp maybe_hash_password(changeset) do
    case get_change(changeset, :password) do
      nil -> changeset
      password -> put_change(changeset, :password_hash, Argon2.hash_pwd_salt(password))
    end
  end
end
