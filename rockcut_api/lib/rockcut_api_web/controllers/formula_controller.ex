defmodule RockcutApiWeb.FormulaController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Formulas.{FormulaCatalog, FormulaRuntime}

  def catalog(conn, _params) do
    functions =
      FormulaCatalog.list_exposed()
      |> Enum.map(fn op ->
        %{
          name: op.name,
          description: op.description,
          params: Enum.map(op.params, fn p ->
            %{name: p.name, type: to_string(p.type), required: p.required}
          end),
          returns: to_string(op.returns)
        }
      end)

    json(conn, %{functions: functions})
  end

  def execute(conn, %{"calls" => calls}) when is_list(calls) do
    context = %{repo: RockcutApi.Repo}

    results =
      Enum.map(calls, fn call ->
        function = call["function"]
        args = call["args"] || %{}

        case FormulaRuntime.execute(function, args, context) do
          {:ok, %{value: value, duration_ms: duration_ms}} ->
            %{status: "ok", value: value, duration_ms: duration_ms}

          {:error, error_type, message} ->
            %{status: "error", error: to_string(error_type), message: message}
        end
      end)

    json(conn, %{results: results})
  end

  def execute(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "Missing or invalid 'calls' array"})
  end
end
