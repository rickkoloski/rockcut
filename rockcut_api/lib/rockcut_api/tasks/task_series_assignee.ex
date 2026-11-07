defmodule RockcutApi.Tasks.TaskSeriesAssignee do
  @moduledoc "D53: one person on a recurring task's series, in order. Written only by `Tasks.Assignees`."
  use Ecto.Schema

  @primary_key false
  schema "task_series_assignees" do
    field :position, :integer, default: 0
    field :inserted_at, :utc_datetime

    belongs_to :series, RockcutApi.Tasks.TaskSeries, primary_key: true
    belongs_to :user, RockcutApi.Accounts.User, primary_key: true
  end
end
