defmodule RockcutApi.BreweryDailyTest do
  use RockcutApi.DataCase

  import Ecto.Query, only: [from: 2]
  import RockcutApi.AccountsFixtures

  alias RockcutApi.BreweryTasks
  alias RockcutApi.BreweryTasks.{DailyCheck, DailyItem, Event}

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
    items = Map.new(BreweryTasks.list_items(), &{&1.name, &1})

    %{brewer: brewer, mgr: mgr, items: items}
  end

  describe "tick/4 and untick/4 (S24–S26)" do
    test "tick and untick, with events", %{brewer: brewer, items: items} do
      temps = items["Temps"]

      assert {:ok, %DailyCheck{completed_by_id: id, on_date: @today}} =
               BreweryTasks.tick(@today, temps, brewer, @today)

      assert id == brewer.id
      assert {:ok, _} = BreweryTasks.tick("2026-10-14", items["Pressures"], brewer, @today)
      assert %{done: 2, total: 4} = card(@today)

      assert {:ok, :ok} = BreweryTasks.untick(@today, temps, brewer, @today)
      assert %{done: 1, total: 4} = card(@today)

      assert [
               %Event{action: "daily_unticked", task_id: nil, title: "Temps", detail: detail},
               %Event{action: "daily_ticked", title: "Pressures"},
               %Event{action: "daily_ticked", title: "Temps"}
             ] = daily_events()

      assert detail == %{"on_date" => "2026-10-14", "daily_item_id" => temps.id}
    end

    test "ticking twice is a no-op, logged once", %{brewer: brewer, mgr: mgr, items: items} do
      {:ok, first} = BreweryTasks.tick(@today, items["Temps"], brewer, @today)
      assert {:ok, second} = BreweryTasks.tick(@today, items["Temps"], mgr, @today)
      assert second.id == first.id
      assert second.completed_by_id == brewer.id
      assert length(daily_events()) == 1
    end

    test "unticking an unticked check is a no-op", %{brewer: brewer, items: items} do
      assert {:ok, :ok} = BreweryTasks.untick(@today, items["Temps"], brewer, @today)
      assert daily_events() == []
    end

    test "a future day is refused (S25)", %{brewer: brewer, items: items} do
      assert {:error, :future_day} = BreweryTasks.tick(@thu, items["Temps"], brewer, @today)
      assert {:error, :future_day} = BreweryTasks.untick(@thu, items["Temps"], brewer, @today)
      assert Repo.aggregate(DailyCheck, :count) == 0
    end

    test "a past day can still be ticked (S26)", %{brewer: brewer, items: items} do
      for name <- ~w(Backups Gravities Temps),
          do: {:ok, _} = BreweryTasks.tick(@tue, items[name], brewer, @today)

      assert %{done: 3, total: 4} = card(@tue)
      assert {:ok, _} = BreweryTasks.tick(@tue, items["Pressures"], brewer, @today)
      assert %{done: 4, total: 4} = card(@tue)
    end

    test "a bad date", %{brewer: brewer, items: items} do
      assert {:error, :invalid_date} = BreweryTasks.tick("tomorrow", items["Temps"], brewer)
    end

    test "a retired item can't be ticked, but can be unticked",
         %{brewer: brewer, mgr: mgr, items: items} do
      {:ok, _} = BreweryTasks.tick(@tue, items["Backups"], brewer, @today)
      {:ok, retired} = BreweryTasks.retire_item(items["Backups"], mgr)

      assert {:error, :retired} = BreweryTasks.tick(@today, retired, brewer, @today)
      assert {:ok, :ok} = BreweryTasks.untick(@tue, retired, brewer, @today)
    end
  end

  describe "daily items (S28, S29, S31)" do
    test "add at the bottom; rename; reorder", %{mgr: mgr, items: items} do
      assert {:ok, %DailyItem{name: "DO", position: 5}} =
               BreweryTasks.create_item(%{name: " DO "}, mgr)

      assert {:ok, %DailyItem{name: "Temperatures"}} =
               BreweryTasks.rename_item(items["Temps"], "Temperatures", mgr)

      ids = Enum.map(BreweryTasks.list_items(), & &1.id)
      new_order = [List.last(ids) | Enum.drop(ids, -1)]

      assert {:ok, ordered} = BreweryTasks.order_items(new_order, mgr)
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
      for n <- 5..12, do: {:ok, _} = BreweryTasks.create_item(%{name: "Item #{n}"}, mgr)
      assert {:error, :too_many_items} = BreweryTasks.create_item(%{name: "Thirteen"}, mgr)
      assert length(BreweryTasks.list_items()) == 12
    end

    test "retired items don't count against the cap", %{mgr: mgr, items: items} do
      for n <- 5..12, do: {:ok, _} = BreweryTasks.create_item(%{name: "Item #{n}"}, mgr)
      {:ok, _} = BreweryTasks.retire_item(items["Backups"], mgr)
      assert {:ok, _} = BreweryTasks.create_item(%{name: "Backups v2"}, mgr)
    end

    test "names are unique among active items, ignoring case", %{mgr: mgr, items: items} do
      assert {:error, cs} = BreweryTasks.create_item(%{name: "temps"}, mgr)
      assert %{name: ["Already on the list"]} = errors_on(cs)

      assert {:error, cs} = BreweryTasks.rename_item(items["Backups"], "TEMPS", mgr)
      assert %{name: ["Already on the list"]} = errors_on(cs)

      # Its own name in another case is fine, and a retired name is free again.
      assert {:ok, _} = BreweryTasks.rename_item(items["Temps"], "TEMPS", mgr)
      {:ok, _} = BreweryTasks.retire_item(items["Backups"], mgr)
      assert {:ok, _} = BreweryTasks.create_item(%{name: "Backups"}, mgr)
    end

    test "names are 1–40 characters", %{mgr: mgr} do
      assert {:error, cs} = BreweryTasks.create_item(%{name: "  "}, mgr)
      assert %{name: ["can't be blank"]} = errors_on(cs)
      assert {:error, cs} = BreweryTasks.create_item(%{name: String.duplicate("x", 41)}, mgr)
      assert %{name: [_]} = errors_on(cs)
    end

    test "retire closes the gap and keeps past ticks (S29)",
         %{brewer: brewer, mgr: mgr, items: items} do
      {:ok, _} = BreweryTasks.tick(@tue, items["Backups"], brewer, @today)

      assert {:ok, %DailyItem{active: false}} = BreweryTasks.retire_item(items["Backups"], mgr)

      assert Enum.map(BreweryTasks.list_items(), &{&1.name, &1.position}) ==
               [{"Gravities", 1}, {"Temps", 2}, {"Pressures", 3}]

      assert %{total: 3} = card(@today)
      assert %{items: rows, done: 1, total: 4} = card(@tue)
      assert hd(rows).item.name == "Backups"
      # A past day where it wasn't ticked doesn't show it.
      assert %{total: 3} = card(@mon)

      assert {:error, :retired} = BreweryTasks.retire_item(items["Backups"], mgr)
      assert {:error, :retired} = BreweryTasks.rename_item(items["Backups"], "B", mgr)
      assert [%Event{action: "item_retired", title: "Backups"}, _tick] = daily_events()
    end

    test "an item ticked today, then retired, still shows ticked today",
         %{brewer: brewer, mgr: mgr, items: items} do
      {:ok, _} = BreweryTasks.tick(@today, items["Backups"], brewer, @today)
      {:ok, _} = BreweryTasks.retire_item(items["Backups"], mgr)

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
      {:ok, retired} = BreweryTasks.retire_item(items["Temps"], mgr)

      assert {:error, :retired} = BreweryTasks.rename_item(retired, "Temperature", mgr)
      assert {:error, :retired} = BreweryTasks.retire_item(retired, mgr)
      assert BreweryTasks.get_item(retired.id).name == "Temps"
    end

    test "order_items needs exactly the active ids", %{mgr: mgr} do
      ids = Enum.map(BreweryTasks.list_items(), & &1.id)
      assert {:error, :invalid_order} = BreweryTasks.order_items(Enum.drop(ids, 1), mgr)
      assert {:error, :invalid_order} = BreweryTasks.order_items([hd(ids) | ids], mgr)
      assert {:error, :invalid_order} = BreweryTasks.order_items("1,2", mgr)

      assert {:ok, _} = BreweryTasks.order_items(Enum.map(ids, &to_string/1), mgr)
      assert daily_events() == []
    end
  end

  describe "daily_cards/2: which items a day counts" do
    test "a new item doesn't show on days before it was added (G4)",
         %{brewer: brewer, mgr: mgr, items: items} do
      do_item = added_tuesday!("DO", mgr)

      for name <- ~w(Backups Gravities Pressures),
          do: {:ok, _} = BreweryTasks.tick(@mon, items[name], brewer, @today)

      cards = BreweryTasks.daily_cards(Date.range(@mon, @thu), @today)

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

      assert {:error, :not_yet_added} = BreweryTasks.tick(@mon, do_item, brewer, @today)
      assert %{done: 0, total: 4} = card(@mon)
      # The day it was added is fine, and so is today.
      assert {:ok, _} = BreweryTasks.tick(@tue, do_item, brewer, @today)
      assert {:ok, _} = BreweryTasks.tick(@today, do_item, brewer, @today)
      assert %{done: 1, total: 5} = card(@tue)
    end

    test "an item added today shows and can be ticked today", %{brewer: brewer, mgr: mgr} do
      {:ok, do_item} = BreweryTasks.create_item(%{name: "DO"}, mgr)
      today = BreweryTasks.today()

      assert %{done: 0, total: 5} = BreweryTasks.daily_cards([today])[today]
      assert {:ok, _} = BreweryTasks.tick(today, do_item, brewer)
      assert %{done: 1, total: 5} = BreweryTasks.daily_cards([today])[today]
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
      {:ok, _} = BreweryTasks.tick(@mon, items["Temps"], brewer, @today)
      {:ok, _} = BreweryTasks.rename_item(items["Temps"], "Temperatures", mgr)

      %{items: rows} = card(@mon)
      row = Enum.find(rows, & &1.check)
      assert row.item.name == "Temperatures"
      assert row.check.completed_by.name == "Kate Brewer"
    end

    test "an empty range" do
      assert BreweryTasks.daily_cards([], @today) == %{}
    end
  end

  # Added Tue 10/13 at noon Colorado.
  defp added_tuesday!(name, mgr) do
    {:ok, item} = BreweryTasks.create_item(%{name: name}, mgr)
    item |> Ecto.Changeset.change(inserted_at: ~U[2026-10-13 18:00:00Z]) |> Repo.update!()
  end

  defp card(day), do: BreweryTasks.daily_cards([day], @today)[day]

  defp daily_events,
    do: Repo.all(from e in Event, where: is_nil(e.task_id), order_by: [desc: e.id])
end
