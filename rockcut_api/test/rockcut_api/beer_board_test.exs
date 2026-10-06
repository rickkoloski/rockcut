defmodule RockcutApi.BeerBoardTest do
  @moduledoc "D37 §3.1 / §3.4: board entries and the change log."
  use RockcutApi.DataCase, async: false

  import RockcutApi.AccountsFixtures
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{BeerBoard, Repo}
  alias RockcutApi.BeerBoard.{Entry, Event}

  setup do
    %{sam: user_with_role("employee", "bar", %{name: "Sam Pour"}), tablet: device_fixture()}
  end

  defp events(entry_id),
    do: Repo.all(from ev in Event, where: ev.entry_id == ^entry_id, order_by: ev.id)

  defp entry!(sam, attrs \\ %{}) do
    {:ok, e} =
      BeerBoard.create(
        Map.merge(%{"recipient_name" => "Pat", "purchaser_name" => "Chris", "beers" => 3}, attrs),
        sam,
        nil
      )

    e
  end

  describe "create/3" do
    test "records the line, stamps the moved-off time, logs `created` (S4/S31)", %{sam: sam} do
      e = entry!(sam, %{"recipient_name" => "  Pat   Smith ", "purchaser_name" => "Chris"})
      assert e.recipient_name == "Pat Smith"
      assert e.beers_remaining == 3
      assert DateTime.diff(DateTime.utc_now(), e.moved_off_board_at) < 5
      assert e.imported_at == nil
      assert e.created_by_id == sam.id

      assert [
               %Event{
                 action: "created",
                 beers_before: 0,
                 beers_after: 3,
                 actor_id: aid,
                 device_id: nil
               }
             ] =
               events(e.id)

      assert aid == sam.id
    end

    test "validates names and the 1–99 count", %{sam: sam} do
      for {attrs, field} <- [
            {%{"recipient_name" => ""}, :recipient_name},
            {%{"purchaser_name" => "   "}, :purchaser_name},
            {%{"recipient_name" => String.duplicate("x", 81)}, :recipient_name},
            {%{"beers" => 0}, :beers_remaining},
            {%{"beers" => 100}, :beers_remaining}
          ] do
        assert {:error, cs} =
                 BeerBoard.create(
                   Map.merge(
                     %{"recipient_name" => "Pat", "purchaser_name" => "Chris", "beers" => 3},
                     attrs
                   ),
                   sam,
                   nil
                 )

        assert Map.has_key?(errors_on(cs), field), inspect(attrs)
      end

      assert Repo.aggregate(Event, :count) == 0
    end

    test "a tablet change records the device beside the person", %{sam: sam, tablet: t} do
      {:ok, e} =
        BeerBoard.create(%{recipient_name: "Pat", purchaser_name: "Chris", beers: 1}, sam, t)

      assert [%Event{actor_id: aid, device_id: did}] = events(e.id)
      assert {aid, did} == {sam.id, t.id}
    end
  end

  describe "redeem/4" do
    test "decrements and logs before → after (S7)", %{sam: sam} do
      e = entry!(sam)
      assert {:ok, %Entry{beers_remaining: 2}} = BeerBoard.redeem(e.id, 1, sam, nil)
      assert [_, %Event{action: "redeemed", beers_before: 3, beers_after: 2}] = events(e.id)
    end

    test "the last beer deletes the entry; history keeps it (S8)", %{sam: sam} do
      e = entry!(sam, %{"beers" => 2})
      assert {:ok, :removed} = BeerBoard.redeem(e.id, "2", sam, nil)
      assert Repo.get(Entry, e.id) == nil

      assert [
               _,
               %Event{action: "redeemed", beers_before: 2, beers_after: 0, recipient_name: "Pat"}
             ] =
               events(e.id)
    end

    test "can't redeem more than are left", %{sam: sam} do
      e = entry!(sam, %{"beers" => 2})
      assert {:error, {:only, 2}} = BeerBoard.redeem(e.id, 3, sam, nil)
      assert Repo.get(Entry, e.id).beers_remaining == 2
      assert length(events(e.id)) == 1
    end

    test "count must be 1–99", %{sam: sam} do
      e = entry!(sam)

      for bad <- [0, -1, 100, "x", "1.5"],
          do: assert({:error, :invalid_count} = BeerBoard.redeem(e.id, bad, sam, nil))

      assert {:ok, %Entry{beers_remaining: 2}} = BeerBoard.redeem(e.id, nil, sam, nil)
    end

    test "a removed entry is :not_found", %{sam: sam} do
      e = entry!(sam, %{"beers" => 1})
      {:ok, :removed} = BeerBoard.redeem(e.id, 1, sam, nil)
      assert {:error, :not_found} = BeerBoard.redeem(e.id, 1, sam, nil)
    end

    test "two bartenders on the last beer: exactly one pours it (S17)", %{sam: sam} do
      alex = user_with_role("employee", "bar")
      e = entry!(sam, %{"beers" => 1})
      parent = self()

      results =
        [sam, alex]
        |> Enum.map(fn who ->
          Task.async(fn ->
            Ecto.Adapters.SQL.Sandbox.allow(Repo, parent, self())
            BeerBoard.redeem(e.id, 1, who, nil)
          end)
        end)
        |> Task.await_many()

      assert Enum.sort_by(results, &inspect/1) ==
               Enum.sort_by([{:ok, :removed}, {:error, :not_found}], &inspect/1)

      assert length(
               Repo.all(from ev in Event, where: ev.entry_id == ^e.id and ev.action == "redeemed")
             ) == 1
    end
  end

  describe "update/4" do
    test "edits names and count, logging old and new (S19)", %{sam: sam} do
      e = entry!(sam, %{"beers" => 2})

      assert {:ok, %Entry{recipient_name: "Patricia", beers_remaining: 5}} =
               BeerBoard.update(
                 e.id,
                 %{"recipient_name" => "Patricia", "beers_remaining" => 5},
                 sam,
                 nil
               )

      assert [_, %Event{action: "edited", beers_before: 2, beers_after: 5, detail: detail}] =
               events(e.id)

      assert detail["from"]["recipient_name"] == "Pat"
      assert detail["to"]["recipient_name"] == "Patricia"
    end

    test "won't set the count to 0, and ignores moved-off/imported fields", %{sam: sam} do
      e = entry!(sam)
      assert {:error, cs} = BeerBoard.update(e.id, %{"beers_remaining" => 0}, sam, nil)
      assert errors_on(cs)[:beers_remaining]

      {:ok, same} =
        BeerBoard.update(e.id, %{"moved_off_board_at" => "2020-01-01T00:00:00Z"}, sam, nil)

      assert same.moved_off_board_at == e.moved_off_board_at
      assert length(events(e.id)) == 1, "no change, no event"
    end
  end

  describe "delete/3" do
    test "removes the entry and logs it", %{sam: sam} do
      e = entry!(sam)
      assert {:ok, :removed} = BeerBoard.delete(e.id, sam, nil)
      assert Repo.get(Entry, e.id) == nil
      assert [_, %Event{action: "deleted", beers_before: 3, beers_after: 0}] = events(e.id)
      assert {:error, :not_found} = BeerBoard.delete(e.id, sam, nil)
    end
  end

  describe "list_entries/0 and list_events/2" do
    test "entries For A–Z; events newest first and searchable by either name", %{sam: sam} do
      entry!(sam, %{"recipient_name" => "zed", "purchaser_name" => "Chris"})
      entry!(sam, %{"recipient_name" => "Amy", "purchaser_name" => "Lee"})
      assert Enum.map(BeerBoard.list_entries(), & &1.recipient_name) == ["Amy", "zed"]

      %{events: evs, total: 2} = BeerBoard.list_events()
      assert Enum.map(evs, & &1.recipient_name) == ["Amy", "zed"]
      assert hd(evs).actor.name == "Sam Pour"

      assert %{total: 1, events: [%{recipient_name: "zed"}]} = BeerBoard.list_events("CHR")
      assert %{total: 1} = BeerBoard.list_events("  amy ")
      assert %{total: 0} = BeerBoard.list_events("%")
    end

    test "pages 50 at a time", %{sam: sam} do
      for i <- 1..51, do: entry!(sam, %{"recipient_name" => "P#{i}"})
      assert %{total: 51, events: first} = BeerBoard.list_events(nil, 1)
      assert length(first) == 50
      assert %{events: [_]} = BeerBoard.list_events(nil, 2)
    end
  end
end
