defmodule RockcutApi.Accounts.User do
  use Ecto.Schema
  import Ecto.Changeset

  schema "users" do
    field :email, :string
    field :name, :string
    field :password_hash, :string
    field :active, :boolean, default: true
    field :is_owner, :boolean, default: false
    field :must_reset_password, :boolean, default: false
    field :schedulable, :boolean, default: true
    field :schedule_order, :integer, default: 0

    field :password, :string, virtual: true, redact: true

    has_many :memberships, RockcutApi.Accounts.Membership
    has_many :departments, through: [:memberships, :department]

    timestamps(type: :utc_datetime)
  end

  @doc "Changeset for profile / status fields (no password, no owner flag)."
  def changeset(user, attrs) do
    user
    |> cast(attrs, [:email, :name, :active, :schedulable])
    |> validate_required([:email])
    |> validate_email()
  end

  @doc """
  Registration changeset: sets email, name, and hashes a plaintext password.
  `is_owner` is only settable here via the guarded `:is_owner` opt-in below.
  """
  def registration_changeset(user, attrs) do
    user
    |> cast(attrs, [:email, :name, :password, :active, :must_reset_password])
    |> validate_required([:email, :password])
    |> validate_email()
    |> validate_length(:password, min: 8, max: 72)
    |> put_password_hash()
  end

  @doc "Changeset used to (re)set a password from plaintext."
  def password_changeset(user, attrs) do
    user
    |> cast(attrs, [:password, :must_reset_password])
    |> validate_required([:password])
    |> validate_length(:password, min: 8, max: 72)
    |> put_password_hash()
  end

  @doc "Owner-only changeset for toggling the global owner flag."
  def owner_flag_changeset(user, is_owner) when is_boolean(is_owner) do
    change(user, is_owner: is_owner)
  end

  defp validate_email(changeset) do
    changeset
    |> update_change(:email, &String.trim/1)
    |> validate_format(:email, ~r/^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: "must be a valid email")
    # ecto_sqlite3 surfaces the violation under the default derived name
    # (users_email_index), regardless of the actual COLLATE NOCASE index name.
    |> unique_constraint(:email)
  end

  defp put_password_hash(changeset) do
    case get_change(changeset, :password) do
      nil ->
        changeset

      password ->
        changeset
        |> put_change(:password_hash, Argon2.hash_pwd_salt(password))
        |> delete_change(:password)
    end
  end
end
