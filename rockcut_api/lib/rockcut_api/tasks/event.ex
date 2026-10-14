defmodule RockcutApi.Tasks.Event do
  @moduledoc """
  D38: one change to a task board (append-only). D41: `department_id` is the
  board's, so History is per board. `task_id` has no foreign
  key and `title` is a copy, so a deleted task's history still reads. `actor`
  is always the person; `device` is the shared tablet (D40), nil until then.
  `detail` holds old → new values.
  """
  use Ecto.Schema

  schema "task_events" do
    field :task_id, :integer
    field :action, :string
    field :title, :string
    field :detail, :map, default: %{}

    belongs_to :department, RockcutApi.Accounts.Department
    belongs_to :actor, RockcutApi.Accounts.User
    belongs_to :device, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime, updated_at: false)
  end
end
