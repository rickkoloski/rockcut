defmodule RockcutApi.Production.UndoRecord do
  @moduledoc "D47 plan decision 5: one write's undo data (`Production.Undo`)."
  use Ecto.Schema

  schema "production_undos" do
    field :token, :string
    field :expires_at, :utc_datetime
    field :entries, :map

    belongs_to :user, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime, updated_at: false)
  end
end
