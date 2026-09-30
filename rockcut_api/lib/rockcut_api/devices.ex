defmodule RockcutApi.Devices do
  @moduledoc """
  Shared devices (D33): device accounts, pairing codes and per-tablet tokens.

    * A device account is a `users` row whose kind is "device" (see
      `RockcutApi.Accounts.User.device_create_changeset/1`). Owners create,
      rename, deactivate and delete them.
    * Owners and managers of the device's home department generate a pairing
      code (8 characters, single use, 10 minutes). A tablet exchanges it for a
      `dev_` token, shown once.
    * Codes and tokens are stored only as HMAC-SHA256 hashes keyed by the
      endpoint secret, so a lookup is one indexed query.
    * A token has no expiry; revocation (or deactivating the account) is the
      control, and `AuthPlug` checks both on every request.
  """
  import Ecto.Query
  alias RockcutApi.{Accounts, Authz, Repo}
  alias RockcutApi.Accounts.User
  alias RockcutApi.Devices.{DeviceToken, PairingCode, PairingRateLimiter}

  # No look-alikes: no 0/O, 1/I/L.
  @code_alphabet ~c"ABCDEFGHJKMNPQRSTUVWXYZ23456789"
  @code_length 8
  @code_ttl_seconds 10 * 60
  @token_prefix "dev_"
  @seen_every_seconds 60

  def code_ttl_seconds, do: @code_ttl_seconds
  def token_prefix, do: @token_prefix

  ## Device accounts

  @doc "Device accounts `actor` may see: all for owners, their departments' for managers."
  def list_devices(%User{} = actor) do
    case Authz.scope(actor, :devices, :manage) do
      :none ->
        []

      :all ->
        devices_query() |> load_devices()

      {:departments, ids} ->
        devices_query() |> where([u], u.home_department_id in ^ids) |> load_devices()
    end
  end

  @doc "A device account by id (nil for a person or a missing id)."
  def get_device(id) do
    devices_query()
    |> where([u], u.id == ^id)
    |> Repo.one()
    |> case do
      nil -> nil
      device -> preload_device(device)
    end
  end

  def create_device(attrs, %User{} = actor) do
    Repo.transaction(fn ->
      case attrs |> stringify() |> User.device_create_changeset() |> Repo.insert() do
        {:ok, device} ->
          Accounts.record_audit(actor.id, device.id, "device.created", %{
            "name" => device.name,
            "home_department_id" => device.home_department_id
          })

          preload_device(device)

        {:error, cs} ->
          Repo.rollback(cs)
      end
    end)
  end

  @doc "Rename, move or (de)activate a device. Deactivating signs out every tablet at its next request."
  def update_device(%User{} = device, attrs, %User{} = actor) do
    changeset = User.device_update_changeset(device, stringify(attrs))

    Repo.transaction(fn ->
      case Repo.update(changeset) do
        {:ok, updated} ->
          action =
            case Ecto.Changeset.get_change(changeset, :active) do
              false -> "device.deactivated"
              true -> "device.reactivated"
              nil -> "device.updated"
            end

          Accounts.record_audit(actor.id, updated.id, action, %{
            "name" => updated.name,
            "fields" => changeset.changes |> Map.keys() |> Enum.map(&to_string/1)
          })

          preload_device(updated)

        {:error, cs} ->
          Repo.rollback(cs)
      end
    end)
  end

  @doc "Delete a device account with its tokens, codes and channel reads."
  def delete_device(%User{} = device, %User{} = actor) do
    Repo.transaction(fn ->
      Accounts.record_audit(actor.id, device.id, "device.deleted", %{"name" => device.name})
      Repo.delete!(device)
      :ok
    end)
  end

  ## Pairing

  @doc "A fresh pairing code for `device`: `{:ok, \"ABCD-EFGH\", expires_at}`."
  def create_pairing_code(%User{} = device, %User{} = actor, now \\ now()) do
    code = random_code()
    expires_at = DateTime.add(now, @code_ttl_seconds)

    Repo.transaction(fn ->
      Repo.insert!(%PairingCode{
        user_id: device.id,
        created_by_id: actor.id,
        code_hash: hash(code),
        expires_at: expires_at
      })

      Accounts.record_audit(actor.id, device.id, "device.pairing_code", %{"name" => device.name})
      {format_code(code), expires_at}
    end)
    |> case do
      {:ok, {code, expires_at}} -> {:ok, code, expires_at}
      other -> other
    end
  end

  @doc """
  Exchange a pairing code for a tablet token. Returns `{:ok, plain_token,
  %DeviceToken{}}`, `{:error, :rate_limited}`, `{:error, :invalid_name}` or
  `{:error, :invalid_code}` (one error for wrong, used, expired and inactive:
  no oracle). Wrong codes count against `ip`.
  """
  def exchange_code(code, tablet_name, ip, now \\ now()) do
    name = tablet_name |> to_string() |> String.trim()

    cond do
      PairingRateLimiter.limited?(ip) ->
        {:error, :rate_limited}

      name == "" or String.length(name) > 60 ->
        {:error, :invalid_name}

      true ->
        case redeem(normalize_code(code), name, now) do
          {:ok, _token, _row} = ok ->
            ok

          {:error, :invalid_code} = error ->
            PairingRateLimiter.record_failure(ip)
            error
        end
    end
  end

  defp redeem(code, name, now) do
    Repo.transaction(
      fn ->
        with %PairingCode{} = pc <- find_live_code(code, now),
             %User{active: true} = device <- get_device(pc.user_id) do
          pc |> Ecto.Changeset.change(used_at: now) |> Repo.update!()
          {token, row} = issue_token(device, name, pc.created_by_id, now)

          Accounts.record_audit(pc.created_by_id, device.id, "device.paired", %{
            "name" => device.name,
            "tablet" => name
          })

          {token, row}
        else
          _ -> Repo.rollback(:invalid_code)
        end
      end,
      mode: :immediate
    )
    |> case do
      {:ok, {token, row}} -> {:ok, token, row}
      {:error, :invalid_code} -> {:error, :invalid_code}
    end
  end

  defp find_live_code("", _now), do: nil

  defp find_live_code(code, now) do
    Repo.one(
      from(pc in PairingCode,
        where: pc.code_hash == ^hash(code) and is_nil(pc.used_at) and pc.expires_at > ^now
      )
    )
  end

  @doc """
  Insert a token row for `device` and return `{plain_token, row}`. The plain
  token is never stored. Used by pairing and by the synthetic persona mint.
  """
  def issue_token(%User{} = device, name, paired_by_id, now \\ now()) do
    token = @token_prefix <> (:crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false))

    row =
      Repo.insert!(%DeviceToken{
        user_id: device.id,
        name: name,
        token_hash: hash(token),
        paired_by_id: paired_by_id,
        inserted_at: now,
        updated_at: now
      })

    {token, row}
  end

  ## Tokens

  @doc """
  Resolve a `dev_` bearer token to `{:ok, device_user, token_row}`, or
  `:error` when it's unknown, revoked, or its account is inactive or not a
  device. Touches `last_seen_at` at most once a minute.
  """
  def authenticate_token(token, now \\ now())

  def authenticate_token(@token_prefix <> _ = token, now) do
    with %DeviceToken{revoked_at: nil} = row <-
           Repo.one(from(t in DeviceToken, where: t.token_hash == ^hash(token))),
         %User{active: true} = device <- Accounts.get_user(row.user_id),
         true <- Authz.device?(device) do
      touch(row, now)
      {:ok, device, row}
    else
      _ -> :error
    end
  end

  def authenticate_token(_token, _now), do: :error

  defp touch(%DeviceToken{last_seen_at: seen} = row, now) do
    if is_nil(seen) or DateTime.diff(now, seen) >= @seen_every_seconds do
      cutoff = DateTime.add(now, -@seen_every_seconds)

      from(t in DeviceToken,
        where: t.id == ^row.id and (is_nil(t.last_seen_at) or t.last_seen_at <= ^cutoff)
      )
      |> Repo.update_all(set: [last_seen_at: now])
    end

    :ok
  end

  def get_token(id), do: Repo.get(DeviceToken, id)

  @doc "Revoke a tablet token (a manager's Revoke, or the tablet signing out)."
  def revoke_token(%DeviceToken{} = row, %User{} = actor, now \\ now()) do
    Repo.transaction(fn ->
      updated = row |> Ecto.Changeset.change(revoked_at: row.revoked_at || now) |> Repo.update!()
      device = Repo.get!(User, row.user_id)
      action = if actor.id == device.id, do: "device.signed_out", else: "device.revoked"

      Accounts.record_audit(actor.id, device.id, action, %{
        "name" => device.name,
        "tablet" => row.name
      })

      updated
    end)
  end

  ## Helpers

  @doc "HMAC-SHA256 of a code or token, keyed by the endpoint secret."
  def hash(value) do
    secret = Application.fetch_env!(:rockcut_api, RockcutApiWeb.Endpoint)[:secret_key_base]
    :crypto.mac(:hmac, :sha256, secret, value)
  end

  @doc "Upper-case a typed code and drop spaces and dashes."
  def normalize_code(code) when is_binary(code),
    do: code |> String.upcase() |> String.replace(~r/[\s-]/, "")

  def normalize_code(_), do: ""

  # OS CSPRNG with rejection sampling: bytes 0..247 map evenly onto the 31
  # characters (248 = 31 × 8); 248..255 are thrown away, so there's no modulo bias.
  @code_alphabet_size length(@code_alphabet)
  @code_byte_limit div(256, @code_alphabet_size) * @code_alphabet_size

  defp random_code, do: random_code(@code_length, "")

  defp random_code(0, acc), do: acc

  defp random_code(n, acc) do
    acc =
      for <<b <- :crypto.strong_rand_bytes(n)>>, b < @code_byte_limit, reduce: acc do
        acc -> acc <> <<Enum.at(@code_alphabet, rem(b, @code_alphabet_size))>>
      end

    random_code(@code_length - byte_size(acc), acc)
  end

  defp format_code(<<a::binary-size(4), b::binary-size(4)>>), do: a <> "-" <> b

  defp devices_query do
    # authz-boundary: data invariant (the Shared devices list is device rows)
    from(u in User, where: u.kind == "device", order_by: [asc: u.name])
  end

  defp load_devices(query), do: query |> Repo.all() |> Enum.map(&preload_device/1)

  defp preload_device(device) do
    tokens = from(t in DeviceToken, order_by: [desc: t.inserted_at], preload: :paired_by)

    Repo.preload(device, [:home_department, memberships: :department, device_tokens: tokens],
      force: true
    )
  end

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second)

  defp stringify(map), do: Map.new(map, fn {k, v} -> {to_string(k), v} end)
end
