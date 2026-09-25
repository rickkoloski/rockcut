defmodule RockcutApi.MailerNoop do
  @moduledoc """
  No-op mail adapter (D28).

  Production ships without a real email provider this release, so this adapter
  accepts every message, logs a line, and returns success without sending
  anything. Email notifications (D18/D21/D23) therefore degrade cleanly — the
  in-app bell and web push still deliver. Swap in a real Swoosh adapter
  (Mailgun/Postmark/SMTP/…) in `runtime.exs` when a provider is chosen.
  """
  use Swoosh.Adapter

  require Logger

  @impl Swoosh.Adapter
  def deliver(%Swoosh.Email{} = email, _config) do
    Logger.info(
      "[mail:noop] not sending (no provider configured) " <>
        "to=#{inspect(email.to)} subject=#{inspect(email.subject)}"
    )

    {:ok, %{id: "noop"}}
  end

  @impl Swoosh.Adapter
  def deliver_many(emails, config) when is_list(emails) do
    {:ok, Enum.map(emails, fn email -> {:ok, result} = deliver(email, config); result end)}
  end
end
