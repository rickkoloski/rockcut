defmodule RockcutApi.Tasks.DailyCheck do
  @moduledoc "D38: one ticked Daily check (unticking deletes the row)."
  use Ecto.Schema

  schema "daily_checks" do
    field :on_date, :date
    field :completed_at, :utc_datetime

    belongs_to :department, RockcutApi.Accounts.Department
    belongs_to :daily_item, RockcutApi.Tasks.DailyItem
    belongs_to :completed_by, RockcutApi.Accounts.User
  end
end
