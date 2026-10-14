defmodule RockcutApi.DailyTest do
  use RockcutApi.DataCase

  import RockcutApi.TaskFixtures

  import Ecto.Query, only: [from: 2]
  import RockcutApi.AccountsFixtures

  alias RockcutApi.Tasks
  alias RockcutApi.Tasks.{DailyCheck, DailyItem, Event}

  @mon ~D[2026-10-12]
  @tue ~D[2026-10-13]
  @today ~D[2026-10-14]
  @thu ~D[2026-10-15]

  setup do
    department_fixture("brewery")
    # The defaults have been on the card all year.
    Repo.update_all(DailyItem, set: [inserted_at: ~U[2026-01-01 12:00:00Z]])

    brewer = user_with_role("employee", "brewery", %{name: "Kate Brewer"})
    mgr = user_with_role("manager", "brewery")
    items = Map.new(Tasks.list_items(brewery_board()), &{&1.name, &1})

    %{brewer: brewer, mgr: mgr, items: items}
  end

  describe "tick/4 and untick/4 (S24–S26)" do
    test "tick and untick, with events", %{brewer: brewer, items: items} do
      temps = items["Temps"]

      assert {:ok, %DailyCheck{completed_by_id: id, on_date: @today}} =
               Tasks.tick(brewery_board(), @today, temps, brewer, @today)

      assert id == brewer.id

      assert {:ok, _} =
               Tasks.tick(brewery_board(), "2026-10-14", items["Pressures"], brewer, @today)

      assert %{done: 2, total: 4} = card(@today)

      assert {:ok, :ok} = Tasks.untick(brewery_board(), @today, temps, brewer, @today)
      assert %{done: 1, total: 4} = card(@today)

      assert [
               %Event{action: "daily_unticked", task_id: nil, title: "Temps", detail: detail},
               %Event{action: "daily_ticked", title: "Pressures"},
               %Event{action: "daily_ticked", title: "Temps"}
             ] = daily_events()

      assert detail == %{"on_date" => "2026-10-14", "daily_item_id" => temps.id}
    end

    test "ticking twice is a no-op, logged once", %{brewer: brewer, mgr: mgr, items: items} do
      {:ok, first} = Tasks.tick(brewery_board(), @today, items["Temps"], brewer, @today)
      assert {:ok, second} = Tasks.tick(brewery_board(), @today, items["Temps"], mgr, @today)
      assert second.id == first.id
      assert second.completed_by_id == brewer.id
      assert length(daily_events()) == 1
    end

    test "unticking an unticked check is a no-op", %{brewer: brewer, items: items} do
      assert {:ok, :ok} = Tasks.untick(brewery_board(), @today, items["Temps"], brewer, @today)
      assert daily_events() == []
    end

    test "a future day is refused (S25)", %{brewer: brewer, items: items} do
      assert {:error, :future_day} =
               Tasks.tick(brewery_board(), @thu, items["Temps"], brewer, @today)

      assert {:error, :future_day} =
               Tasks.untick(brewery_board(), @thu, items["Temps"], brewer, @today)

      assert Repo.aggregate(DailyCheck, :count) == 0
    end

    test "a past day can still be ticked (S26)", %{brewer: brewer, items: items} do
      for name <- ~w(Backups Gravities Temps),
          do: {:ok, _} = Tasks.tick(brewery_board(), @tue, items[name], brewer, @today)

      assert %{done: 3, total: 4} = card(@tue)
      assert {:ok, _} = Tasks.tick(brewery_board(), @tue, items["Pressures"], brewer, @today)
      assert %{done: 4, total: 4} = card(@tue)
    end

    test "a bad date", %{brewer: brewer, items: items} do
      assert {:error, :invalid_date} =
               Tasks.tick(brewery_board(), "tomorrow", items["Temps"], brewer)
    end

    test "a retired item can't be ticked or unticked; its ticks are kept (Decision 1, O-3)",
         %{brewer: brewer, mgr: mgr, items: items} do
      {:ok, _} = Tasks.tick(brewery_board(), @tue, items["Backups"], brewer, @today)
      {:ok, _} = Tasks.tick(brewery_board(), @today, items["Backups"], brewer, @today)
      {:ok, retired} = Tasks.retire_item(brewery_board(), items["Backups"], mgr)

      assert {:error, :retired} = Tasks.tick(brewery_board(), @today, retired, brewer, @today)
      assert {:error, :retired} = Tasks.untick(brewery_board(), @tue, retired, brewer, @today)
      assert {:error, :retired} = Tasks.untick(brewery_board(), @today, retired, brewer, @today)
      assert Repo.aggregate(DailyCheck, :count) == 2
      refute Enum.any?(daily_events(), &(&1.action == "daily_unticked"))
    end
  end

  describe "daily items (S28, S29, S31)" do
    test "add at the bottom; rename; reorder", %{mgr: mgr, items: items} do
      assert {:ok, %DailyItem{name: "DO", position: 5}} =
               Tasks.create_item(brewery_board(), %{name: " DO "}, mgr)

      assert {:ok, %DailyItem{name: "Temperatures"}} =
               Tasks.rename_item(brewery_board(), items["Temps"], "Temperatures", mgr)

      ids = Enum.map(Tasks.list_items(brewery_board()), & &1.id)
      new_order = [List.last(ids) | Enum.drop(ids, -1)]

      assert {:ok, ordered} = Tasks.order_items(brewery_board(), new_order, mgr)
      assert Enum.map(ordered, & &1.name) == ~w(DO Backups Gravities Temperatures Pressures)
      assert Enum.map(ordered, & &1.position) == [1, 2, 3, 4, 5]

      assert [
               %Event{action: "item_reordered", detail: %{"from" => ^ids, "to" => ^new_order}},
               %Event{
                 action: "item_renamed",
                 title: "Temperatures",
                 detail: %{"from" => "Temps", "to" => "Temperatures"}
               },
               %Event{action: "item_added", title: "DO"}
             ] = daily_events()
    end

    test "at most 12 active items", %{mgr: mgr} do
      for n <- 5..12, do: {:ok, _} = Tasks.create_item(brewery_board(), %{name: "Item #{n}"}, mgr)

      assert {:error, :too_many_items} =
               Tasks.create_item(brewery_board(), %{name: "Thirteen"}, mgr)

      assert length(Tasks.list_items(brewery_board())) == 12
    end

    test "retired items don't count against the cap", %{mgr: mgr, items: items} do
      for n <- 5..12, do: {:ok, _} = Tasks.create_item(brewery_board(), %{name: "Item #{n}"}, mgr)
      {:ok, _} = Tasks.retire_item(brewery_board(), items["Backups"], mgr)
      assert {:ok, _} = Tasks.create_item(brewery_board(), %{name: "Backups v2"}, mgr)
    end

    test "names are unique among active items, ignoring case", %{mgr: mgr, items: items} do
      assert {:error, cs} = Tasks.create_item(brewery_board(), %{name: "temps"}, mgr)
      assert %{name: ["Already on the list"]} = errors_on(cs)

      assert {:error, cs} = Tasks.rename_item(brewery_board(), items["Backups"], "TEMPS", mgr)
      assert %{name: ["Already on the list"]} = errors_on(cs)

      # Its own name in another case is fine, and a retired name is free again.
      assert {:ok, _} = Tasks.rename_item(brewery_board(), items["Temps"], "TEMPS", mgr)
      {:ok, _} = Tasks.retire_item(brewery_board(), items["Backups"], mgr)
      assert {:ok, _} = Tasks.create_item(brewery_board(), %{name: "Backups"}, mgr)
    end

    test "names are 1–40 characters", %{mgr: mgr} do
      assert {:error, cs} = Tasks.create_item(brewery_board(), %{name: "  "}, mgr)
      assert %{name: ["can't be blank"]} = errors_on(cs)

      assert {:error, cs} =
               Tasks.create_item(brewery_board(), %{name: String.duplicate("x", 41)}, mgr)

      assert %{name: [_]} = errors_on(cs)
    end

    test "retire closes the gap and keeps past ticks (S29)",
         %{brewer: brewer, mgr: mgr, items: items} do
      {:ok, _} = Tasks.tick(brewery_board(), @tue, items["Backups"], brewer, @today)

      assert {:ok, %DailyItem{active: false}} =
               Tasks.retire_item(brewery_board(), items["Backups"], mgr)

      assert Enum.map(Tasks.list_items(brewery_board()), &{&1.name, &1.position}) ==
               [{"Gravities", 1}, {"Temps", 2}, {"Pressures", 3}]

      assert %{total: 3} = card(@today)
      assert %{items: rows, done: 1, total: 4} = card(@tue)
      assert hd(rows).item.name == "Backups"
      # A past day where it wasn't ticked doesn't show it.
      assert %{total: 3} = card(@mon)

      assert {:error, :retired} = Tasks.retire_item(brewery_board(), items["Backups"], mgr)
      assert {:error, :retired} = Tasks.rename_item(brewery_board(), items["Backups"], "B", mgr)
      assert [%Event{action: "item_retired", title: "Backups"}, _tick] = daily_events()
    end

    test "an item ticked today, then retired, still shows ticked today",
         %{brewer: brewer, mgr: mgr, items: items} do
      {:ok, _} = Tasks.tick(brewery_board(), @today, items["Backups"], brewer, @today)
      {:ok, _} = Tasks.retire_item(brewery_board(), items["Backups"], mgr)

      assert %{items: rows, done: 1, total: 4} = card(@today)
      assert %{item: %DailyItem{name: "Backups", active: false}, check: %{}} = hd(rows)
      # Future days show the active items only.
      assert %{items: future, done: 0, total: 3} = card(@thu)
      refute Enum.any?(future, &(&1.item.name == "Backups"))
    end

    test "renaming or retiring a retired item is refused as retired (GAP-1)", %{
      mgr: mgr,
      items: items
    } do
      {:ok, retired} = Tasks.retire_item(brewery_board(), items["Temps"], mgr)

      assert {:error, :retired} = Tasks.rename_item(brewery_board(), retired, "Temperature", mgr)
      assert {:error, :retired} = Tasks.retire_item(brewery_board(), retired, mgr)
      assert Tasks.get_item(brewery_board(), retired.id).name == "Temps"
    end

    test "order_items needs exactly the active ids", %{mgr: mgr} do
      ids = Enum.map(Tasks.list_items(brewery_board()), & &1.id)
      assert {:error, :invalid_order} = Tasks.order_items(brewery_board(), Enum.drop(ids, 1), mgr)
      assert {:error, :invalid_order} = Tasks.order_items(brewery_board(), [hd(ids) | ids], mgr)
      assert {:error, :invalid_order} = Tasks.order_items(brewery_board(), "1,2", mgr)

      assert {:ok, _} = Tasks.order_items(brewery_board(), Enum.map(ids, &to_string/1), mgr)
      assert daily_events() == []
    end
  end

  describe "restore_item/2 (S75)" do
    test "back at the bottom with its past ticks; past days show it as before it was retired; logged",
         %{brewer: brewer, mgr: mgr, items: items} do
      {:ok, _} = Tasks.tick(brewery_board(), @mon, items["Temps"], brewer, @today)

      summary = fn day ->
        c = card(day)
        {c.done, c.total, Enum.sort(Enum.map(c.items, &{&1.item.name, &1.check != nil}))}
      end

      before = {summary.(@mon), summary.(@tue)}
      {:ok, retired} = Tasks.retire_item(brewery_board(), items["Temps"], mgr)
      # Retired: Tuesday (not ticked) stops counting it; Monday keeps its tick.
      assert %{total: 3} = card(@tue)

      assert {:ok, restored} = Tasks.restore_item(brewery_board(), retired, mgr)
      assert restored.active

      assert Enum.map(Tasks.list_items(brewery_board()), & &1.name) ==
               ~w(Backups Gravities Pressures Temps)

      assert Enum.map(Tasks.list_items(brewery_board()), & &1.position) == [
               1,
               2,
               3,
               4
             ]

      assert {summary.(@mon), summary.(@tue)} == before
      assert Enum.any?(card(@mon).items, &(&1.item.name == "Temps" and &1.check))
      assert Enum.any?(card(@thu).items, &(&1.item.name == "Temps"))
      # It can be ticked again, on a past day too.
      assert {:ok, _} = Tasks.tick(brewery_board(), @tue, restored, brewer, @today)

      assert [%Event{action: "item_restored", title: "Temps", actor_id: actor} | _] =
               Enum.drop(daily_events(), 1)

      assert actor == mgr.id
    end

    test "refused at #{Tasks.max_items()} active items", %{mgr: mgr, items: items} do
      {:ok, retired} = Tasks.retire_item(brewery_board(), items["Temps"], mgr)
      for n <- 1..9, do: {:ok, _} = Tasks.create_item(brewery_board(), %{name: "Item #{n}"}, mgr)

      assert {:error, :too_many_items} = Tasks.restore_item(brewery_board(), retired, mgr)
      refute Tasks.get_item(brewery_board(), retired.id).active
    end

    test "refused when an active item has the name, ignoring case", %{mgr: mgr, items: items} do
      {:ok, retired} = Tasks.retire_item(brewery_board(), items["Temps"], mgr)
      {:ok, _} = Tasks.create_item(brewery_board(), %{name: "TEMPS"}, mgr)

      assert {:error, %Ecto.Changeset{errors: [name: {"Already on the list", _}]}} =
               Tasks.restore_item(brewery_board(), retired, mgr)

      refute Tasks.get_item(brewery_board(), retired.id).active
    end

    test "an active item is returned unchanged, with no event", %{mgr: mgr, items: items} do
      events = length(daily_events())
      assert {:ok, item} = Tasks.restore_item(brewery_board(), items["Temps"], mgr)
      assert item == items["Temps"]
      assert length(daily_events()) == events
    end
  end

  describe "retired spans: a restored item stays off the days it was retired (Decision 5)" do
    # Retired Sat 10/10, restored Tue 10/13 (noon Colorado): out 10/10–10/12.
    test "the retired days' totals leave it out; the days before and after count it",
         %{mgr: mgr, items: items} do
      off_and_back!(items["Temps"], mgr, ~D[2026-10-10], ~D[2026-10-13])
      cards = Tasks.daily_cards(brewery_board(), Date.range(~D[2026-10-09], @thu), @today)

      totals = Map.new(cards, fn {day, c} -> {day.day, c.total} end)
      assert totals == %{9 => 4, 10 => 3, 11 => 3, 12 => 3, 13 => 4, 14 => 4, 15 => 4}
      refute Enum.any?(cards[~D[2026-10-11]].items, &(&1.item.name == "Temps"))
    end

    test "retired and restored twice: both spans are out", %{mgr: mgr, items: items} do
      temps = off_and_back!(items["Temps"], mgr, ~D[2026-10-06], ~D[2026-10-08])
      off_and_back!(temps, mgr, ~D[2026-10-10], ~D[2026-10-13])

      assert Tasks.retired_spans(temps.id) == %{
               temps.id => [
                 {~D[2026-10-06], ~D[2026-10-07]},
                 {~D[2026-10-10], ~D[2026-10-12]}
               ]
             }

      cards = Tasks.daily_cards(brewery_board(), Date.range(~D[2026-10-05], @tue), @today)
      out = for {day, %{total: 3}} <- cards, do: day.day
      assert Enum.sort(out) == [6, 7, 10, 11, 12]
    end

    test "retired and restored the same day leaves no gap", %{mgr: mgr, items: items} do
      off_and_back!(items["Temps"], mgr, @mon, @mon)
      assert %{total: 4} = card(@mon)
    end

    test "a tick from the retire day, made before retiring, still shows",
         %{brewer: brewer, mgr: mgr, items: items} do
      {:ok, _} = Tasks.tick(brewery_board(), ~D[2026-10-10], items["Temps"], brewer, @today)
      off_and_back!(items["Temps"], mgr, ~D[2026-10-10], ~D[2026-10-13])

      assert %{done: 1, total: 4} = card(~D[2026-10-10])
      assert %{done: 0, total: 3} = card(~D[2026-10-11])
    end

    test "a day inside a retired span can't be ticked or unticked; the days around it can",
         %{brewer: brewer, mgr: mgr, items: items} do
      temps = off_and_back!(items["Temps"], mgr, ~D[2026-10-10], ~D[2026-10-13])

      assert {:error, :retired} =
               Tasks.tick(brewery_board(), ~D[2026-10-10], temps, brewer, @today)

      assert {:error, :retired} =
               Tasks.tick(brewery_board(), ~D[2026-10-12], temps, brewer, @today)

      assert {:error, :retired} =
               Tasks.untick(brewery_board(), ~D[2026-10-11], temps, brewer, @today)

      assert {:ok, _} = Tasks.tick(brewery_board(), ~D[2026-10-09], temps, brewer, @today)
      assert {:ok, _} = Tasks.tick(brewery_board(), @tue, temps, brewer, @today)
      assert %{done: 0, total: 3} = card(~D[2026-10-12])
    end
  end

  describe "daily_cards/2: which items a day counts" do
    test "a new item doesn't show on days before it was added (G4)",
         %{brewer: brewer, mgr: mgr, items: items} do
      do_item = added_tuesday!("DO", mgr)

      for name <- ~w(Backups Gravities Pressures),
          do: {:ok, _} = Tasks.tick(brewery_board(), @mon, items[name], brewer, @today)

      cards = Tasks.daily_cards(brewery_board(), Date.range(@mon, @thu), @today)

      # Monday: DO isn't there; the card is 3/4 over four rows.
      assert %{done: 3, total: 4, items: mon_rows} = cards[@mon]
      assert Enum.map(mon_rows, & &1.item.name) == ~w(Backups Gravities Temps Pressures)
      # From Tuesday on (and on future days) it's on the card.
      for day <- [@tue, @today, @thu] do
        assert %{done: 0, total: 5, items: rows} = cards[day]
        assert Enum.any?(rows, &(&1.item.id == do_item.id))
      end
    end

    test "a day before an item was added can't be ticked (G4)",
         %{brewer: brewer, mgr: mgr} do
      do_item = added_tuesday!("DO", mgr)

      assert {:error, :not_yet_added} = Tasks.tick(brewery_board(), @mon, do_item, brewer, @today)
      assert %{done: 0, total: 4} = card(@mon)
      # The day it was added is fine, and so is today.
      assert {:ok, _} = Tasks.tick(brewery_board(), @tue, do_item, brewer, @today)
      assert {:ok, _} = Tasks.tick(brewery_board(), @today, do_item, brewer, @today)
      assert %{done: 1, total: 5} = card(@tue)
    end

    test "an item added today shows and can be ticked today", %{brewer: brewer, mgr: mgr} do
      {:ok, do_item} = Tasks.create_item(brewery_board(), %{name: "DO"}, mgr)
      today = Tasks.today()

      assert %{done: 0, total: 5} = Tasks.daily_cards(brewery_board(), [today])[today]
      assert {:ok, _} = Tasks.tick(brewery_board(), today, do_item, brewer)
      assert %{done: 1, total: 5} = Tasks.daily_cards(brewery_board(), [today])[today]
    end

    test "a check from before an item was added still shows and counts",
         %{brewer: brewer, mgr: mgr} do
      do_item = added_tuesday!("DO", mgr)

      # Written before G4 refused it.
      Repo.insert!(%DailyCheck{
        department_id: do_item.department_id,
        on_date: @mon,
        daily_item_id: do_item.id,
        completed_by_id: brewer.id,
        completed_at: ~U[2026-10-14 15:00:00Z]
      })

      assert %{done: 1, total: 5} = card(@mon)
    end

    test "a rename shows on past days; a check carries who ticked it",
         %{brewer: brewer, mgr: mgr, items: items} do
      {:ok, _} = Tasks.tick(brewery_board(), @mon, items["Temps"], brewer, @today)
      {:ok, _} = Tasks.rename_item(brewery_board(), items["Temps"], "Temperatures", mgr)

      %{items: rows} = card(@mon)
      row = Enum.find(rows, & &1.check)
      assert row.item.name == "Temperatures"
      assert row.check.completed_by.name == "Kate Brewer"
    end

    test "an empty range" do
      assert Tasks.daily_cards(brewery_board(), [], @today) == %{}
    end
  end

  # Added Tue 10/13 at noon Colorado.
  defp added_tuesday!(name, mgr) do
    {:ok, item} = Tasks.create_item(brewery_board(), %{name: name}, mgr)
    item |> Ecto.Changeset.change(inserted_at: ~U[2026-10-13 18:00:00Z]) |> Repo.update!()
  end

  # Retire `item` at noon Colorado on `off`, restore it at noon on `back`.
  defp off_and_back!(item, mgr, off, back) do
    {:ok, retired} = Tasks.retire_item(brewery_board(), item, mgr)
    backdate_last_event!(off)
    {:ok, restored} = Tasks.restore_item(brewery_board(), retired, mgr)
    backdate_last_event!(back)
    restored
  end

  defp backdate_last_event!(day) do
    [event | _] = daily_events()
    at = DateTime.new!(day, ~T[18:00:00], "Etc/UTC")
    event |> Ecto.Changeset.change(inserted_at: at) |> Repo.update!()
  end

  defp card(day), do: Tasks.daily_cards(brewery_board(), [day], @today)[day]

  defp daily_events,
    do: Repo.all(from e in Event, where: is_nil(e.task_id), order_by: [desc: e.id])
end
