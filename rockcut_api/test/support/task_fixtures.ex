defmodule RockcutApi.TaskFixtures do
  @moduledoc """
  D41: task boards in tests. Every `RockcutApi.Tasks` function that reads or
  writes a board takes its department first; these fetch it. The test must
  have created the department (`department_fixture/1` or `personas/0`).
  """
  alias RockcutApi.Repo
  alias RockcutApi.Accounts.Department

  @doc "The Brewery's board (its department)."
  def brewery_board, do: task_board("brewery")

  @doc "The board of the department with `key` (`bar`, `office`, `sales`, …)."
  def task_board(key), do: Repo.get_by!(Department, key: key)
end
