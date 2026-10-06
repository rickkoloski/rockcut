defmodule RockcutApi.BeerBoard.Entry do
  @moduledoc "D37: one line moved off the taproom chalkboard (pre-purchased beers)."
  use Ecto.Schema
  import Ecto.Changeset

  @max_beers 99
  @max_name 80

  schema "beer_board_entries" do
    field :recipient_name, :string
    field :purchaser_name, :string
    field :beers_remaining, :integer
    field :moved_off_board_at, :utc_datetime
    field :imported_at, :utc_datetime

    belongs_to :created_by, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def max_beers, do: @max_beers
  def max_name, do: @max_name

  @doc "Names and count, as a person enters or edits them."
  def changeset(entry, attrs) do
    entry
    |> cast(attrs, [:recipient_name, :purchaser_name, :beers_remaining])
    |> update_change(:recipient_name, &trim/1)
    |> update_change(:purchaser_name, &trim/1)
    |> validate_required([:recipient_name, :purchaser_name, :beers_remaining],
      message: "can't be blank"
    )
    |> validate_length(:recipient_name, max: @max_name)
    |> validate_length(:purchaser_name, max: @max_name)
    |> validate_number(:beers_remaining,
      greater_than_or_equal_to: 1,
      less_than_or_equal_to: @max_beers
    )
  end

  defp trim(nil), do: nil
  defp trim(s) when is_binary(s), do: s |> String.trim() |> String.replace(~r/\s+/u, " ")
end
