defmodule RockcutApiWeb.MeController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [me: 2]
  alias RockcutApi.Accounts

  def show(conn, _params) do
    user = conn.assigns.current_user
    json(conn, me(user, Accounts.capabilities(user)))
  end
end
