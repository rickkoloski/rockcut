defmodule RockcutApi.BreweryTasksTest do
  use RockcutApi.DataCase, async: true

  import Ecto.Query, only: [from: 2]

  alias RockcutApi.BreweryTasks
  alias RockcutApi.BreweryTasks.DailyItem

  describe "today (S51)" do
    test "11:30 pm Colorado in winter (MST, UTC-7) is still that day" do
      # Tue 1/12 23:30 MST = Wed 1/13 06:30 UTC.
      assert BreweryTasks.today_at(~U[2027-01-13 06:30:00Z]) == ~D[2027-01-12]
    end

    test "11:30 pm Colorado in summer (MDT, UTC-6) is still that day" do
      # Mon 7/12 23:30 MDT = Tue 7/13 05:30 UTC.
      assert BreweryTasks.today_at(~U[2027-07-13 05:30:00Z]) == ~D[2027-07-12]
    end

    test "midnight Colorado starts the next day" do
      assert BreweryTasks.today_at(~U[2027-01-13 07:00:00Z]) == ~D[2027-01-13]
      assert BreweryTasks.today_at(~U[2027-07-13 06:00:00Z]) == ~D[2027-07-13]
    end

    test "today/0 is a date" do
      assert %Date{} = BreweryTasks.today()
    end
  end

  test "a new Brewery department starts with the four default Daily items, in order" do
    brewery = RockcutApi.AccountsFixtures.department_fixture("brewery")

    names =
      Repo.all(
        from i in DailyItem,
          where: i.department_id == ^brewery.id and i.active,
          order_by: i.position,
          select: i.name
      )

    assert names == ~w(Backups Gravities Temps Pressures)
  end
end
