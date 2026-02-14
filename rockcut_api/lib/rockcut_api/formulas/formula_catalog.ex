defmodule RockcutApi.Formulas.FormulaCatalog do
  @moduledoc """
  Registry of whitelisted formula functions for server-side execution.

  Only operations defined here can be executed by the FormulaRuntime.
  Each operation specifies its name, description, parameter schema,
  return type, handler function, and resource limits.
  """

  alias RockcutApi.Formulas.Functions

  @operations [
    %{
      name: "inventory_on_hand",
      description: "Current total quantity for an ingredient across active lots",
      params: [%{name: "ingredient_id", type: :integer, required: true}],
      returns: :number,
      handler: &Functions.Inventory.on_hand/2,
      limits: %{timeout_ms: 5_000},
      exposed: true
    },
    %{
      name: "est_ibu",
      description: "Estimated IBU for a recipe using the Tinseth formula",
      params: [%{name: "recipe_id", type: :integer, required: true}],
      returns: :number,
      handler: &Functions.BrewingCalcs.est_ibu/2,
      limits: %{timeout_ms: 5_000},
      exposed: true
    },
    %{
      name: "est_og",
      description: "Estimated original gravity for a recipe from the grain bill",
      params: [%{name: "recipe_id", type: :integer, required: true}],
      returns: :number,
      handler: &Functions.BrewingCalcs.est_og/2,
      limits: %{timeout_ms: 5_000},
      exposed: true
    }
  ]

  @doc "Returns all operations where exposed is true."
  def list_exposed do
    Enum.filter(@operations, & &1.exposed)
  end

  @doc "Finds an operation by name string. Returns nil if not found."
  def get(name) do
    Enum.find(@operations, &(&1.name == name))
  end

  @doc """
  Validates a params map against the operation's declared parameter schema.
  Returns :ok or {:error, message}.
  """
  def validate_params(operation, params) do
    required_params =
      operation.params
      |> Enum.filter(& &1.required)
      |> Enum.map(& &1.name)

    missing =
      Enum.reject(required_params, fn name ->
        Map.has_key?(params, name) || Map.has_key?(params, to_string(name))
      end)

    case missing do
      [] -> :ok
      names -> {:error, "Missing required parameters: #{Enum.join(names, ", ")}"}
    end
  end
end
