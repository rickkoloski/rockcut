defmodule RockcutApi.Brewing.Brewhouse do
  use Ecto.Schema
  import Ecto.Changeset

  schema "brewhouses" do
    field :name, :string
    field :is_default, :boolean, default: false
    field :notes, :string

    # UOM Preferences
    field :temp_unit, :string, default: "F"
    field :liquid_vol_unit, :string, default: "bbls"
    field :density_unit, :string, default: "sg"
    field :alcohol_unit, :string, default: "abv"
    field :density_calc_method, :string, default: "ppg"
    field :ibu_calc_method, :string, default: "tinseth"
    field :ingredient_weight_unit, :string, default: "lb"
    field :ingredient_vol_unit, :string, default: "gal"

    # Equipment Values
    field :kettle_turn_size, :decimal
    field :kettle_evaporation_rate, :decimal
    field :kettle_loss, :decimal
    field :ferm_loss, :decimal

    has_many :brands, RockcutApi.Brewing.Brand
    has_many :batches, RockcutApi.Brewing.Batch

    timestamps(type: :utc_datetime)
  end

  @valid_temp_units ~w(F C)
  @valid_liquid_vol_units ~w(bbls gallons hectoliters liters)
  @valid_density_units ~w(plato sg)
  @valid_alcohol_units ~w(abv abw)
  @valid_density_calc_methods ~w(cgai ppg)
  @valid_ibu_calc_methods ~w(tinseth rager garetz)
  @valid_ingredient_weight_units ~w(lb lb_oz oz kg g)
  @valid_ingredient_vol_units ~w(bbls gal oz hl l ml)

  def changeset(brewhouse, attrs) do
    brewhouse
    |> cast(attrs, [
      :name,
      :is_default,
      :notes,
      :temp_unit,
      :liquid_vol_unit,
      :density_unit,
      :alcohol_unit,
      :density_calc_method,
      :ibu_calc_method,
      :ingredient_weight_unit,
      :ingredient_vol_unit,
      :kettle_turn_size,
      :kettle_evaporation_rate,
      :kettle_loss,
      :ferm_loss
    ])
    |> validate_required([:name])
    |> validate_inclusion(:temp_unit, @valid_temp_units)
    |> validate_inclusion(:liquid_vol_unit, @valid_liquid_vol_units)
    |> validate_inclusion(:density_unit, @valid_density_units)
    |> validate_inclusion(:alcohol_unit, @valid_alcohol_units)
    |> validate_inclusion(:density_calc_method, @valid_density_calc_methods)
    |> validate_inclusion(:ibu_calc_method, @valid_ibu_calc_methods)
    |> validate_inclusion(:ingredient_weight_unit, @valid_ingredient_weight_units)
    |> validate_inclusion(:ingredient_vol_unit, @valid_ingredient_vol_units)
    |> unique_constraint(:name)
  end
end
