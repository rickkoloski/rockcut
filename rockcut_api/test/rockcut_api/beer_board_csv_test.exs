defmodule RockcutApi.BeerBoardCsvTest do
  @moduledoc "D37 §3.6: reading and writing the board's CSV files (S20, S26, S29, S30)."
  use ExUnit.Case, async: true

  alias RockcutApi.BeerBoard.{Csv, Entry, Event}
  alias RockcutApi.Accounts.User

  @fixtures Path.expand("../fixtures/beer_board", __DIR__)

  defp fixture(name), do: File.read!(Path.join(@fixtures, name))

  defp names(rows), do: Enum.map(rows, &{&1.recipient_name, &1.purchaser_name, &1.beers})

  describe "parse/1" do
    test "a clean file: rows numbered as spreadsheet rows, dates read" do
      assert {:ok, [pat, ana, sam], []} = Csv.parse(fixture("clean.csv"))
      assert names([pat, ana, sam]) == [{"Pat", "Chris", 2}, {"Ana", "Bo", 1}, {"Sam", "Jo", 3}]
      assert Enum.map([pat, ana, sam], & &1.row) == [2, 3, 4]

      # YYYY-MM-DD is midnight in Colorado (MDT, UTC-6, in September).
      assert pat.moved_off_board_at == ~U[2026-09-01 06:00:00Z]
      assert ana.moved_off_board_at == nil
      assert sam.moved_off_board_at == ~U[2026-09-15 18:30:00Z]
    end

    test "S26: every row error is listed by row number; nothing parses" do
      assert {:error, errors} = Csv.parse(fixture("errors.csv"))

      assert Enum.map(errors, &{&1.row, &1.message}) == [
               {3, "For is blank"},
               {4, "Beers must be a whole number from 1 to 99"},
               {5, "Beers must be a whole number from 1 to 99"},
               {6, "Bought by is blank"},
               {6, "Beers must be a whole number from 1 to 99"}
             ]
    end

    test "an Excel-saved file: BOM, CRLF, header case and spaces, Date added, Imported ignored, US dates" do
      assert {:ok, [pat, ana, kim, ray], []} = Csv.parse(fixture("excel.csv"))

      assert names([pat, ana, kim, ray]) ==
               [{"Pat", "Chris", 2}, {"Ana", "Bo", 1}, {"Kim", "Lee", 2}, {"Ray", "Jo", 1}]

      assert pat.moved_off_board_at == ~U[2026-09-01 06:00:00Z]
      # The Imported column is never taken from a file.
      refute Map.has_key?(ana, :imported_at)
      assert ana.moved_off_board_at == nil
      # Excel re-saves dates in US order: 9/1/2026 = 2026-09-01, midnight in Colorado.
      assert kim.moved_off_board_at == pat.moved_off_board_at
      assert ray.moved_off_board_at == ~U[2026-09-15 06:00:00Z]
    end

    test "US dates must be real dates; day-first and two-digit years are refused" do
      for bad <- ~w(13/1/2026 2/30/2026 9/1/26 1.9.2026) do
        assert {:error, [%{row: 2, message: message}]} =
                 Csv.parse("For,Bought by,Beers,Moved off board\nPat,Chris,1,#{bad}\n")

        assert message == ~s(Moved off board "#{bad}" isn't a date; use YYYY-MM-DD or M/D/YYYY)
      end
    end

    test "quoted commas and quotes" do
      assert {:ok, rows, []} = Csv.parse(fixture("quoted.csv"))
      assert names(rows) == [{"Smith, Pat", ~s(Lee "Doc" Jones), 4}, {"Ana, Jr.", "Bo", 1}]
    end

    test "S29: one guard quote is stripped before a formula character, not otherwise" do
      assert {:ok, rows, []} = Csv.parse(fixture("formula.csv"))

      assert names(rows) == [
               {~s[=HYPERLINK("http://x")], "+Chris", 2},
               {"-5 Pat", "@Lee", 1},
               {"'Quote", "Plain", 1}
             ]
    end

    test "the duplicates fixture parses (grouping is Import's job)" do
      assert {:ok, rows, []} = Csv.parse(fixture("duplicates.csv"))
      assert length(rows) == 4
    end

    test "S30: no Moved off board column → no dates" do
      assert {:ok, rows, []} = Csv.parse("For,Bought by,Beers\nPat,Chris,1\n")
      assert Enum.all?(rows, &is_nil(&1.moved_off_board_at))
    end

    test "missing and repeated columns are header errors (row 1)" do
      assert {:error, [%{row: 1, message: ~s(Missing column "Beers")}]} =
               Csv.parse("For,Bought by\nPat,Chris\n")

      assert {:error, [%{row: 1, message: "Columns" <> _}]} =
               Csv.parse("For,Bought by,Beers,Moved off board,Date added\nPat,Chris,1,,\n")
    end

    test "DEV pass 1 G5: other columns are ignored and listed" do
      csv = "For,Shelf,Bought by,Beers,Notes\nPat,A2,Chris,2,regular\nAna,,Lee,1,\n"

      assert {:ok, [pat, ana], ["Shelf", "Notes"]} = Csv.parse(csv)
      assert %{row: 2, recipient_name: "Pat", purchaser_name: "Chris", beers: 2} = pat
      assert %{row: 3, recipient_name: "Ana", purchaser_name: "Lee", beers: 1} = ana

      # A missing required column is still an error alongside an ignored one.
      assert {:error, [%{row: 1, message: ~s(Missing column "Beers")}]} =
               Csv.parse("For,Bought by,Notes\nPat,Chris,x\n")
    end

    test "a bad date, an over-long name" do
      long = String.duplicate("x", 81)

      assert {:error,
              [
                %{
                  row: 2,
                  message: ~s(Moved off board "Sept 1" isn't a date; use YYYY-MM-DD or M/D/YYYY)
                },
                %{row: 3, message: "For is longer than 80 characters"}
              ]} =
               Csv.parse(
                 "For,Bought by,Beers,Moved off board\nPat,Chris,1,Sept 1\n#{long},Lee,1,\n"
               )
    end

    test "limits: 1,000 rows and 1 MB" do
      ok = "For,Bought by,Beers\n" <> String.duplicate("Pat,Chris,1\n", 1_000)
      assert {:ok, rows, []} = Csv.parse(ok)
      assert length(rows) == 1_000

      assert {:error, [%{message: "The file has 1001 rows; the limit is 1000"}]} =
               Csv.parse(ok <> "Pat,Chris,1\n")

      big = "For,Bought by,Beers\n" <> String.duplicate("x", Csv.max_bytes())
      assert {:error, [%{message: "The file is larger than 1 MB"}]} = Csv.parse(big)
    end

    test "empty, header-only, not UTF-8, not CSV" do
      assert {:error, [%{message: "The file is empty"}]} = Csv.parse("")

      assert {:error, [%{message: "The file has no rows to import"}]} =
               Csv.parse("For,Bought by,Beers\n")

      assert {:error, [%{message: "The file isn't UTF-8" <> _}]} =
               Csv.parse("For,Bought by,Beers\nJos\xe9,A,1\n")

      assert {:error, [%{message: "The file isn't valid CSV" <> _}]} =
               Csv.parse("For,Bought by,Beers\n\"Pat,A,1\n")
    end
  end

  describe "writing" do
    defp entry(attrs),
      do:
        struct(
          %Entry{
            recipient_name: "Pat",
            purchaser_name: "Chris",
            beers_remaining: 2,
            moved_off_board_at: ~U[2026-09-01 06:00:00Z],
            imported_at: nil
          },
          attrs
        )

    test "S20: entries, with a comma name intact" do
      csv =
        Csv.entries_csv([
          entry(%{recipient_name: "Smith, Pat"}),
          entry(%{imported_at: ~U[2026-10-05 12:00:00Z]})
        ])

      assert csv ==
               "For,Bought by,Beers,Moved off board,Imported\r\n" <>
                 "\"Smith, Pat\",Chris,2,2026-09-01T06:00:00Z,\r\n" <>
                 "Pat,Chris,2,2026-09-01T06:00:00Z,2026-10-05T12:00:00Z\r\n"
    end

    test "S28/S29: an export re-imports to the same names, counts and dates" do
      entries = [
        entry(%{recipient_name: ~s[=HYPERLINK("http://x")], purchaser_name: "-Lee"}),
        entry(%{recipient_name: "@Ana", purchaser_name: "\tBo", beers_remaining: 9}),
        entry(%{recipient_name: "Smith, Pat", imported_at: ~U[2026-10-05 12:00:00Z]})
      ]

      csv = Csv.entries_csv(entries)
      assert csv =~ ~s["'=HYPERLINK(""http://x"")",'-Lee]

      assert {:ok, rows, []} = Csv.parse(csv)

      assert Enum.map(
               rows,
               &{&1.recipient_name, &1.purchaser_name, &1.beers, &1.moved_off_board_at}
             ) == [
               {~s[=HYPERLINK("http://x")], "-Lee", 2, ~U[2026-09-01 06:00:00Z]},
               # A leading tab is whitespace: names are trimmed on the way in.
               {"@Ana", "Bo", 9, ~U[2026-09-01 06:00:00Z]},
               {"Smith, Pat", "Chris", 2, ~U[2026-09-01 06:00:00Z]}
             ]
    end

    test "the change log" do
      ev = %Event{
        inserted_at: ~U[2026-10-05 12:00:00Z],
        actor: %User{name: "=Sam"},
        device_id: 7,
        action: "redeemed",
        detail: %{"source" => "import"},
        recipient_name: "Pat",
        purchaser_name: "Chris",
        beers_before: 3,
        beers_after: 2
      }

      assert Csv.events_csv([ev, %{ev | device_id: nil, detail: %{}}]) ==
               "When,Who,Shared device,Action,Source,For,Bought by,Before,After\r\n" <>
                 "2026-10-05T12:00:00Z,'=Sam,yes,redeemed,import,Pat,Chris,3,2\r\n" <>
                 "2026-10-05T12:00:00Z,'=Sam,no,redeemed,,Pat,Chris,3,2\r\n"
    end
  end
end
