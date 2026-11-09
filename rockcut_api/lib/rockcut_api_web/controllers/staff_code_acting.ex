defmodule RockcutApiWeb.StaffCodeActing do
  @moduledoc """
  Who a write is for (D37 §3.3; shared by the Buy-a-Beer Board and, since
  D40, the task boards): the signed-in person, or on a shared device the
  person whose `staff_code` came with the request. The device itself never
  writes anything; the change is decided for, and logged as, that person,
  with the device recorded beside them.

  On a device:
    * a locked tablet is refused before its code is checked (429
      `staff_code_locked`, `StaffCodes.RateLimiter`, keyed by the tablet's
      token);
    * no code in the JSON body → 422 `staff_code_required` (a `staff_code`
      in the query string doesn't count: URLs end up in logs; D40 DEV qa);
    * a code that resolves to nobody is a wrong code: 422
      `staff_code_invalid`, counted toward the lock;
    * a code that resolves to someone who may not make this write
      (`Authz.can?(person, :write, resource)`: on a task board, a member of
      the tablet's home department) is 422 `staff_code_not_allowed`, "That
      staff code can't do this here", **not** counted (D50 lead decisions 3,
      gap 1: a Taproom person retrying their right code mustn't lock the
      brewers out). The lock is checked first, so a locked tablet never says
      whether a code is real.

  The server keeps no "acting as" state: the tablet sends the code with every
  write (D40 plan decision 3).

  D50: the brewhouse device's production writes use it too (`:production`),
  so the board and the schedule share one wrong-code counter per tablet.
  """
  import Plug.Conn, only: [put_status: 2]
  import Phoenix.Controller, only: [json: 2]

  alias RockcutApi.{Authz, StaffCodes}
  alias RockcutApi.StaffCodes.RateLimiter

  @doc """
  `{:ok, person, device_or_nil}` for a write on `resource`, or
  `{:error, :forbidden | :staff_code_required | :staff_code_invalid |
  :staff_code_not_allowed}`, or `{:locked, seconds_left}`.
  """
  def acting(conn, resource) do
    user = conn.assigns.current_user

    if Authz.device?(user) do
      key = conn.assigns.device_token.id

      with :ok <- RateLimiter.check(key),
           {:ok, code} <- code_param(conn.body_params),
           {:ok, person} <- resolve(code, key, resource) do
        {:ok, person, user}
      end
    else
      if Authz.can?(user, :write, resource),
        do: {:ok, user, nil},
        else: {:error, :forbidden}
    end
  end

  @doc """
  `acting/2` as one person: `{:ok, person}` with `on_device_id` set to the
  device when the write came from one (D40's change log, D50's production
  rows), or `acting/2`'s refusal.
  """
  def actor(conn, resource) do
    with {:ok, person, device} <- acting(conn, resource),
         do: {:ok, %{person | on_device_id: device && device.id}}
  end

  # Only from the JSON body, never the query string: a URL ends up in proxy
  # and access logs (D40 DEV qa gap 1). A code in the query is a missing one.
  defp code_param(%{"staff_code" => code}) when is_binary(code) and code != "", do: {:ok, code}
  defp code_param(_), do: {:error, :staff_code_required}

  defp resolve(code, key, resource) do
    case StaffCodes.resolve(code) do
      nil -> wrong(key)
      person -> if Authz.can?(person, :write, resource), do: {:ok, person}, else: not_allowed()
    end
  end

  # A real person who may not make this write: refused, not counted.
  defp not_allowed, do: {:error, :staff_code_not_allowed}

  defp wrong(key) do
    case RateLimiter.failure(key) do
      :ok -> {:error, :staff_code_invalid}
      {:locked, _} = locked -> locked
    end
  end

  @doc """
  The response for a staff-code refusal, or `nil` for anything else (the
  caller's own errors).
  """
  def render_error({:error, :staff_code_required}, conn),
    do: error(conn, 422, "staff_code_required", "Enter your staff code")

  def render_error({:error, :staff_code_invalid}, conn),
    do: error(conn, 422, "staff_code_invalid", "That staff code isn't right")

  def render_error({:error, :staff_code_not_allowed}, conn),
    do: error(conn, 422, "staff_code_not_allowed", "That staff code can't do this here")

  def render_error({:locked, seconds}, conn) do
    minutes = max(div(seconds + 59, 60), 1)

    conn
    |> put_status(:too_many_requests)
    |> json(%{
      error: "staff_code_locked",
      retry_after_minutes: minutes,
      message:
        "Too many wrong codes. Try again in #{minutes} #{if minutes == 1, do: "minute", else: "minutes"}."
    })
  end

  def render_error(_other, _conn), do: nil

  defp error(conn, status, code, message),
    do: conn |> put_status(status) |> json(%{error: code, message: message})
end
