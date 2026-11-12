defmodule RockcutApiWeb.MembershipController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [user_for: 2]
  alias RockcutApi.{Accounts, Authz}

  action_fallback RockcutApiWeb.FallbackController

  @doc """
  Declaratively set a user's memberships (PUT /api/users/:user_id/memberships).
  A manager changes only departments they manage; the person's others stay
  (D58 §3.3: Add department on someone they don't manage only adds).
  """
  def update(conn, %{"user_id" => id} = params) do
    actor = conn.assigns.current_user

    case Accounts.get_user(id) do
      nil ->
        {:error, :not_found}

      target ->
        if Authz.can?(actor, :set, :memberships) do
          desired = Map.get(params, "memberships", [])

          case Accounts.set_memberships(target, desired, actor) do
            {:ok, u} ->
              json(conn, %{data: user_for(u, actor)})

            {:error, :device_account} = error ->
              error

            # D59 gap 6: no department key, so a manager isn't told Owners exists.
            {:error, {:unauthorized_department, _key}} ->
              conn
              |> put_status(:forbidden)
              |> json(%{error: "You can't assign roles in that department"})

            {:error, {:invalid_membership, msg}} ->
              conn |> put_status(:unprocessable_entity) |> json(%{errors: %{memberships: [msg]}})

            {:error, %Ecto.Changeset{} = cs} ->
              {:error, cs}
          end
        else
          conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
        end
    end
  end
end
