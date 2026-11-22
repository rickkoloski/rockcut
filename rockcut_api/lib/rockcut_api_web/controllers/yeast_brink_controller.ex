defmodule RockcutApiWeb.YeastBrinkController do
  @moduledoc """
  D64 §6.3–§6.5: the brinks (`/api/yeast/brinks`, flat params).

  * `index` (with state; `all=true` takes retired ones too) and `history`:
    Brewery members and owners (`Authz` `:ingredients` read), with
    `can_manage` for the settings.
  * `create` / `update` / `delete`: the settings, Brewery managers and owners
    (`:yeast_settings`).
  * `pitch` / `dump` / `adjust` / `clean`: stock actions, Brewery members and
    owners (`:ingredients` write).

  No device does any of it (the `:brewery` plug and `Authz.Device`).
  """
  use RockcutApiWeb, :controller

  alias RockcutApi.Authz
  alias RockcutApi.Yeast.{Brinks, Harvests}

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    with :ok <- allow(conn, :read, :ingredients) do
      json(conn, %{
        data: Brinks.list(all: params["all"] in ["true", true]),
        can_manage: Authz.can?(conn.assigns.current_user, :manage, :yeast_settings)
      })
    end
  end

  def history(conn, %{"id" => id}) do
    with :ok <- allow(conn, :read, :ingredients),
         %{} = brink <- Brinks.get(id) || {:error, :not_found} do
      json(conn, %{data: Brinks.history(brink)})
    end
  end

  def create(conn, params) do
    with :ok <- allow(conn, :manage, :yeast_settings),
         {:ok, brink} <- Brinks.create(params) do
      conn |> put_status(:created) |> json(%{data: one(brink.id)})
    end
  end

  def update(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :manage, :yeast_settings),
         %{} = brink <- Brinks.get(id) || {:error, :not_found},
         {:ok, brink} <- Brinks.update(brink, Map.delete(params, "id")) do
      json(conn, %{data: one(brink.id)})
    end
  end

  def delete(conn, %{"id" => id}) do
    with :ok <- allow(conn, :manage, :yeast_settings),
         %{} = brink <- Brinks.get(id) || {:error, :not_found},
         {:ok, _} <- Brinks.delete(brink) do
      send_resp(conn, :no_content, "")
    end
  end

  def pitch(conn, %{"id" => id} = params), do: act(conn, id, &Harvests.pitch(&1, params, &2))
  def dump(conn, %{"id" => id} = params), do: act(conn, id, &Harvests.dump(&1, params, &2))
  def adjust(conn, %{"id" => id} = params), do: act(conn, id, &Harvests.adjust(&1, params, &2))
  def clean(conn, %{"id" => id}), do: act(conn, id, &Harvests.clean(&1, &2))

  # A stock action; the reply is the brink with its state now.
  defp act(conn, id, fun) do
    with :ok <- allow(conn, :write, :ingredients),
         {:ok, _} <- fun.(id, conn.assigns.current_user) do
      json(conn, %{data: one(String.to_integer(id))})
    end
  end

  defp one(id), do: Enum.find(Brinks.list(all: true), &(&1.id == id))

  defp allow(conn, action, resource) do
    if Authz.can?(conn.assigns.current_user, action, resource),
      do: :ok,
      else: {:error, :forbidden}
  end
end
