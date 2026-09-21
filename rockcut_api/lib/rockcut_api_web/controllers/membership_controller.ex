defmodule RockcutApiWeb.MembershipController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [user: 1]
  alias RockcutApi.{Accounts, Authz}

  action_fallback RockcutApiWeb.FallbackController

  @doc "Declaratively set a user's memberships (PUT /api/users/:user_id/memberships)."
  def update(conn, %{"user_id" => id} = params) do
    actor = conn.assigns.current_user

    case Accounts.get_user(id) do
      nil ->
        {:error, :not_found}

      target ->
        if Authz.can_manage_any?(actor) do
          desired = Map.get(params, "memberships", [])

          case Accounts.set_memberships(target, desired, actor) do
            {:ok, u} ->
              json(conn, %{data: user(u)})

            {:error, {:unauthorized_department, key}} ->
              conn |> put_status(:forbidden) |> json(%{error: "Cannot manage department: #{key}"})

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
