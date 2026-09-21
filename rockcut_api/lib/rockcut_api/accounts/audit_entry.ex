defmodule RockcutApi.Accounts.AuditEntry do
  use Ecto.Schema
  import Ecto.Changeset

  @timestamps_opts [type: :utc_datetime, updated_at: false]

  schema "audit_log" do
    field :action, :string
    field :detail, :map, default: %{}

    belongs_to :actor, RockcutApi.Accounts.User
    belongs_to :target, RockcutApi.Accounts.User

    timestamps()
  end

  def changeset(entry, attrs) do
    entry
    |> cast(attrs, [:actor_id, :target_id, :action, :detail])
    |> validate_required([:action])
  end
end
