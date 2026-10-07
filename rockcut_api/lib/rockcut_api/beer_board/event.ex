defmodule RockcutApi.BeerBoard.Event do
  @moduledoc """
  D37: one change to the Buy-a-Beer Board (append-only). `actor` is always the
  person; `device` is the shared tablet it was made from, when a staff code
  was used.
  """
  use Ecto.Schema

  @actions ~w(created redeemed edited deleted)

  schema "beer_board_events" do
    field :entry_id, :integer
    field :action, :string
    field :recipient_name, :string
    field :purchaser_name, :string
    field :beers_before, :integer
    field :beers_after, :integer
    field :detail, :map, default: %{}

    belongs_to :actor, RockcutApi.Accounts.User
    belongs_to :device, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def actions, do: @actions
end
