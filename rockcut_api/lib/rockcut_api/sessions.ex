defmodule RockcutApi.Sessions do
  @moduledoc """
  Revocable sign-in sessions for people (D34).

    * Signing in inserts a `user_sessions` row and hands out a `ses_` token,
      stored only as an HMAC hash (`RockcutApi.Tokens`).
    * A session lasts 30 days. A paired tablet takes no personal sign-ins
      (D54), so no session belongs to a tablet.
    * Signing out revokes one session; `revoke_all/2` (password change or
      reset, "Sign out of all other devices") revokes the rest.
  """
  import Ecto.Query
  alias RockcutApi.{Accounts, Authz, Repo, Tokens}
  alias RockcutApi.Accounts.User
  alias RockcutApi.Seeds.{Guard, Synthetic}
  alias RockcutApi.Sessions.UserSession

  @token_prefix "ses_"
  @max_age_seconds 30 * 24 * 60 * 60
  @prune_after_seconds 7 * 24 * 60 * 60

  def token_prefix, do: @token_prefix

  @doc """
  Start a session for `user` and return `{plain_token, row}`. Options:

    * `:max_age` — seconds, overriding the lifetime (synthetic personas).

  Any other option raises (D54: there are no tablet sessions any more).
  """
  def create(%User{} = user, opts \\ [], now \\ now()) do
    max_age = opts |> Keyword.validate!(max_age: @max_age_seconds) |> Keyword.fetch!(:max_age)

    token = Tokens.random(@token_prefix)
    prune(user, now)

    row =
      Repo.insert!(%UserSession{
        user_id: user.id,
        token_hash: Tokens.hash(token),
        expires_at: DateTime.add(now, max_age),
        inserted_at: now,
        updated_at: now
      })

    {token, row}
  end

  @doc """
  Resolve a `ses_` token to `{:ok, user, row}`, or `:error` when it's unknown,
  revoked or expired, or its user is inactive or a device. Requests don't
  write (SQLite has one connection; DEV finding, D34 fix cycle 1).
  """
  def authenticate(token, now \\ now())

  def authenticate(@token_prefix <> _ = token, now) do
    with %UserSession{revoked_at: nil} = row <- live_row(token),
         true <- DateTime.compare(row.expires_at, now) == :gt,
         %User{active: true} = user <- Accounts.get_user(row.user_id),
         false <- Authz.device?(user),
         true <- allowed_here?(user) do
      {:ok, user, row}
    else
      _ -> :error
    end
  end

  def authenticate(_token, _now), do: :error

  defp live_row(token) do
    Repo.one(from(s in UserSession, where: s.token_hash == ^Tokens.hash(token)))
  end

  # A synthetic persona (D30) authenticates only where the seed guard allows
  # (DEV and local), so prod refuses its sessions even if a row got there.
  defp allowed_here?(%User{email: email}),
    do: not Synthetic.synthetic_email?(email) or Guard.allowed?()

  @doc "Revoke one session (signing out). Revoking twice is harmless."
  def revoke(%UserSession{} = row, now \\ now()) do
    from(s in UserSession, where: s.id == ^row.id and is_nil(s.revoked_at))
    |> Repo.update_all(set: [revoked_at: now, updated_at: now])

    :ok
  end

  @doc """
  Revoke every session of `user` except `except` (a `UserSession` or nil).
  Returns how many sessions were revoked.
  """
  def revoke_all(%User{} = user, except, now \\ now()) do
    keep_id = except && except.id

    query = from(s in UserSession, where: s.user_id == ^user.id and is_nil(s.revoked_at))
    query = if keep_id, do: where(query, [s], s.id != ^keep_id), else: query

    {count, _} = Repo.update_all(query, set: [revoked_at: now, updated_at: now])

    count
  end

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
