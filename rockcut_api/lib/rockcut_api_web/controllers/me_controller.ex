defmodule RockcutApiWeb.MeController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [me: 3]
  alias RockcutApi.Accounts

  def show(conn, _params) do
    user = conn.assigns.current_user
    json(conn, me(user, Accounts.capabilities(user), Accounts.shared_devices?(user)))
  end
end
