defmodule RockcutApiWeb.DepartmentController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [department: 1]
  alias RockcutApi.Accounts

  def index(conn, _params) do
    json(conn, %{data: Enum.map(Accounts.list_departments(), &department/1)})
  end
end
