defmodule RockcutApiWeb.YeastController do
  @moduledoc """
  D64: the batches a pitch names (`GET /api/yeast/batches`), for the Pitch
  dialog's picker and the movement list's "→ Galactic #41". Every batch,
  newest first, each with its label ("Galactic #41", "Altruism P1") and
  whether it's open (not completed or dumped; the picker offers only those).
  Stop 3: `GET /api/yeast/batches/:id`, the batch page's Yeast section
  (spec §6.6, `Yeast.Generations.batch_page/1`).
  Brewery members and owners (the `:brewery` plug and `Authz`
  `:ingredients`); no device.
  """
  use RockcutApiWeb, :controller

  import Ecto.Query

  alias RockcutApi.{Authz, Repo}
  alias RockcutApi.Brewing.Batch
  alias RockcutApi.Production.Batches
  alias RockcutApi.Yeast.{Generations, LotPitches}

  action_fallback RockcutApiWeb.FallbackController

  def batches(conn, _params) do
    if Authz.can?(conn.assigns.current_user, :read, :ingredients) do
      pnums = Batches.p_numbers()

      batches =
        from(b in Batch,
          order_by: [desc: b.inserted_at, desc: b.id],
          preload: [:brand, :split_parent]
        )
        |> Repo.all()
        |> Enum.map(fn b ->
          %{
            id: b.id,
            label: String.trim(Batches.label(b, pnums)),
            number: Batches.number_label(b, pnums),
            status: b.status,
            open: b.status not in ["completed", "dumped"]
          }
        end)

      json(conn, %{data: batches})
    else
      {:error, :forbidden}
    end
  end

  def batch(conn, %{"id" => id}) do
    with :ok <- allow(conn),
         id when is_integer(id) <- RockcutApi.Ids.parse(id) || {:error, :not_found},
         %Batch{} <- Repo.get(Batch, id) || {:error, :not_found} do
      json(conn, %{data: Generations.batch_page(id, conn.assigns.current_user)})
    end
  end

  @doc "DELETE /api/yeast/pitches/:id: take back a mistaken lot pitch (`LotPitches`)."
  def remove_pitch(conn, %{"id" => id}) do
    with :ok <- allow(conn, :write),
         {:ok, _} <- LotPitches.remove(id, conn.assigns.current_user) do
      send_resp(conn, :no_content, "")
    end
  end

  defp allow(conn, action \\ :read) do
    if Authz.can?(conn.assigns.current_user, action, :ingredients),
      do: :ok,
      else: {:error, :forbidden}
  end
end
