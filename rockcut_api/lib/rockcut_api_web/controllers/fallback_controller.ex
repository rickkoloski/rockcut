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
