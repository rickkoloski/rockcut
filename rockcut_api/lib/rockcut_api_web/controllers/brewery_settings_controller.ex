defmodule RockcutApiWeb.BrewerySettingsController do
  @moduledoc """
  D63 §6.2: the brewery's settings (`/api/brewery_settings`, flat params).
  Brewery members, owners and the brewhouse device read them (no staff
  code); Brewery managers and owners change them (`Authz`
  `:brewery_settings`). The PUT is a people-only route.
  """
  use RockcutApiWeb, :controller

  alias RockcutApi.{Authz, BrewerySettings}
  alias RockcutApi.BrewerySettings.Settings

  action_fallback RockcutApiWeb.FallbackController

  def show(conn, _params) do
    with :ok <- allow(conn, :read),
         do: json(conn, body(conn, BrewerySettings.get()))
  end

  def update(conn, params) do
    with :ok <- allow(conn, :manage) do
      case BrewerySettings.update(params, conn.assigns.current_user) do
        {:ok, settings} ->
          json(conn, body(conn, settings))

        {:error, {:stale, message, settings}} ->
          conn
          |> put_status(:conflict)
          |> json(Map.put(body(conn, settings), :errors, %{base: [message]}))

        {:error, _} = error ->
          error
      end
    end
  end

  defp body(conn, settings) do
    %{
      data: data(settings),
      can_manage: Authz.can?(conn.assigns.current_user, :manage, :brewery_settings)
    }
  end

  defp data(s) do
    numbers = Map.new(Settings.number_fields(), &{&1, plain(Map.fetch!(s, &1))})

    s
    |> Map.take(Settings.equation_fields() ++ [:source_water_name, :lock_version, :updated_at])
    |> Map.merge(numbers)
    |> Map.put(:updated_by, s.updated_by && %{id: s.updated_by.id, name: s.updated_by.name})
  end

  # "202", "0.09375": no exponent, no trailing zeros.
  defp plain(d), do: d |> Decimal.normalize() |> Decimal.to_string(:normal)

  defp allow(conn, action) do
    if Authz.can?(conn.assigns.current_user, action, :brewery_settings),
      do: :ok,
      else: {:error, :forbidden}
  end
end
