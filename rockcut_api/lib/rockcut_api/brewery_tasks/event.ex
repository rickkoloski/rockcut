defmodule RockcutApi.BreweryTasks.Event do
  @moduledoc """
  D38: one change to the Brewery board (append-only). `task_id` has no foreign
  key and `title` is a copy, so a deleted task's history still reads. `actor`
  is always the person; `device` is the shared tablet (D40), nil until then.
  `detail` holds old → new values.
  """
  use Ecto.Schema

  schema "brewery_task_events" do
    field :task_id, :integer
    field :action, :string
    field :title, :string
    field :detail, :map, default: %{}

    belongs_to :actor, RockcutApi.Accounts.User
    belongs_to :device, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime, updated_at: false)
  end
end
