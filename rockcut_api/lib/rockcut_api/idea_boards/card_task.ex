defmodule RockcutApi.IdeaBoards.CardTask do
  @moduledoc """
  D53 Part 2 §4.7: a task (or repeating series) made from a card by Send to
  task list. `task_id` and `task_series_id` are nulled when the task or
  series is deleted; `task_title`, `department_id` and `removed_at` keep the
  card's chip readable ("Removed"). `card_id` is nulled when the card is
  deleted for good; `card_title` keeps the task's "From idea: <title>".
  """
  use Ecto.Schema

  schema "idea_card_tasks" do
    field :task_title, :string
    field :card_title, :string
    field :removed_at, :utc_datetime

    belongs_to :card, RockcutApi.IdeaBoards.Card
    belongs_to :task, RockcutApi.Tasks.Task
    belongs_to :task_series, RockcutApi.Tasks.TaskSeries
    belongs_to :department, RockcutApi.Accounts.Department

    timestamps(type: :utc_datetime)
  end
end
