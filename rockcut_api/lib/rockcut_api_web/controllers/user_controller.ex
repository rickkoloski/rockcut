defmodule RockcutApiWeb.UserController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [user_for: 2, user_for: 3]
  alias RockcutApi.{Accounts, Authz}
  alias RockcutApi.Accounts.User

  action_fallback RockcutApiWeb.FallbackController

  @not_yours "You can manage this person only in your departments"

  def index(conn, _params) do
    actor = conn.assigns.current_user

    if Authz.can?(actor, :list, %User{}) do
      departments = Accounts.list_departments()

      json(conn, %{
        data: Enum.map(Accounts.list_users_for(actor), &user_for(&1, actor, departments))
      })
    else
      forbidden(conn)
    end
  end

  def create(conn, params) do
    actor = conn.assigns.current_user

    if Authz.can?(actor, :create, %User{}) do
      case Accounts.create_user(params, actor) do
        {:ok, u, temp_password} ->
          conn
          |> put_status(:created)
          |> json(%{data: user_for(u, actor), temp_password: temp_password})

        # D59 gap 6: no department key, so a manager isn't told Owners exists.
        {:error, {:unauthorized_department, _key}} ->
          forbidden(conn, "You can't assign roles in that department")

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
        attrs = params |> Map.drop(["id"]) |> maybe_drop_owner_flag(actor, target)

        if may_update?(actor, target, attrs) do
          case Accounts.update_user(target, attrs, actor) do
            {:ok, u} ->
              json(conn, %{data: user_for(u, actor)})

            {:error, :device_account} = error ->
              error

            {:error, :last_owner} ->
              unprocessable(conn, %{base: ["Cannot demote or deactivate the last owner"]})

            {:error, :cannot_deactivate} ->
              forbidden(conn, @not_yours)

            {:error, %Ecto.Changeset{} = cs} ->
              {:error, cs}
          end
        else
          not_yours(conn, actor)
        end
    end
  end

  def reset_password(conn, %{"id" => id}) do
    actor = conn.assigns.current_user

    case Accounts.get_user(id) do
      nil ->
        {:error, :not_found}

      target ->
        if Authz.can?(actor, :reset_password, target) do
          case Accounts.reset_password(target, actor) do
            {:ok, u, temp_password} ->
              json(conn, %{data: user_for(u, actor), temp_password: temp_password})

            {:error, :device_account} = error ->
              error

            {:error, %Ecto.Changeset{} = cs} ->
              {:error, cs}
          end
        else
          not_yours(conn, actor)
        end
    end
  end

  # D58 §3.3: a person the actor manages (a shared managed department) is
  # theirs to change; on anyone else, only Active, and only where `Authz`
  # allows deactivating (which `Accounts.update_user/3` checks again).
  defp may_update?(actor, target, attrs) do
    cond do
      Authz.can?(actor, :update, target) -> true
      Map.keys(attrs) == ["active"] -> Authz.can?(actor, :deactivate, target)
      true -> false
    end
  end

  # A manager is told why; anyone else just "Forbidden".
  defp not_yours(conn, actor) do
    if Authz.can?(actor, :list, %User{}), do: forbidden(conn, @not_yours), else: forbidden(conn)
  end

  # Only owners may set/clear the global owner flag.
  defp maybe_drop_owner_flag(attrs, actor, target) do
    if Authz.can?(actor, :set_owner, target), do: attrs, else: Map.drop(attrs, ["is_owner"])
  end

  defp forbidden(conn, msg \\ "Forbidden") do
    conn |> put_status(:forbidden) |> json(%{error: msg})
  end

  defp unprocessable(conn, errors) do
    conn |> put_status(:unprocessable_entity) |> json(%{errors: errors})
  end
end
