defmodule RockcutApi.Brewing.Batch do
  use Ecto.Schema
  import Ecto.Changeset

  schema "batches" do
    field :batch_number, :string
    field :status, :string, default: "planned"

    # Blended actuals (measured in fermenter after all turns)
    field :actual_og, :decimal
    field :actual_fg, :decimal
    field :actual_abv, :decimal
    field :actual_volume, :decimal

    # Fermentation
    field :ferm_start_date, :date
    field :ferm_end_date, :date
    field :ferm_temp, :decimal

    # Packaging
    field :package_date, :date
    field :package_type, :string

    # Tasting
    field :rating, :integer
    field :tasting_notes, :string
    field :notes, :string

    belongs_to :brand, RockcutApi.Brewing.Brand
    has_many :brew_turns, RockcutApi.Brewing.BrewTurn
    has_many :log_entries, RockcutApi.Brewing.BatchLogEntry

    timestamps(type: :utc_datetime)
  end

  @valid_statuses ~w(planned brewing fermenting conditioning completed dumped)
  @valid_package_types ~w(keg bottle can)

  def changeset(batch, attrs) do
    batch
    |> cast(attrs, [
      :brand_id, :batch_number, :status,
      :actual_og, :actual_fg, :actual_abv, :actual_volume,
      :ferm_start_date, :ferm_end_date, :ferm_temp,
      :package_date, :package_type,
      :rating, :tasting_notes, :notes
    ])
    |> validate_required([:brand_id, :batch_number])
    |> validate_inclusion(:status, @valid_statuses)
    |> validate_inclusion(:package_type, @valid_package_types)
    |> validate_number(:rating, greater_than_or_equal_to: 1, less_than_or_equal_to: 5)
    |> unique_constraint(:batch_number)
    |> foreign_key_constraint(:brand_id)
  end
end
