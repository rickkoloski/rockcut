defmodule RockcutApi.BeerBoardImportTest do
  @moduledoc "D37 §3.6: import planning and applying (S21–S25, S27, S28, S30)."
  use RockcutApi.DataCase, async: false

  import RockcutApi.AccountsFixtures
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{BeerBoard, Repo}
  alias RockcutApi.Accounts.AuditEntry
  alias RockcutApi.BeerBoard.{Csv, Entry, Event, Import}

  @fixtures Path.expand("../fixtures/beer_board", __DIR__)

  setup do
    %{
      mgr: user_with_role("manager", "bar", %{name: "Rae Tap"}),
      sam: user_with_role("employee", "bar", %{name: "Sam Pour"})
    }
  end

  defp rows!(name), do: elem(Csv.parse(File.read!(Path.join(@fixtures, name))), 1)

  defp rows_from(csv) do
    {:ok, rows} = Csv.parse(csv)
    rows
  end

  defp board!(sam, recipient, purchaser, beers, moved_off \\ nil) do
    {:ok, e} =
      BeerBoard.create(
        %{"recipient_name" => recipient, "purchaser_name" => purchaser, "beers" => beers},
        sam,
        nil
      )

    if moved_off,
      do: e |> Ecto.Changeset.change(moved_off_board_at: moved_off) |> Repo.update!(),
      else: e
  end

  # The client's round trip: rows go out as JSON and come back with string keys.
  defp wire(rows), do: rows |> Jason.encode!() |> Jason.decode!()

  defp preview(rows, mode), do: Import.plan(rows, BeerBoard.list_entries(), mode)

  defp import!(rows, mode, resolutions, actor) do
    plan = preview(rows, mode)
    Import.apply(mode, wire(rows), resolutions, plan.signature, actor, file_name: "f.csv")
  end

  defp board_names do
    BeerBoard.list_entries()
    |> Enum.map(&{&1.recipient_name, &1.purchaser_name, &1.beers_remaining})
    |> Enum.sort()
  end

  defp import_events,
    do:
      Repo.all(
        from ev in Event,
          where: fragment("json_extract(?, '$.source') = 'import'", ev.detail),
          order_by: ev.id
      )

  describe "plan/3" do
    test "S21: add mode groups the board and the file on the For name only", %{sam: sam} do
      pat = board!(sam, "Pat", "Chris", 2)
      plan = preview(rows!("duplicates.csv"), "add")

      assert Enum.map(plan.new, & &1.recipient_name) == ["Ana"]
      assert [g_pat, g_sam] = plan.groups
      assert g_pat.key == "pat"

      assert Enum.map(g_pat.items, &{&1.source, &1.id}) == [
               {"board", "b:#{pat.id}"},
               {"file", "r:2"}
             ]

      assert g_pat.combined_purchaser == "Chris & Lee"
      assert {g_pat.total, g_pat.combinable} == {5, true}
      assert Enum.map(g_sam.items, & &1.purchaser_name) == ["Jo", "Kim"]
      assert plan.board == %{count: 1, beers: 2}
    end

    test "board-only duplicates with nothing new aren't raised", %{sam: sam} do
      board!(sam, "Pat", "Chris", 2)
      board!(sam, "pat ", "Lee", 1)
      plan = preview(rows_from("For,Bought by,Beers\nAna,Bo,1\n"), "add")
      assert plan.groups == []
      assert length(plan.new) == 1
    end

    test "replace mode groups file rows only", %{sam: sam} do
      board!(sam, "Ana", "Chris", 2)
      plan = preview(rows_from("For,Bought by,Beers\nAna,Bo,1\nANA,Cy,2\nPat,Lee,1\n"), "replace")
      assert [%{key: "ana", items: items}] = plan.groups
      assert Enum.all?(items, &(&1.source == "file"))
      assert Enum.map(plan.new, & &1.recipient_name) == ["Pat"]
    end

    test "names match after trimming, collapsing spaces and case", %{sam: sam} do
      board!(sam, "Pat Smith", "Chris", 2)
      assert [_] = preview(rows_from("For,Bought by,Beers\n  pat   SMITH ,Lee,1\n"), "add").groups
    end

    test "items run earliest first; purchasers join without repeats", %{sam: sam} do
      board!(sam, "Pat", "Lee", 2, ~U[2026-09-10 12:00:00Z])

      rows =
        rows_from(
          "For,Bought by,Beers,Moved off board\nPat,chris,1,\nPat,Chris,1,2026-09-01\nPat,LEE,1,2026-09-20\n"
        )

      [g] = preview(rows, "add").groups
      assert Enum.map(g.items, & &1.purchaser_name) == ["Chris", "Lee", "LEE", "chris"]
      assert g.combined_purchaser == "Chris & Lee"
    end

    test "S24: over 99 can't combine", %{sam: sam} do
      board!(sam, "Pat", "Chris", 60)
      [g] = preview(rows_from("For,Bought by,Beers\nPat,Lee,60\n"), "add").groups
      assert {g.total, g.combinable} == {120, false}
    end
  end

  describe "apply/6" do
    test "S22: Combine Pat, Allow Sam", %{sam: sam, mgr: mgr} do
      pat = board!(sam, "Pat", "Chris", 2, ~U[2026-09-01 12:00:00Z])

      assert {:ok, counts} =
               import!(
                 rows!("duplicates.csv"),
                 "add",
                 %{
                   "pat" => %{"choice" => "combine", "purchaser_name" => "Chris & Lee"},
                   "sam" => %{"choice" => "allow"}
                 },
                 mgr
               )

      assert counts == %{imported: 3, combined: 1, deleted: 0, skipped: 0, removed: 0}

      assert board_names() ==
               [{"Ana", "Bo", 1}, {"Pat", "Chris & Lee", 5}, {"Sam", "Jo", 1}, {"Sam", "Kim", 2}]

      kept = Repo.get!(Entry, pat.id)
      assert kept.moved_off_board_at == ~U[2026-09-01 12:00:00Z]
      assert kept.imported_at == nil

      others = Repo.all(from e in Entry, where: e.id != ^pat.id)
      assert Enum.all?(others, &(&1.imported_at != nil))
      # No date in the file → moved off at the import time.
      assert Enum.all?(others, &(&1.moved_off_board_at == &1.imported_at))

      {[edited], created} = Enum.split_with(import_events(), &(&1.action == "edited"))
      assert {edited.action, edited.beers_before, edited.beers_after} == {"edited", 2, 5}
      assert edited.actor_id == mgr.id and edited.device_id == nil
      assert edited.detail["from"]["purchaser_name"] == "Chris"
      assert Enum.map(created, & &1.action) == ~w(created created created)

      assert [%AuditEntry{actor_id: actor, detail: detail}] =
               Repo.all(from a in AuditEntry, where: a.action == "beer_board.import")

      assert actor == mgr.id

      assert detail == %{
               "mode" => "add",
               "file_name" => "f.csv",
               "imported" => 3,
               "combined" => 1,
               "deleted" => 0,
               "skipped" => 0,
               "removed" => 0
             }
    end

    test "S23: Pick deletes an unchecked board entry and imports the checked row",
         %{sam: sam, mgr: mgr} do
      board!(sam, "Pat", "Chris", 2)
      rows = rows_from("For,Bought by,Beers\npat,Lee,3\n")

      assert {:ok, %{imported: 1, deleted: 1}} =
               import!(rows, "add", %{"pat" => %{"choice" => "pick", "keep" => ["r:2"]}}, mgr)

      assert board_names() == [{"pat", "Lee", 3}]

      assert Enum.map(import_events(), &{&1.action, &1.purchaser_name}) ==
               [{"deleted", "Chris"}, {"created", "Lee"}]
    end

    test "Pick skips an unchecked file row and keeps a checked board entry", %{sam: sam, mgr: mgr} do
      pat = board!(sam, "Pat", "Chris", 2)
      rows = rows_from("For,Bought by,Beers\nPat,Lee,3\n")

      assert {:ok, %{imported: 0, deleted: 0, skipped: 1}} =
               import!(
                 rows,
                 "add",
                 %{"pat" => %{"choice" => "pick", "keep" => ["b:#{pat.id}"]}},
                 mgr
               )

      assert board_names() == [{"Pat", "Chris", 2}]
    end

    test "Combine over several board entries keeps the earliest and deletes the rest",
         %{sam: sam, mgr: mgr} do
      late = board!(sam, "Pat", "Kim", 1, ~U[2026-09-10 12:00:00Z])
      early = board!(sam, "Pat", "Chris", 2, ~U[2026-09-01 12:00:00Z])

      early
      |> Ecto.Changeset.change(imported_at: ~U[2026-09-02 00:00:00Z])
      |> Repo.update!()

      rows = rows_from("For,Bought by,Beers,Moved off board\nPat,Lee,3,2026-08-15\n")

      assert {:ok, %{combined: 1, deleted: 1, imported: 0}} =
               import!(rows, "add", %{"pat" => %{"choice" => "combine"}}, mgr)

      kept = Repo.get!(Entry, early.id)
      assert {kept.beers_remaining, kept.purchaser_name} == {6, "Lee & Chris & Kim"}
      # The earliest date in the group (the file row's), and the kept entry's import date.
      assert kept.moved_off_board_at == ~U[2026-08-15 06:00:00Z]
      assert kept.imported_at == ~U[2026-09-02 00:00:00Z]
      refute Repo.get(Entry, late.id)

      assert [%{action: "edited"}, %{action: "deleted", detail: detail}] = import_events()
      assert detail["combined_into"] == early.id
    end

    test "Combine of file rows only is one new entry", %{mgr: mgr} do
      rows = rows_from("For,Bought by,Beers\nSam,Jo,1\nSam,Kim,2\n")

      assert {:ok, %{combined: 1, imported: 1}} =
               import!(rows, "add", %{"sam" => %{"choice" => "combine"}}, mgr)

      assert [%Entry{beers_remaining: 3, purchaser_name: "Jo & Kim", imported_at: %DateTime{}}] =
               BeerBoard.list_entries()
    end

    test "S24: Combine over 99 is refused; nothing changes", %{sam: sam, mgr: mgr} do
      board!(sam, "Pat", "Chris", 60)
      rows = rows_from("For,Bought by,Beers\nPat,Lee,60\nAna,Bo,1\n")

      assert {:error, {:invalid, [%{message: "Pat: can't combine, over 99 beers"}]}} =
               import!(rows, "add", %{"pat" => %{"choice" => "combine"}}, mgr)

      assert board_names() == [{"Pat", "Chris", 60}]
    end

    test "every group needs a choice; Combine's Bought by fits 80", %{mgr: mgr} do
      rows = rows_from("For,Bought by,Beers\nSam,Jo,1\nSam,Kim,2\n")
      assert {:error, {:invalid, [%{group: "sam"}]}} = import!(rows, "add", %{}, mgr)

      assert {:error, {:invalid, [%{message: "Sam: Bought by is longer than 80 characters"}]}} =
               import!(
                 rows,
                 "add",
                 %{
                   "sam" => %{
                     "choice" => "combine",
                     "purchaser_name" => String.duplicate("x", 81)
                   }
                 },
                 mgr
               )

      assert BeerBoard.list_entries() == []
    end

    test "S25: Replace deletes the board, then applies the file", %{sam: sam, mgr: mgr} do
      for n <- ~w(A B C D), do: board!(sam, n, "X", 2)
      rows = rows_from("For,Bought by,Beers\nAna,Bo,1\nAna,Cy,2\n")
      assert preview(rows, "replace").board == %{count: 4, beers: 8}

      assert {:ok, %{removed: 4, imported: 2}} =
               import!(rows, "replace", %{"ana" => %{"choice" => "allow"}}, mgr)

      assert board_names() == [{"Ana", "Bo", 1}, {"Ana", "Cy", 2}]

      assert Enum.map(import_events(), & &1.action) ==
               ~w(deleted deleted deleted deleted created created)
    end

    test "S28: export, then Replace with the same file: same lines and dates, new import date",
         %{sam: sam, mgr: mgr} do
      board!(sam, "Pat", "Chris", 2, ~U[2026-09-01 12:00:00Z])
      board!(sam, "Smith, Ana", "Bo", 4, ~U[2026-09-03 12:00:00Z])

      before =
        Enum.map(
          BeerBoard.list_entries(),
          &{&1.recipient_name, &1.purchaser_name, &1.beers_remaining, &1.moved_off_board_at}
        )

      rows = rows_from(Csv.entries_csv(BeerBoard.list_entries()))
      assert {:ok, %{removed: 2, imported: 2}} = import!(rows, "replace", %{}, mgr)

      after_ = BeerBoard.list_entries()

      assert Enum.map(
               after_,
               &{&1.recipient_name, &1.purchaser_name, &1.beers_remaining, &1.moved_off_board_at}
             ) == before

      assert Enum.all?(after_, &(DateTime.diff(DateTime.utc_now(), &1.imported_at) < 5))
    end

    test "S27: the board changed since the preview → stale, nothing applied", %{
      sam: sam,
      mgr: mgr
    } do
      rows = rows!("duplicates.csv")
      plan = preview(rows, "add")
      board!(sam, "Ana", "Kim", 1)

      assert {:error, :stale} =
               Import.apply(
                 "add",
                 wire(rows),
                 %{"pat" => %{"choice" => "allow"}, "sam" => %{"choice" => "allow"}},
                 plan.signature,
                 mgr
               )

      assert length(BeerBoard.list_entries()) == 1
      assert [_] = preview(rows, "add").groups |> Enum.filter(&(&1.key == "ana"))
    end

    test "a group member's count changing is stale too", %{sam: sam, mgr: mgr} do
      pat = board!(sam, "Pat", "Chris", 2)
      rows = rows_from("For,Bought by,Beers\nPat,Lee,1\n")
      plan = preview(rows, "add")
      {:ok, _} = BeerBoard.redeem(pat.id, 1, sam, nil)

      assert {:error, :stale} =
               Import.apply(
                 "add",
                 wire(rows),
                 %{"pat" => %{"choice" => "allow"}},
                 plan.signature,
                 mgr
               )
    end

    test "Replace signs the whole board", %{sam: sam, mgr: mgr} do
      other = board!(sam, "Zed", "Chris", 2)
      rows = rows_from("For,Bought by,Beers\nPat,Lee,1\n")
      plan = preview(rows, "replace")
      {:ok, _} = BeerBoard.redeem(other.id, 1, sam, nil)
      assert {:error, :stale} = Import.apply("replace", wire(rows), %{}, plan.signature, mgr)
      add_plan = preview(rows, "add")
      # In Add mode a change outside every group isn't a conflict.
      {:ok, _} = BeerBoard.redeem(other.id, 1, sam, nil)
      assert {:ok, _} = Import.apply("add", wire(rows), %{}, add_plan.signature, mgr)
    end

    test "S30: dates from the file are kept; blank ones are the import time", %{mgr: mgr} do
      rows = rows_from("For,Bought by,Beers,Date added\nPat,Chris,1,2026-09-01\nAna,Bo,1,\n")
      assert {:ok, _} = import!(rows, "add", %{}, mgr)
      [ana, pat] = BeerBoard.list_entries()
      assert pat.moved_off_board_at == ~U[2026-09-01 06:00:00Z]
      assert ana.moved_off_board_at == ana.imported_at
      assert pat.imported_at == ana.imported_at
    end

    test "rows sent back are re-validated; all or nothing", %{mgr: mgr} do
      rows = rows_from("For,Bought by,Beers\nPat,Chris,1\nAna,Bo,1\n")
      plan = preview(rows, "add")
      bad = rows |> wire() |> List.update_at(1, &Map.put(&1, "beers", 0))

      assert {:error, {:invalid, [%{row: 3}]}} =
               Import.apply("add", bad, %{}, plan.signature, mgr)

      assert BeerBoard.list_entries() == []
      assert {:error, {:invalid, _}} = Import.apply("merge", wire(rows), %{}, plan.signature, mgr)
      assert {:error, {:invalid, _}} = Import.apply("add", [], %{}, plan.signature, mgr)
    end
  end
end
