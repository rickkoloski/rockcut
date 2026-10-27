defmodule RockcutApi.Repo.Migrations.AddCipMethod do
  @moduledoc """
  D49 §3.12a: a CIP step's variant, `sanitize_full` (CIP & Sanitize, also
  what nil means), `no_sani` (CIP - no sani) or `sanitize` (Sanitize), on
  schedule steps and template entries, like `split_method`.
  """
  use Ecto.Migration

  def change do
    alter table(:production_steps) do
      add :cip_method, :string
    end

    alter table(:template_steps) do
      add :cip_method, :string
    end
  end
end
