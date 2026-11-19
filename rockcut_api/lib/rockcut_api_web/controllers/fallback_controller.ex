defmodule RockcutApiWeb.FallbackController do
  use RockcutApiWeb, :controller

  def call(conn, {:error, %Ecto.Changeset{} = changeset}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{errors: format_changeset_errors(changeset)})
  end

  # D33: shared devices are managed under Shared devices, not Users & Roles.
  def call(conn, {:error, :device_account}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{errors: %{base: ["Shared devices are managed under Shared devices"]}})
  end

  # D60: a rule `RockcutApi.Ingredients` refuses, shaped like a changeset's errors.
  def call(conn, {:error, {:invalid, errors}}) when is_map(errors) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{errors: errors})
  end

  # D61: a write on a record whose state no longer allows it (an order
  # already received or cancelled).
  def call(conn, {:error, {:conflict, message}}) when is_binary(message) do
    conn
    |> put_status(:conflict)
    |> json(%{errors: %{base: [message]}})
  end

  # D61: an `Authz` refusal inside a module (contracts are managers' to write).
  def call(conn, {:error, :forbidden}) do
    conn
    |> put_status(:forbidden)
    |> json(%{error: "Forbidden"})
  end

  def call(conn, {:error, :not_found}) do
    conn
    |> put_status(:not_found)
    |> json(%{errors: %{detail: "Not found"}})
  end

  defp format_changeset_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
