defmodule RockcutApi.Tasks.TaskAssignee do
  @moduledoc "D53: one person on a task, in order (position 0 is the first). Written only by `Tasks.Assignees`."
  use Ecto.Schema

  @primary_key false
  schema "task_assignees" do
    field :position, :integer, default: 0
    field :inserted_at, :utc_datetime

    belongs_to :task, RockcutApi.Tasks.Task, primary_key: true
    belongs_to :user, RockcutApi.Accounts.User, primary_key: true
  end
end
