defmodule RockcutApiWeb.OwnersPickersTest do
  @moduledoc """
  D59 lead decisions 2. On an `owners_only` department's boards the pickers
  offer the members plus every active owner (the task board's `owners`, the
  Idea Board's `/people`); every other board offers members only, as before.
  A lock there says "an owner", since no one manages Owners.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IdeaBoardFixtures

  alias RockcutApi.Tasks

  setup do
    %{p: personas(~w(owner owner2 ownersAsst brewer1 inactive))}
  end

  defp today, do: Date.to_iso8601(Tasks.today())
  defp range, do: %{from: today(), to: today()}

  defp ids(list), do: list |> Enum.map(& &1["id"]) |> Enum.sort()

  describe "task board `owners`" do
    test "the Owners board lists every active owner", %{p: p} do
      owners =
        call(p["ownersAsst"], :get, "/api/boards/owners/tasks", range())
        |> json_response(200)
        |> get_in(["data", "owners"])

      assert ids(owners) == Enum.sort([p["owner"].id, p["owner2"].id])
      assert Enum.map(owners, & &1["name"]) == Enum.sort(Enum.map(owners, & &1["name"]))
    end

    test "the Brewery board lists none", %{p: p} do
      assert call(p["brewer1"], :get, "/api/boards/brewery/tasks", range())
             |> json_response(200)
             |> get_in(["data", "owners"]) == []
    end

    test "an owner the picker offers can be assigned on the Owners board", %{p: p} do
      assert call(p["owner"], :post, "/api/boards/owners/tasks", %{
               title: "Both of us",
               due_on: today(),
               assignee_ids: [p["owner2"].id, p["ownersAsst"].id]
             })
             |> json_response(201)
             |> get_in(["data", "assignees"])
             |> Enum.map(& &1["id"]) == [p["owner2"].id, p["ownersAsst"].id]
    end
  end

  describe "Idea Board `/people`" do
    test "the Owners board offers its members and every active owner", %{p: p} do
      people =
        call(p["ownersAsst"], :get, "/api/idea_boards/owners/people")
        |> json_response(200)
        |> Map.fetch!("data")

      assert ids(people) == Enum.sort([p["owner"].id, p["owner2"].id, p["ownersAsst"].id])
      assert Enum.map(people, & &1["name"]) == Enum.sort(Enum.map(people, & &1["name"]))
      refute p["inactive"].id in ids(people)
    end

    test "the Brewery board offers members only", %{p: p} do
      people =
        call(p["brewer1"], :get, "/api/idea_boards/brewery/people")
        |> json_response(200)
        |> Map.fetch!("data")

      assert p["brewer1"].id in ids(people)
      refute p["owner"].id in ids(people)
      refute p["owner2"].id in ids(people)
    end
  end

  describe "lock wording" do
    test "the board entries flag the owners-only board", %{p: p} do
      flags =
        call(p["ownersAsst"], :get, "/api/idea_boards")
        |> json_response(200)
        |> Map.fetch!("data")
        |> Map.new(&{&1["key"], &1["owners_only"]})

      assert flags == %{"office" => false, "owners" => true, "company" => false}
    end

    test "an owners-only board says an owner locked it", %{p: p} do
      card = card!(starter("owners", "Ideas"), "Locked idea")

      call(p["owner"], :post, "/api/idea_boards/owners/cards/#{card.id}/lock")
      |> json_response(200)

      assert %{"error" => "locked", "message" => "Locked by an owner"} =
               call(p["ownersAsst"], :patch, "/api/idea_boards/owners/cards/#{card.id}", %{
                 title: "Changed"
               })
               |> json_response(423)
    end

    test "another board still says a manager", %{p: p} do
      card = card!(starter("brewery", "Ideas"), "Locked idea")

      call(p["owner"], :post, "/api/idea_boards/brewery/cards/#{card.id}/lock")
      |> json_response(200)

      assert %{"message" => "Locked by a manager"} =
               call(p["brewer1"], :patch, "/api/idea_boards/brewery/cards/#{card.id}", %{
                 title: "Changed"
               })
               |> json_response(423)
    end
  end
end
