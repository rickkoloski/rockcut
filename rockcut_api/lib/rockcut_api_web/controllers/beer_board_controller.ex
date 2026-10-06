defmodule RockcutApiWeb.BeerBoardController do
  @moduledoc """
  The Buy-a-Beer Board (D37 §3.4) for Taproom staff and the Taproom tablet.

  These routes are in the router's `:device_allowed` scope. On a shared
  device every write needs a `staff_code`: the change is then decided for, and
  logged as, the person it belongs to, with the device recorded beside them.
  Wrong codes are rate-limited per tablet token (`StaffCodes.RateLimiter`).
  """
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [beer_board_entry: 1, for_viewer: 2]
  alias RockcutApi.{Authz, BeerBoard, StaffCodes}
  alias RockcutApi.StaffCodes.RateLimiter

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, _params) do
    if Authz.can?(conn.assigns.current_user, :read, :beer_board) do
      data = Enum.map(BeerBoard.list_entries(), &beer_board_entry/1)
      json(conn, for_viewer(%{data: data}, conn.assigns.current_user))
    else
      forbidden(conn)
    end
  end

  def create(conn, params) do
    with {:ok, person, device} <- acting(conn, params),
         {:ok, entry} <- BeerBoard.create(params, person, device) do
      conn |> put_status(:created) |> respond(entry, person, device)
    end
    |> handle(conn)
  end

  def redeem(conn, %{"id" => id} = params) do
    with {:ok, person, device} <- acting(conn, params),
         {:ok, result} <- BeerBoard.redeem(id, params["count"], person, device) do
      respond(conn, result, person, device)
    end
    |> handle(conn)
  end

  def update(conn, %{"id" => id} = params) do
    with {:ok, person, device} <- acting(conn, params),
         {:ok, entry} <- BeerBoard.update(id, params, person, device) do
      respond(conn, entry, person, device)
    end
    |> handle(conn)
  end

  def delete(conn, %{"id" => id} = params) do
    with {:ok, person, device} <- acting(conn, params),
         {:ok, :removed} <- BeerBoard.delete(id, person, device) do
      respond(conn, :removed, person, device)
    end
    |> handle(conn)
  end

  # The person making a write: the signed-in person, or on a shared device the
  # owner of the staff code (D37 §3.3). Returns {:ok, person, device_or_nil}.
  defp acting(conn, params) do
    user = conn.assigns.current_user

    if Authz.device?(user) do
      key = conn.assigns.device_token.id

      with :ok <- RateLimiter.check(key),
           {:ok, code} <- code_param(params),
           {:ok, person} <- resolve(code, key) do
        authorize(person, user)
      end
    else
      authorize(user, nil)
    end
  end

  defp code_param(%{"staff_code" => code}) when is_binary(code) and code != "", do: {:ok, code}
  defp code_param(_), do: {:error, :staff_code_required}

  defp resolve(code, key) do
    case StaffCodes.resolve(code) do
      nil ->
        case RateLimiter.failure(key) do
          :ok -> {:error, :staff_code_invalid}
          {:locked, _} = locked -> locked
        end

      person ->
        {:ok, person}
    end
  end

  defp authorize(person, device) do
    if Authz.can?(person, :write, :beer_board),
      do: {:ok, person, device},
      else: {:error, :forbidden}
  end

  defp respond(conn, result, person, device) do
    data = if result == :removed, do: nil, else: beer_board_entry(result)
    body = %{data: data, removed: result == :removed}
    body = if device, do: Map.put(body, :recorded_as, person.name), else: body
    json(conn, for_viewer(body, conn.assigns.current_user))
  end

  defp handle(%Plug.Conn{} = conn, _), do: conn
  defp handle({:error, %Ecto.Changeset{}} = error, _conn), do: error

  defp handle({:error, :not_found}, conn),
    do: error(conn, 404, "gone", "This entry was already removed")

  defp handle({:error, :forbidden}, conn), do: forbidden(conn)

  defp handle({:error, :invalid_count}, conn),
    do: error(conn, 422, "invalid_count", "Redeem 1 to 99 beers")

  defp handle({:error, {:only, left}}, conn),
    do: error(conn, 422, "not_enough", "Only #{left} left")

  defp handle({:error, :staff_code_required}, conn),
    do: error(conn, 422, "staff_code_required", "Enter your staff code")

  defp handle({:error, :staff_code_invalid}, conn),
    do: error(conn, 422, "staff_code_invalid", "That staff code isn't right")

  defp handle({:locked, seconds}, conn) do
    minutes = max(div(seconds + 59, 60), 1)

    conn
    |> put_status(:too_many_requests)
    |> json(%{
      error: "staff_code_locked",
      retry_after_minutes: minutes,
      message:
        "Too many wrong codes. Try again in #{minutes} #{if minutes == 1, do: "minute", else: "minutes"}, or use Sign in as me."
    })
  end

  defp error(conn, status, code, message),
    do: conn |> put_status(status) |> json(%{error: code, message: message})

  defp forbidden(conn), do: conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
end
