defmodule RockcutApi.Production.Outage do
  @moduledoc """
  D46 §3.2: an out-of-service period for a tank, `starts_on` through
  `ends_on` (the last day out; nil = until further notice). Periods on one
  tank never overlap (`Production` checks); past ones stay as history.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @max_reason 80

  schema "tank_outages" do
    field :starts_on, :date
    field :ends_on, :date
    field :reason, :string

    belongs_to :tank, RockcutApi.Production.Tank
    belongs_to :created_by, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def changeset(outage, attrs) do
    outage
    |> cast(attrs, [:starts_on, :ends_on, :reason])
    |> update_change(:reason, &trim/1)
    |> validate_required([:starts_on], message: "Pick the first day out.")
    |> validate_length(:reason, max: @max_reason)
    |> validate_order()
  end

  defp validate_order(changeset) do
    from = get_field(changeset, :starts_on)
    to = get_field(changeset, :ends_on)

    if from && to && Date.compare(to, from) == :lt,
      do: add_error(changeset, :ends_on, "The last day out can't be before the first."),
      else: changeset
  end

  defp trim(nil), do: nil

  defp trim(s) when is_binary(s) do
    case String.trim(s) do
      "" -> nil
      t -> t
    end
  end
end
