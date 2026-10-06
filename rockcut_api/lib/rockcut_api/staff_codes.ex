defmodule RockcutApi.StaffCodes do
  @moduledoc """
  Staff codes (D37 §3.2): a 4-digit code per Taproom member. Typed on a shared
  device, it attributes that one request to the person. It is not a sign-in.

  Each code is stored twice on `users`:
    * `staff_code_digest`: `Tokens.hash/1` (HMAC-SHA256 with the endpoint
      secret). Unique, so a code belongs to one person and `resolve/1` is one
      indexed query.
    * `staff_code_encrypted`: AES-256-GCM with `STAFF_CODE_KEY`
      (`config :rockcut_api, :staff_code_key`), the user id as associated
      data. This is what lets a manager see the code in the user dialog.

  Owners and Taproom managers set and see codes (`Authz`). Only active people
  with a Taproom membership may hold one; `clear_if_ineligible/2` runs when
  someone is deactivated or leaves the Taproom.
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Accounts, Authz, Repo, Tokens}
  alias RockcutApi.Accounts.User

  @code_format ~r/^\d{4}$/

  @doc "True if `user` may hold a staff code (`Authz.can_hold_staff_code?/1`)."
  def eligible?(%User{} = user), do: Authz.can_hold_staff_code?(Accounts.get_user!(user.id))

  @doc "True if `user` sees and sets staff codes (owners and Taproom managers; `/api/me`)."
  def can_manage?(%User{} = user), do: Authz.can?(user, :set_staff_code, %User{})

  @doc "True if the user has a staff code."
  def has_code?(%User{staff_code_digest: digest}), do: not is_nil(digest)

  @doc """
  Set or change `target`'s code. Returns `{:ok, user}` or `{:error, reason}`,
  with reason `:forbidden`, `:not_eligible`, `:invalid_code` or `:code_in_use`.
  """
  def set(%User{} = target, code, %User{} = actor) when is_binary(code) do
    code = String.trim(code)
    target = Accounts.get_user!(target.id)

    with :ok <- authorize(actor, :set_staff_code, target),
         :ok <- check_eligible(target),
         :ok <- check_format(code) do
      target
      |> Ecto.Changeset.change(
        staff_code_digest: Tokens.hash(code),
        staff_code_encrypted: encrypt(code, target.id),
        staff_code_set_at: now()
      )
      |> Ecto.Changeset.unique_constraint(:staff_code_digest)
      |> Repo.update()
      |> case do
        {:ok, user} ->
          Accounts.record_audit(actor.id, user.id, "staff_code.set")
          {:ok, user}

        {:error, %Ecto.Changeset{}} ->
          {:error, :code_in_use}
      end
    end
  end

  def set(%User{}, _code, %User{}), do: {:error, :invalid_code}

  @doc "Remove `target`'s code. Returns `{:ok, user}` or `{:error, :forbidden}`."
  def remove(%User{} = target, %User{} = actor) do
    target = Accounts.get_user!(target.id)

    with :ok <- authorize(actor, :set_staff_code, target) do
      user = clear!(target)
      Accounts.record_audit(actor.id, user.id, "staff_code.remove")
      {:ok, user}
    end
  end

  @doc """
  `target`'s code in plain text for the user dialog (`nil` when there is none).
  Each reveal is audited. Returns `{:ok, code_or_nil}` or `{:error, :forbidden}`.
  """
  def reveal(%User{} = target, %User{} = actor) do
    target = Accounts.get_user!(target.id)

    with :ok <- authorize(actor, :reveal_staff_code, target) do
      case target.staff_code_encrypted do
        nil ->
          {:ok, nil}

        blob ->
          Accounts.record_audit(actor.id, target.id, "staff_code.reveal")
          {:ok, decrypt(blob, target.id)}
      end
    end
  end

  @doc "A random code nobody has, for the dialog's Suggest button."
  def suggest(attempts \\ 50)
  def suggest(0), do: {:error, :none_available}

  def suggest(attempts) do
    code = (:rand.uniform(10_000) - 1) |> Integer.to_string() |> String.pad_leading(4, "0")

    if Repo.exists?(from u in User, where: u.staff_code_digest == ^Tokens.hash(code)),
      do: suggest(attempts - 1),
      else: {:ok, code}
  end

  @doc """
  The person a code belongs to, or `nil`. Only an active Taproom member's code
  resolves, so a stale code is just a wrong one.
  """
  def resolve(code) when is_binary(code) do
    code = String.trim(code)

    with true <- Regex.match?(@code_format, code),
         %User{} = user <- Repo.get_by(User, staff_code_digest: Tokens.hash(code)),
         true <- eligible?(user) do
      Accounts.get_user!(user.id)
    else
      _ -> nil
    end
  end

  def resolve(_), do: nil

  @doc """
  Clear the code of someone who may no longer hold one (deactivated, or no
  longer in the Taproom). Called inside `Accounts`' user and membership
  transactions; audited as an automatic removal.
  """
  def clear_if_ineligible(user_id, %User{} = actor) do
    user = Accounts.get_user!(user_id)

    if has_code?(user) and not eligible?(user) do
      clear!(user)
      Accounts.record_audit(actor.id, user.id, "staff_code.remove", %{"reason" => "ineligible"})
    end

    :ok
  end

  ## Encryption (AES-256-GCM, 12-byte IV, 16-byte tag)

  @doc false
  def encrypt(code, user_id) do
    iv = :crypto.strong_rand_bytes(12)

    {ciphertext, tag} =
      :crypto.crypto_one_time_aead(:aes_256_gcm, key(), iv, code, aad(user_id), true)

    iv <> tag <> ciphertext
  end

  @doc false
  def decrypt(<<iv::binary-12, tag::binary-16, ciphertext::binary>>, user_id) do
    case :crypto.crypto_one_time_aead(
           :aes_256_gcm,
           key(),
           iv,
           ciphertext,
           aad(user_id),
           tag,
           false
         ) do
      :error -> nil
      code -> code
    end
  end

  def decrypt(_, _), do: nil

  defp aad(user_id), do: "staff_code:#{user_id}"

  defp key do
    case Application.fetch_env!(:rockcut_api, :staff_code_key) do
      <<_::binary-32>> = key -> key
      _ -> raise "staff_code_key must be 32 bytes"
    end
  end

  ## Helpers

  defp clear!(%User{} = user) do
    user
    |> Ecto.Changeset.change(
      staff_code_digest: nil,
      staff_code_encrypted: nil,
      staff_code_set_at: nil
    )
    |> Repo.update!()
  end

  defp authorize(actor, action, target),
    do: if(Authz.can?(actor, action, target), do: :ok, else: {:error, :forbidden})

  defp check_eligible(target),
    do: if(eligible?(target), do: :ok, else: {:error, :not_eligible})

  defp check_format(code),
    do: if(Regex.match?(@code_format, code), do: :ok, else: {:error, :invalid_code})

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second)
end
