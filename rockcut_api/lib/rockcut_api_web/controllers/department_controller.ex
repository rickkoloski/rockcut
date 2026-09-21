defmodule RockcutApiWeb.DepartmentController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [department: 1]
  alias RockcutApi.{Accounts, Authz}

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, _params) do
    json(conn, %{data: Enum.map(Accounts.list_departments(), &department/1)})
  end

  # Owner-only: set a department's palette color (or other fields).
  def update(conn, %{"id" => id} = params) do
    if Authz.owner?(conn.assigns.current_user) do
      department = Accounts.get_department!(id)

      with {:ok, updated} <- Accounts.update_department(department, Map.drop(params, ["id"])) do
        json(conn, %{data: department(updated)})
      end
    else
      conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
    end
  end
end
