defmodule RockcutApi.Sessions do
  @moduledoc """
  Revocable sign-in sessions for people (D34).

    * Signing in inserts a `user_sessions` row and hands out a `ses_` token,
      stored only as an HMAC hash (`RockcutApi.Tokens`).
    * A normal session lasts 30 days. A session started on a paired tablet
      ("Sign in as me") lasts at most 12 hours and dies after 15 minutes
      without a request, so one the tablet couldn't revoke still ends soon.
    * A tablet session also ends when its tablet's token is revoked, and is
      deleted with it.
    * Signing out revokes one session; `revoke_all/2` (password change or
      reset, "Sign out of all other devices") revokes the rest and also cuts
      off the user's pre-D34 tokens via `users.legacy_tokens_revoked_at`.
  """
  import Ecto.Query
  alias RockcutApi.{Accounts, Authz, Repo, Tokens}
  alias RockcutApi.Accounts.User
  alias RockcutApi.Devices.DeviceToken
  alias RockcutApi.Seeds.{Guard, Synthetic}
  alias RockcutApi.Sessions.UserSession

  @token_prefix "ses_"
  @max_age_seconds 30 * 24 * 60 * 60
  @tablet_max_age_seconds 12 * 60 * 60
  @tablet_idle_seconds 15 * 60
  @seen_every_seconds 60
  @prune_after_seconds 7 * 24 * 60 * 60

  def token_prefix, do: @token_prefix
  def tablet_idle_seconds, do: @tablet_idle_seconds

  @doc """
  Start a session for `user` and return `{plain_token, row}`. Options:

    * `:device_token` — the live `DeviceToken` of the tablet it was started
      on: marks it as a tablet session with the short lifetime.
    * `:max_age` — seconds, overriding the lifetime (synthetic personas).
  """
  def create(%User{} = user, opts \\ [], now \\ now()) do
    device_token = Keyword.get(opts, :device_token)

    max_age =
      Keyword.get_lazy(opts, :max_age, fn ->
        if device_token, do: @tablet_max_age_seconds, else: @max_age_seconds
      end)

    token = Tokens.random(@token_prefix)
    prune(user, now)

    row =
      Repo.insert!(%UserSession{
        user_id: user.id,
        token_hash: Tokens.hash(token),
        device_token_id: device_token && device_token.id,
        expires_at: DateTime.add(now, max_age),
        inserted_at: now,
        updated_at: now
      })

    {token, row}
  end

  @doc """
  Resolve a `ses_` token to `{:ok, user, row}`, or `:error` when it's unknown,
  revoked or expired, an idle tablet session, a tablet session whose tablet
  was revoked, or its user is inactive or a device. Touches `last_seen_at` at
  most once a minute.
  """
  def authenticate(token, now \\ now())

  def authenticate(@token_prefix <> _ = token, now) do
    with %UserSession{revoked_at: nil} = row <- live_row(token),
         true <- DateTime.compare(row.expires_at, now) == :gt,
         true <- tablet_ok?(row, now),
         %User{active: true} = user <- Accounts.get_user(row.user_id),
         false <- Authz.device?(user),
         true <- allowed_here?(user) do
      touch(row, now)
      {:ok, user, row}
    else
      _ -> :error
    end
  end

  def authenticate(_token, _now), do: :error

  defp live_row(token) do
    from(s in UserSession,
      where: s.token_hash == ^Tokens.hash(token),
      preload: [:device_token]
    )
    |> Repo.one()
  end

  # A synthetic persona (D30) authenticates only where the seed guard allows
  # (DEV and local), so prod refuses its sessions even if a row got there.
  defp allowed_here?(%User{email: email}),
    do: not Synthetic.synthetic_email?(email) or Guard.allowed?()

  defp tablet_ok?(%UserSession{device_token_id: nil}, _now), do: true

  defp tablet_ok?(%UserSession{device_token: %DeviceToken{revoked_at: nil}} = row, now),
    do: DateTime.diff(now, row.last_seen_at || row.inserted_at) < @tablet_idle_seconds

  defp tablet_ok?(_row, _now), do: false

  defp touch(%UserSession{last_seen_at: seen} = row, now) do
    if is_nil(seen) or DateTime.diff(now, seen) >= @seen_every_seconds do
      cutoff = DateTime.add(now, -@seen_every_seconds)

      from(s in UserSession,
        where: s.id == ^row.id and (is_nil(s.last_seen_at) or s.last_seen_at <= ^cutoff)
      )
      |> Repo.update_all(set: [last_seen_at: now])
    end

    :ok
  end

  @doc "Revoke one session (signing out). Revoking twice is harmless."
  def revoke(%UserSession{} = row, now \\ now()) do
    from(s in UserSession, where: s.id == ^row.id and is_nil(s.revoked_at))
    |> Repo.update_all(set: [revoked_at: now, updated_at: now])

    :ok
  end

  @doc """
  Revoke every session of `user` except `except` (a `UserSession` or nil),
  and refuse their pre-D34 tokens from now on. Returns how many sessions
  were revoked.
  """
  def revoke_all(%User{} = user, except, now \\ now()) do
    keep_id = except && except.id

    query = from(s in UserSession, where: s.user_id == ^user.id and is_nil(s.revoked_at))
    query = if keep_id, do: where(query, [s], s.id != ^keep_id), else: query

    {count, _} = Repo.update_all(query, set: [revoked_at: now, updated_at: now])

    from(u in User, where: u.id == ^user.id)
    |> Repo.update_all(set: [legacy_tokens_revoked_at: now])

    count
  end

  @doc "Revoke the sessions started on the given tablet tokens (D34 A5)."
  def revoke_for_device_tokens(device_token_ids, now \\ now())
  def revoke_for_device_tokens([], _now), do: 0

  def revoke_for_device_tokens(ids, now) do
    {count, _} =
      from(s in UserSession, where: s.device_token_id in ^ids and is_nil(s.revoked_at))
      |> Repo.update_all(set: [revoked_at: now, updated_at: now])

    count
  end

  @doc "True when `user`'s pre-D34 tokens have been cut off (D34 §3.7)."
  def legacy_tokens_revoked?(%User{legacy_tokens_revoked_at: at}), do: not is_nil(at)

  # Housekeeping (§3.8): drop the user's rows that ended over a week ago.
  defp prune(%User{id: id}, now) do
    cutoff = DateTime.add(now, -@prune_after_seconds)

    from(s in UserSession,
      where: s.user_id == ^id and (s.expires_at < ^cutoff or s.revoked_at < ^cutoff)
    )
    |> Repo.delete_all()
  end

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second)
end
