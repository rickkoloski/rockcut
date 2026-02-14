defmodule RockcutApi.Formulas.FormulaRuntime do
  @moduledoc """
  Process-isolated execution engine for formula functions.

  Executes whitelisted operations from the FormulaCatalog in isolated BEAM
  processes with timeout enforcement, exception handling, and normalized
  result format.
  """

  alias RockcutApi.Formulas.FormulaCatalog

  @doc """
  Execute a named formula function with the given params and context.

  Context should include :repo for Ecto queries.

  Returns:
    {:ok, %{value: term(), duration_ms: integer()}}
    {:error, error_type, message}

  Error types: :not_found, :validation_error, :timeout, :runtime_error
  """
  def execute(function_name, params, context) do
    case FormulaCatalog.get(function_name) do
      nil ->
        {:error, :not_found, "Unknown function: #{function_name}"}

      operation ->
        case FormulaCatalog.validate_params(operation, params) do
          :ok ->
            execute_isolated(operation, params, context)

          {:error, message} ->
            {:error, :validation_error, message}
        end
    end
  end

  defp execute_isolated(operation, params, context) do
    started_at = System.monotonic_time(:millisecond)

    task =
      Task.async(fn ->
        try do
          operation.handler.(context, params)
        rescue
          e -> {:error, :runtime_error, Exception.format(:error, e, __STACKTRACE__)}
        end
      end)

    timeout_ms = operation.limits.timeout_ms

    case Task.yield(task, timeout_ms) || Task.shutdown(task) do
      {:ok, {:ok, %{value: _} = result}} ->
        duration_ms = System.monotonic_time(:millisecond) - started_at
        {:ok, Map.put(result, :duration_ms, duration_ms)}

      {:ok, {:ok, value}} ->
        duration_ms = System.monotonic_time(:millisecond) - started_at
        {:ok, %{value: value, duration_ms: duration_ms}}

      {:ok, {:error, error_type, message}} ->
        {:error, error_type, message}

      {:ok, {:error, message}} when is_binary(message) ->
        {:error, :runtime_error, message}

      {:ok, other} ->
        {:error, :runtime_error, "Unexpected return value: #{inspect(other)}"}

      nil ->
        {:error, :timeout, "Exceeded #{timeout_ms}ms limit"}
    end
  end
end
