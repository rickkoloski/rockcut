defmodule RockcutApiWeb.StaffCodeController do
  @moduledoc """
  D37 §3.2: staff codes in the Users & Roles edit dialog. Owners and the
  managers of a department the person belongs to set, reveal and remove an
  employee's code (any department since D40); `suggest` offers an unused one
  to anyone who sets codes. People only (the `:authenticated` scope): a shared device never
  reaches these routes.
  """
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [user: 1]
  alias RockcutApi.{Accounts, StaffCodes}
  alias RockcutApi.Accounts.User

  action_fallback RockcutApiWeb.FallbackController

  # GET /api/users/:id/staff_code (the dialog's eye toggle; audited)
  def show(conn, %{"id" => id}) do
    with %User{} = target <- Accounts.get_user(id) || {:error, :not_found} do
      case StaffCodes.reveal(target, conn.assigns.current_user) do
        {:ok, code} -> json(conn, %{data: %{code: code}})
        {:error, :forbidden} -> forbidden(conn)
      end
    end
  end

  # PUT /api/users/:id/staff_code {code}
  def update(conn, %{"id" => id} = params) do
    with %User{} = target <- Accounts.get_user(id) || {:error, :not_found} do
      case StaffCodes.set(target, Map.get(params, "code"), conn.assigns.current_user) do
        {:ok, u} ->
          json(conn, %{data: user(Accounts.get_user!(u.id))})

        {:error, :forbidden} ->
          forbidden(conn)

        {:error, :not_eligible} ->
          invalid(conn, "Only active staff in a department can have a staff code")

        {:error, :invalid_code} ->
          invalid(conn, "A staff code is 4 digits")

        {:error, :code_in_use} ->
          invalid(conn, "That code is already in use")
      end
    end
  end

  # DELETE /api/users/:id/staff_code
  def delete(conn, %{"id" => id}) do
    with %User{} = target <- Accounts.get_user(id) || {:error, :not_found} do
      case StaffCodes.remove(target, conn.assigns.current_user) do
        {:ok, u} -> json(conn, %{data: user(Accounts.get_user!(u.id))})
        {:error, :forbidden} -> forbidden(conn)
      end
    end
  end

  # GET /api/staff_codes/suggest
  def suggest(conn, _params) do
    if StaffCodes.can_manage?(conn.assigns.current_user) do
      case StaffCodes.suggest() do
        {:ok, code} -> json(conn, %{data: %{code: code}})
        {:error, :none_available} -> invalid(conn, "No unused code found. Type one instead.")
      end
    else
      forbidden(conn)
    end
  end

  defp forbidden(conn), do: conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})

  defp invalid(conn, msg),
    do: conn |> put_status(:unprocessable_entity) |> json(%{errors: %{code: [msg]}})
end
