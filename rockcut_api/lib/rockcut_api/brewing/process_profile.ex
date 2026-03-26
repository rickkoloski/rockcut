defmodule RockcutApi.Brewing.ProcessProfile do
  use Ecto.Schema
  import Ecto.Changeset

  schema "process_profiles" do
    field :name, :string
    field :description, :string

    # Mash
    field :mash_type, :string
    field :mash_foundation_water, :decimal
    field :strike_water_ratio, :decimal
    field :mash_ph, :decimal
    field :mash_schedule, :map

    # Lauter
    field :vorlauf_duration, :integer
    field :lauter_type, :string
    field :lauter_temperature, :decimal
    field :lauter_water, :decimal
    field :final_lauter_ph, :decimal
    field :lauter_duration, :integer

    # Boil & Post-Boil
    field :boil_duration, :integer
    field :coolpool, :boolean, default: false
    field :coolpool_temperature, :decimal
    field :coolpool_duration, :integer
    field :coolpool_rest_duration, :integer
    field :whirlpool_duration, :integer
    field :whirlpool_rest_duration, :integer
    field :knockout_duration, :integer
    field :knockout_temperature, :decimal

    # Fermentation
    field :lag_temperature, :decimal
    field :lag_duration, :decimal
    field :primary_temperature, :decimal
    field :primary_duration, :decimal
    field :secondary_temperature, :decimal
    field :secondary_duration, :decimal
    field :d_rest_temperature, :decimal
    field :d_rest_duration, :decimal

    # Cold Crash
    field :crash_type, :string
    field :crash_temperature, :decimal
    field :crash_duration, :decimal
    field :crash_steps, :map

    # Packaging
    field :transfer_type, :string
    field :bright_temperature, :decimal
    field :bright_duration, :decimal
    field :co2_volume, :decimal

    timestamps(type: :utc_datetime)
  end

  @valid_mash_types ~w(single_infusion step decoction)
  @valid_lauter_types ~w(continuous batch)
  @valid_crash_types ~w(single step)
  @valid_transfer_types ~w(none yes filter)

  def changeset(profile, attrs) do
    profile
    |> cast(attrs, [
      :name,
      :description,
      :mash_type,
      :mash_foundation_water,
      :strike_water_ratio,
      :mash_ph,
      :mash_schedule,
      :vorlauf_duration,
      :lauter_type,
      :lauter_temperature,
      :lauter_water,
      :final_lauter_ph,
      :lauter_duration,
      :boil_duration,
      :coolpool,
      :coolpool_temperature,
      :coolpool_duration,
      :coolpool_rest_duration,
      :whirlpool_duration,
      :whirlpool_rest_duration,
      :knockout_duration,
      :knockout_temperature,
      :lag_temperature,
      :lag_duration,
      :primary_temperature,
      :primary_duration,
      :secondary_temperature,
      :secondary_duration,
      :d_rest_temperature,
      :d_rest_duration,
      :crash_type,
      :crash_temperature,
      :crash_duration,
      :crash_steps,
      :transfer_type,
      :bright_temperature,
      :bright_duration,
      :co2_volume
    ])
    |> validate_required([:name])
    |> maybe_validate_inclusion(:mash_type, @valid_mash_types)
    |> maybe_validate_inclusion(:lauter_type, @valid_lauter_types)
    |> maybe_validate_inclusion(:crash_type, @valid_crash_types)
    |> maybe_validate_inclusion(:transfer_type, @valid_transfer_types)
    |> unique_constraint(:name)
  end

  # Only validate inclusion when the field is not nil
  defp maybe_validate_inclusion(changeset, field, values) do
    case get_field(changeset, field) do
      nil -> changeset
      _ -> validate_inclusion(changeset, field, values)
    end
  end
end
