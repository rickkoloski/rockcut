defmodule RockcutApiWeb.UserController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [user: 1]
  alias RockcutApi.{Accounts, Authz}

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, _params) do
    actor = conn.assigns.current_user

    if Authz.can_manage_any?(actor) do
      json(conn, %{data: Enum.map(Accounts.list_users_for(actor), &user/1)})
    else
      forbidden(conn)
    end
  end

  def create(conn, params) do
    actor = conn.assigns.current_user

    if Authz.can_manage_any?(actor) do
      case Accounts.create_user(params, actor) do
        {:ok, u, temp_password} ->
          conn |> put_status(:created) |> json(%{data: user(u), temp_password: temp_password})

        {:error, {:unauthorized_department, key}} ->
          forbidden(conn, "Cannot assign roles in department: #{key}")

        {:error, {:invalid_membership, msg}} ->
          unprocessable(conn, %{memberships: [msg]})

        {:error, %Ecto.Changeset{} = cs} ->
          {:error, cs}
      end
    else
      forbidden(conn)
    end
  end

  def update(conn, %{"id" => id} = params) do
    actor = conn.assigns.current_user

    case Accounts.get_user(id) do
      nil ->
        {:error, :not_found}

      target ->
        if Accounts.can_manage_user?(actor, target) do
          attrs = params |> Map.drop(["id"]) |> maybe_drop_owner_flag(actor)

          case Accounts.update_user(target, attrs, actor) do
            {:ok, u} ->
              json(conn, %{data: user(u)})

            {:error, :last_owner} ->
              unprocessable(conn, %{base: ["Cannot demote or deactivate the last owner"]})

            {:error, %Ecto.Changeset{} = cs} ->
              {:error, cs}
          end
        else
          forbidden(conn)
        end
    end
  end

  def reset_password(conn, %{"id" => id}) do
    actor = conn.assigns.current_user

    case Accounts.get_user(id) do
      nil ->
        {:error, :not_found}

      target ->
        if Accounts.can_manage_user?(actor, target) do
          case Accounts.reset_password(target, actor) do
            {:ok, u, temp_password} -> json(conn, %{data: user(u), temp_password: temp_password})
            {:error, %Ecto.Changeset{} = cs} -> {:error, cs}
          end
        else
          forbidden(conn)
        end
    end
  end

  # Only owners may set/clear the global owner flag.
  defp maybe_drop_owner_flag(attrs, actor) do
    if Authz.owner?(actor), do: attrs, else: Map.drop(attrs, ["is_owner"])
  end

  defp forbidden(conn, msg \\ "Forbidden") do
    conn |> put_status(:forbidden) |> json(%{error: msg})
  end

  defp unprocessable(conn, errors) do
    conn |> put_status(:unprocessable_entity) |> json(%{errors: errors})
  end
end
