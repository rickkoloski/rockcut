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

    # D47 production schedule (spec §3.5). A scheduled batch has vessels; a
    # planned one has no number yet (its P-number is computed).
    field :volume_bbl, :decimal
    field :brew_two_days, :boolean, default: false

    belongs_to :brand, RockcutApi.Brewing.Brand
    belongs_to :template, RockcutApi.Production.Template
    has_many :vessels, RockcutApi.Production.BatchVessel
    has_many :steps, RockcutApi.Production.Step
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
    |> validate_required([:brand_id])
    |> validate_number_unless_planned()
    |> validate_inclusion(:status, @valid_statuses)
    |> validate_inclusion(:package_type, @valid_package_types)
    |> validate_number(:rating, greater_than_or_equal_to: 1, less_than_or_equal_to: 5)
    |> unique_constraint(:batch_number, name: :batches_lower_batch_number_index)
    |> foreign_key_constraint(:brand_id)
  end

  # D47: only a planned batch may be without a number.
  defp validate_number_unless_planned(changeset) do
    if get_field(changeset, :status) == "planned",
      do: changeset,
      else: validate_required(changeset, [:batch_number])
  end
end
