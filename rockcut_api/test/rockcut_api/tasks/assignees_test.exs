defmodule RockcutApi.Tasks.AssigneesTest do
  @moduledoc "D53 §3: `Tasks.Assignees`, the only writer of a task's or series' people."
  use RockcutApi.DataCase, async: false

  import RockcutApi.AccountsFixtures

  alias RockcutApi.Tasks.{Assignees, Task, TaskSeries}

  setup do
    dept = department_fixture("brewery", "Brewery")
    member = fn name -> user_with_role("employee", "brewery", %{name: name}) end

    task = Repo.insert!(%Task{department_id: dept.id, title: "Carb FV3", position: 1})

    %{dept: dept, task: task, a: member.("Riley Wort"), b: member.("Jordan Float")}
  end

  describe "given/1" do
    test "assignee_ids wins, in order, without duplicates" do
      assert Assignees.given(%{"assignee_ids" => [3, "2", 3], "assignee_id" => 9}) == [3, 2]
    end

    test "a lone assignee_id means [id], blank means nobody, neither means no change" do
      assert Assignees.given(%{"assignee_id" => 5}) == [5]
      assert Assignees.given(%{"assignee_id" => "5"}) == [5]
      assert Assignees.given(%{"assignee_id" => nil}) == []
      assert Assignees.given(%{"assignee_id" => ""}) == []
      assert Assignees.given(%{"assignee_ids" => []}) == []
      assert Assignees.given(%{"assignee_ids" => nil}) == []
      assert Assignees.given(%{"title" => "x"}) == nil
    end

    test "anything else is invalid" do
      assert Assignees.given(%{"assignee_ids" => 5}) == :invalid
      assert Assignees.given(%{"assignee_ids" => ["x"]}) == :invalid
      assert Assignees.given(%{"assignee_ids" => [%{"id" => 1}]}) == :invalid
      assert Assignees.given(%{"assignee_id" => "x"}) == :invalid
    end
  end

  describe "put!/2" do
    test "keeps the order given and assignee_id on the first", %{task: task, a: a, b: b} do
      updated = Assignees.put!(task, [b.id, a.id])

      assert updated.assignee_id == b.id
      assert Repo.get!(Task, task.id).assignee_id == b.id
      assert Assignees.ids(task) == [b.id, a.id]

      loaded = Repo.preload(Repo.get!(Task, task.id), :assignees)
      assert Enum.map(loaded.assignees, & &1.id) == [b.id, a.id]
    end

    test "an empty list clears assignee_id", %{task: task, a: a} do
      Assignees.put!(task, [a.id])
      assert Assignees.put!(task, []).assignee_id == nil
      assert Repo.get!(Task, task.id).assignee_id == nil
      assert Assignees.ids(task) == []
    end

    test "a series the same way", %{dept: dept, a: a, b: b} do
      series =
        Repo.insert!(%TaskSeries{
          department_id: dept.id,
          title: "Keg wash",
          frequency: "weekly",
          weekdays: [3],
          start_date: ~D[2026-11-04]
        })

      assert Assignees.put!(series, [a.id, b.id]).assignee_id == a.id
      assert Assignees.ids(series) == [a.id, b.id]
      assert Repo.get!(TaskSeries, series.id).assignee_id == a.id
    end
  end

  test "remove!/2 makes the next person the first", %{task: task, a: a, b: b} do
    Assignees.put!(task, [a.id, b.id])

    assert Assignees.remove!(task, a.id).assignee_id == b.id
    assert Assignees.ids(task) == [b.id]
    assert Repo.get!(Task, task.id).assignee_id == b.id
  end

  test "deleting the task takes its rows with it", %{task: task, a: a} do
    Assignees.put!(task, [a.id])
    Repo.delete!(task)
    assert Assignees.ids(task) == []
  end

  describe "validate/3" do
    test "names each person who can't take a task on the board", %{task: task, a: a} do
      outsider = user_fixture(%{name: "Casey Tap"})
      cs = Ecto.Changeset.change(task)

      refused = Assignees.validate(cs, %{"assignee_ids" => [a.id, outsider.id]})
      assert %{assignee_ids: ["Casey Tap must be a Brewery member"]} = errors_on(refused)
      assert Assignees.validate(cs, %{"assignee_ids" => [a.id]}).valid?
    end

    test "only people being added are checked", %{task: task, a: a} do
      gone = user_fixture(%{name: "Casey Tap"})
      cs = Ecto.Changeset.change(task)

      assert Assignees.validate(cs, %{"assignee_ids" => [gone.id, a.id]}, [gone.id]).valid?
    end

    test "a device is never an assignee, an unknown id neither", %{task: task} do
      device = device_fixture(%{name: "Brewhouse tablet", home: "brewery"})
      cs = Ecto.Changeset.change(task)

      assert %{assignee_ids: ["Brewhouse tablet must be a Brewery member"]} =
               errors_on(Assignees.validate(cs, %{"assignee_ids" => [device.id]}))

      assert %{assignee_ids: ["That person must be a Brewery member"]} =
               errors_on(Assignees.validate(cs, %{"assignee_ids" => [999_999]}))
    end

    test "an owner can be assigned to any board", %{task: task} do
      owner = owner_fixture()
      assert Assignees.validate(Ecto.Changeset.change(task), %{"assignee_id" => owner.id}).valid?
    end

    test "no change asked, nothing checked; a bad id is an error", %{task: task} do
      cs = Ecto.Changeset.change(task)
      assert Assignees.validate(cs, %{"title" => "x"}).valid?

      assert %{assignee_ids: ["is invalid"]} =
               errors_on(Assignees.validate(cs, %{"assignee_ids" => 5}))
    end
  end
end
