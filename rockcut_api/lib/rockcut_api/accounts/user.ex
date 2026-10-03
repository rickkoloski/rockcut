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
    field :notification_prefs, :map, default: %{}
    field :activity_seen_at, :utc_datetime
    field :legacy_tokens_revoked_at, :utc_datetime
    # D33: "person" (every human account) or "device" (a shared tablet account).
    # Set at creation and never changed.
    field :kind, :string, default: "person"

    belongs_to :home_department, RockcutApi.Accounts.Department

    field :password, :string, virtual: true, redact: true

    has_many :memberships, RockcutApi.Accounts.Membership
    has_many :departments, through: [:memberships, :department]
    has_many :push_subscriptions, RockcutApi.Notifications.PushSubscription
    has_many :device_tokens, RockcutApi.Devices.DeviceToken

    timestamps(type: :utc_datetime)
  end

  @doc "Changeset for profile / status fields (no password, no owner flag)."
  def changeset(user, attrs) do
    user
    |> cast(attrs, [:email, :name, :active, :schedulable])
    |> validate_required([:email])
    |> validate_email()
    |> validate_device_invariants()
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
    |> validate_device_invariants()
    |> put_password_hash()
  end

  @doc "Changeset used to (re)set a password from plaintext."
  def password_changeset(user, attrs) do
    user
    |> cast(attrs, [:password, :must_reset_password])
    |> validate_required([:password])
    |> validate_length(:password, min: 8, max: 72)
    |> validate_device_invariants()
    |> put_password_hash()
  end

  @doc "Owner-only changeset for toggling the global owner flag."
  def owner_flag_changeset(user, is_owner) when is_boolean(is_owner) do
    user |> change(is_owner: is_owner) |> validate_device_invariants()
  end

  @doc """
  Create a shared-device account (D33 §3.1): never an owner, never
  schedulable, no forced reset, a generated undeliverable email and a random
  password hash nobody knows (the column is NOT NULL). Memberships are refused
  in `Accounts`.
  """
  def device_create_changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [:name, :home_department_id])
    |> put_change(:kind, "device")
    |> put_change(:email, "device-#{random_hex(8)}@devices.rockcut.invalid")
    |> put_change(:is_owner, false)
    |> put_change(:schedulable, false)
    |> put_change(:must_reset_password, false)
    |> put_change(:password_hash, Argon2.hash_pwd_salt(random_hex(32)))
    |> device_common()
  end

  @doc "Rename a device, move it to another home department, or (de)activate it."
  def device_update_changeset(%__MODULE__{} = device, attrs) do
    device
    |> cast(attrs, [:name, :home_department_id, :active])
    |> device_common()
  end

  defp device_common(changeset) do
    changeset
    |> update_change(:name, &String.trim/1)
    |> validate_required([:name, :home_department_id])
    |> validate_length(:name, max: 100)
    |> validate_change(:home_department_id, &assignable_home/2)
    |> foreign_key_constraint(:home_department_id)
    |> unique_constraint(:email)
    |> validate_device_invariants()
  end

  # D33 decision P6 (review item 6): a device's home is an assignable department,
  # so its department channel and nav section exist. A missing id is left to
  # the foreign-key constraint.
  defp assignable_home(:home_department_id, id) do
    case RockcutApi.Repo.get(RockcutApi.Accounts.Department, id) do
      %{assignable: false} ->
        [home_department_id: "must be a department people can be assigned to"]

      _ ->
        []
    end
  end

  # D33: the invariants every changeset enforces. A device is never an owner,
  # never schedulable, never forced to reset, never given a password, and
  # always has a home department; a person never has one.
  defp validate_device_invariants(changeset) do
    case get_field(changeset, :kind) do
      "device" ->
        changeset
        |> refuse_device(:is_owner, get_field(changeset, :is_owner) == true)
        |> refuse_device(:schedulable, get_field(changeset, :schedulable) == true)
        |> refuse_device(
          :must_reset_password,
          get_field(changeset, :must_reset_password) == true
        )
        |> refuse_device(:password, not is_nil(get_change(changeset, :password)))
        |> validate_required([:home_department_id])

      _ ->
        if is_nil(get_field(changeset, :home_department_id)),
          do: changeset,
          else: add_error(changeset, :home_department_id, "only shared devices have one")
    end
  end

  defp refuse_device(changeset, _field, false), do: changeset

  defp refuse_device(changeset, field, true),
    do: add_error(changeset, field, "not allowed for a shared device")

  defp random_hex(bytes), do: :crypto.strong_rand_bytes(bytes) |> Base.encode16(case: :lower)

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
