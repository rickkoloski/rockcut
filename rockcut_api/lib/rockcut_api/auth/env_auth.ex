defmodule RockcutApi.Auth.EnvAuth do
  @moduledoc """
  Validates credentials against environment variables.
  In dev (when ADMIN_EMAIL is not set), accepts any credentials.
  """

  def validate_credentials(email, password) do
    if configured?() do
      admin_email = Application.get_env(:rockcut_api, :admin_email)
      admin_password_hash = Application.get_env(:rockcut_api, :admin_password_hash)

      if String.downcase(email) == String.downcase(admin_email) and
           Argon2.verify_pass(password, admin_password_hash) do
        {:ok, email}
      else
        # Constant-time comparison even on wrong email
        Argon2.no_user_verify()
        :error
      end
    else
      # Dev mode: accept any credentials
      {:ok, email}
    end
  end

  def configured? do
    Application.get_env(:rockcut_api, :admin_email) != nil and
      Application.get_env(:rockcut_api, :admin_password_hash) != nil
  end
end
