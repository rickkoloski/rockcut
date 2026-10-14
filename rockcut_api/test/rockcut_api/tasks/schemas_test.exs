defmodule RockcutApi.Tasks.SchemasTest do
  use ExUnit.Case, async: true

  alias RockcutApi.Tasks.{DailyItem, Task}

  defp errors(cs), do: Keyword.keys(cs.errors)

  describe "Task.changeset/2" do
    test "title is trimmed and required" do
      cs = Task.changeset(%Task{}, %{title: "  Package FV6  "})
      assert cs.valid?
      assert Ecto.Changeset.get_change(cs, :title) == "Package FV6"

      assert :title in errors(Task.changeset(%Task{}, %{title: "   "}))
      assert :title in errors(Task.changeset(%Task{}, %{}))
    end

    test "title up to 200 characters, notes up to 2,000" do
      assert Task.changeset(%Task{}, %{title: String.duplicate("a", 200)}).valid?
      assert :title in errors(Task.changeset(%Task{}, %{title: String.duplicate("a", 201)}))

      ok = %{title: "T", notes: String.duplicate("n", 2_000)}
      assert Task.changeset(%Task{}, ok).valid?

      long = %{title: "T", notes: String.duplicate("n", 2_001)}
      assert :notes in errors(Task.changeset(%Task{}, long))
    end

    test "completed_display is planned_day, completed_day or both" do
      for d <- ~w(planned_day completed_day both),
          do: assert(Task.completion_changeset(%Task{}, %{completed_display: d}).valid?)

      assert :completed_display in errors(
               Task.completion_changeset(%Task{}, %{completed_display: "elsewhere"})
             )
    end
  end

  describe "DailyItem.changeset/2" do
    test "name is trimmed, 1–40 characters" do
      cs = DailyItem.changeset(%DailyItem{}, %{name: " Gravities "})
      assert cs.valid?
      assert Ecto.Changeset.get_change(cs, :name) == "Gravities"

      assert DailyItem.changeset(%DailyItem{}, %{name: String.duplicate("a", 40)}).valid?

      assert :name in errors(
               DailyItem.changeset(%DailyItem{}, %{name: String.duplicate("a", 41)})
             )

      assert :name in errors(DailyItem.changeset(%DailyItem{}, %{name: " "}))
    end
  end
end
