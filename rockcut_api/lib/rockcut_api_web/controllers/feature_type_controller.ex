defmodule RockcutApiWeb.FeatureTypeController do
  @moduledoc "D60 §3.4: the feature types, with the categories each applies to (read only)."
  use RockcutApiWeb, :controller

  alias RockcutApi.Ingredients.Features
  import RockcutApiWeb.JSONHelpers, only: [feature_type: 1]

  def index(conn, _params) do
    json(conn, %{data: Enum.map(Features.list_types(), &feature_type/1)})
  end
end
