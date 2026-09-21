defmodule RockcutApi.SchedulingFixtures do
  @moduledoc "Test fixtures for positions and shifts."

  alias RockcutApi.Repo
  alias RockcutApi.Scheduling.{Position, Shift}
  alias RockcutApi.AccountsFixtures

  def position_fixture(attrs \\ %{}) do
    attrs = Map.new(attrs)

    dept_id =
      attrs[:department_id] || (attrs[:department] && attrs[:department].id) ||
        AccountsFixtures.department_fixture("bar").id

    Repo.insert!(%Position{
      name: Map.get(attrs, :name, "Pos#{System.unique_integer([:positive])}"),
      group: Map.get(attrs, :group),
      active: Map.get(attrs, :active, true),
      department_id: dept_id
    })
  end

  def shift_fixture(attrs \\ %{}) do
    attrs = Map.new(attrs)

    dept =
      attrs[:department] || AccountsFixtures.department_fixture(Map.get(attrs, :dept_key, "bar"))

    position = attrs[:position] || position_fixture(%{department: dept})
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    Repo.insert!(%Shift{
      department_id: dept.id,
      position_id: position.id,
      assignee_id: attrs[:assignee_id],
      created_by_id: attrs[:created_by_id],
      starts_at: attrs[:starts_at] || DateTime.add(now, 3600) |> DateTime.truncate(:second),
      ends_at: attrs[:ends_at] || DateTime.add(now, 7200) |> DateTime.truncate(:second),
      status: Map.get(attrs, :status, "draft"),
      notes: attrs[:notes]
    })
  end
end
