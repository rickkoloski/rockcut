defmodule RockcutApi.Tasks.DailyItem do
  @moduledoc """
  D38: one line of the Daily card (Backups, Gravities, …). Retired items keep
  `active: false` so past ticks still read; `inserted_at` decides whether an
  item counts on a past day.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @max_name 40
  @defaults ~w(Backups Gravities Temps Pressures)

  schema "daily_items" do
    field :name, :string
    field :position, :integer, default: 0
    field :active, :boolean, default: true

    belongs_to :department, RockcutApi.Accounts.Department

    timestamps(type: :utc_datetime)
  end

  def max_name, do: @max_name

  @doc "The four items a new Brewery department starts with, in order."
  def defaults, do: @defaults

  @doc "The name, as a manager enters or renames it."
  def changeset(item, attrs) do
    item
    |> cast(attrs, [:name])
    |> update_change(:name, &trim/1)
    |> validate_required([:name], message: "can't be blank")
    |> validate_length(:name, max: @max_name)
  end

  defp trim(nil), do: nil
  defp trim(s) when is_binary(s), do: String.trim(s)
end
