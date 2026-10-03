defmodule RockcutApi.Tokens do
  @moduledoc """
  Opaque bearer tokens shared by tablets (`dev_`, D33) and sign-in sessions
  (`ses_`, D34): random values handed out once and stored only as an
  HMAC-SHA256 hash keyed by the endpoint secret, so a lookup is one indexed
  query and a database copy reveals no usable token.
  """

  @doc "A fresh token: `prefix` followed by 32 random bytes, base64url."
  def random(prefix) when is_binary(prefix),
    do: prefix <> (:crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false))

  @doc "HMAC-SHA256 of a code or token, keyed by the endpoint secret."
  def hash(value) do
    secret = Application.fetch_env!(:rockcut_api, RockcutApiWeb.Endpoint)[:secret_key_base]
    :crypto.mac(:hmac, :sha256, secret, value)
  end
end
