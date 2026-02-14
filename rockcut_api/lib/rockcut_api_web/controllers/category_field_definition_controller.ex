defmodule RockcutApiWeb.CategoryFieldDefinitionController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Brewing
  import RockcutApiWeb.JSONHelpers, only: [category_field_definition: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, %{"category_id" => category_id}) do
    definitions = Brewing.list_category_field_definitions(category_id)
    json(conn, %{data: Enum.map(definitions, &category_field_definition/1)})
  end

  def create(conn, params) do
    with {:ok, definition} <- Brewing.create_category_field_definition(params) do
      conn
      |> put_status(:created)
      |> json(%{data: category_field_definition(definition)})
    end
  end

  def show(conn, %{"id" => id}) do
    definition = Brewing.get_category_field_definition!(id)
    json(conn, %{data: category_field_definition(definition)})
  end

  def update(conn, %{"id" => id} = params) do
    definition = Brewing.get_category_field_definition!(id)

    with {:ok, definition} <- Brewing.update_category_field_definition(definition, params) do
      json(conn, %{data: category_field_definition(definition)})
    end
  end

  def delete(conn, %{"id" => id}) do
    definition = Brewing.get_category_field_definition!(id)

    with {:ok, _} <- Brewing.delete_category_field_definition(definition) do
      send_resp(conn, :no_content, "")
    end
  end
end
