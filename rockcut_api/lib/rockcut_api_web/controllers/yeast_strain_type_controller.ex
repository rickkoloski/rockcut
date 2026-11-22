defmodule RockcutApiWeb.YeastStrainTypeController do
  @moduledoc """
  D64 (spec §6.5, A13): the Strain Type list, `/api/yeast/strain_types`
  (flat params: `name`, `position`, `active`). Brewery members and owners
  read it (`can_manage` says whether this person may change it); Brewery
  managers and owners create, change and delete (`Authz` `:yeast_settings`).
  No device does either (the `:brewery` plug and `Authz.Device`).
  """
  use RockcutApiWeb, :controller

  alias RockcutApi.Authz
  alias RockcutApi.Yeast.StrainTypes

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, _params) do
    with :ok <- allow(conn, :read) do
      json(conn, %{
        data: Enum.map(StrainTypes.list(), &strain_type/1),
        can_manage: Authz.can?(conn.assigns.current_user, :manage, :yeast_settings)
      })
    end
  end

  def create(conn, params) do
    with :ok <- allow(conn, :manage),
         {:ok, type} <- StrainTypes.create(params) do
      conn |> put_status(:created) |> json(%{data: strain_type(type)})
    end
  end

  def update(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :manage),
         %{} = type <- StrainTypes.get(id) || {:error, :not_found},
         {:ok, type} <- StrainTypes.update(type, Map.delete(params, "id")) do
      json(conn, %{data: strain_type(type)})
    end
  end

  def delete(conn, %{"id" => id}) do
    with :ok <- allow(conn, :manage),
         %{} = type <- StrainTypes.get(id) || {:error, :not_found},
         {:ok, _} <- StrainTypes.delete(type) do
      send_resp(conn, :no_content, "")
    end
  end

  defp strain_type(t) do
    %{
      id: t.id,
      name: t.name,
      position: t.position,
      active: is_nil(t.retired_at),
      retired_at: t.retired_at,
      in_use: t.in_use
    }
  end

  defp allow(conn, action) do
    if Authz.can?(conn.assigns.current_user, action, :yeast_settings),
      do: :ok,
      else: {:error, :forbidden}
  end
end
