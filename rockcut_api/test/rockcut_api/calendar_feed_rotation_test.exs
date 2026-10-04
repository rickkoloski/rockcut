defmodule RockcutApi.CalendarFeedRotationTest do
  @moduledoc "D35: feeds rotate when someone leaves or loses access (spec §4)."
  use RockcutApiWeb.ConnCase, async: false

  import Ecto.Query
  import RockcutApi.AccountsFixtures
  alias RockcutApi.{Accounts, CalendarFeeds, Notifications, Repo}
  alias RockcutApi.CalendarFeeds.Feed
  alias RockcutApi.Notifications.Notification

  setup do
    bar = department_fixture("bar", "Taproom")
    office = department_fixture("office")
    brewery = department_fixture("brewery")

    owner = owner_fixture(%{name: "Olivia Owner"})
    owner2 = owner_fixture(%{name: "Second Owner"})
    bar_mgr = user_with_role("manager", "bar", %{name: "Casey Tap"})
    dual_mgr = "manager" |> user_with_role("bar") |> add_membership("office", "manager")
    brewery_mgr = user_with_role("manager", "brewery")
    bartender = user_with_role("employee", "bar")

    # Every shared feed exists, as once someone has opened Calendar sync.
    CalendarFeeds.feeds_for(owner)

    %{
      bar: bar,
      office: office,
      brewery: brewery,
      owner: owner,
      owner2: owner2,
      bar_mgr: bar_mgr,
      dual_mgr: dual_mgr,
      brewery_mgr: brewery_mgr,
      bartender: bartender
    }
  end

  defp token("all", _), do: Repo.get_by!(Feed, subject_type: "all").token
  defp token(type, id), do: Repo.get_by!(Feed, subject_type: type, subject_id: id).token

  defp tokens(c) do
    %{
      bar: token("department", c.bar.id),
      office: token("department", c.office.id),
      brewery: token("department", c.brewery.id),
      all: token("all", nil)
    }
  end

  defp notes(user) do
    Notification
    |> where(user_id: ^user.id, event: "calendar_feed_rotated")
    |> Repo.all()
  end

  defp deactivate(user, actor),
    do: {:ok, _} = Accounts.update_user(user, %{"active" => false}, actor)

  describe "deactivation (D1, D2)" do
    test "S1 an employee: only their own feed rotates, nobody is notified", c do
      leaver = user_with_role("employee", "bar")
      [own | _] = CalendarFeeds.feeds_for(leaver)
      before = tokens(c)

      deactivate(leaver, c.owner)

      refute token("user", leaver.id) == own.token
      assert tokens(c) == before
      assert Repo.aggregate(where(Notification, event: "calendar_feed_rotated"), :count) == 0
      assert build_conn() |> get("/api/calendar/#{own.token}") |> response(404)
    end

    test "S2 a Taproom manager: the Taproom feed rotates and its users are told", c do
      leaver = user_with_role("manager", "bar")
      before = tokens(c)

      deactivate(leaver, c.owner)
      now = tokens(c)

      refute now.bar == before.bar
      assert Map.delete(now, :bar) == Map.delete(before, :bar)
      assert build_conn() |> get("/api/calendar/#{before.bar}") |> response(404)
      assert build_conn() |> get("/api/calendar/#{now.bar}") |> response(200)

      for u <- [c.bar_mgr, c.dual_mgr, c.owner, c.owner2] do
        assert [n] = notes(u)
        assert n.title == "Re-subscribe to your Rockcut calendar"

        assert n.body =~
                 "The link for Taproom changed because someone who could see them no longer works here."

        refute n.body =~ leaver.name
        assert n.data["url"] == "/schedule?calendar_sync=1"
      end

      assert notes(c.brewery_mgr) == []
      assert notes(c.bartender) == []
      assert notes(leaver) == []
    end

    test "S3 a manager of Taproom and Office: one notification each, listing their feeds", c do
      leaver = "manager" |> user_with_role("bar") |> add_membership("office", "manager")
      before = tokens(c)

      deactivate(leaver, c.owner)
      now = tokens(c)

      refute now.bar == before.bar
      refute now.office == before.office
      assert now.brewery == before.brewery and now.all == before.all

      assert [n] = notes(c.dual_mgr)
      assert n.body =~ "The link for Office and Taproom changed"
      assert [n] = notes(c.bar_mgr)
      assert n.body =~ "The link for Taproom changed"
      assert [n] = notes(c.owner)
      assert n.body =~ "Office and Taproom"
    end

    test "S4 an owner: every department feed and the whole schedule rotate", c do
      leaver = owner_fixture()
      before = tokens(c)

      deactivate(leaver, c.owner)
      now = tokens(c)

      for k <- [:bar, :office, :brewery, :all], do: refute(now[k] == before[k])

      assert [n] = notes(c.owner2)
      assert n.body =~ "Whole schedule"
      assert [n] = notes(c.brewery_mgr)
      assert n.body =~ "The link for Brewery changed"
      refute n.body =~ "Whole schedule"
      assert notes(c.bartender) == []
    end

    test "S5 a manager deactivates a fellow manager and is notified too", c do
      leaver = user_with_role("manager", "bar")
      deactivate(leaver, c.bar_mgr)
      assert [_] = notes(c.bar_mgr)
    end

    test "S6 a feed nobody ever created is skipped", c do
      dept = department_fixture("sales")
      leaver = user_with_role("manager", "sales")
      refute Repo.get_by(Feed, subject_type: "department", subject_id: dept.id)

      deactivate(leaver, c.owner)

      refute Repo.get_by(Feed, subject_type: "department", subject_id: dept.id)
      assert notes(c.owner) == []
    end

    test "S7 reactivating changes nothing", c do
      leaver = user_with_role("manager", "bar")
      deactivate(leaver, c.owner)
      Repo.delete_all(Notification)
      before = tokens(c)

      {:ok, _} = Accounts.update_user(Accounts.get_user!(leaver.id), %{"active" => true}, c.owner)

      assert tokens(c) == before
      assert Repo.aggregate(Notification, :count) == 0
    end

    test "S8 a refused deactivation (last owner) rotates nothing", c do
      deactivate(c.owner2, c.owner)
      Repo.delete_all(Notification)
      before = tokens(c)

      assert {:error, :last_owner} = Accounts.update_user(c.owner, %{"active" => false}, c.owner)
      assert tokens(c) == before
      assert Repo.aggregate(Notification, :count) == 0
    end

    test "the audit entry lists the feeds, never a token", c do
      leaver = user_with_role("manager", "bar")
      before = tokens(c)
      deactivate(leaver, c.owner)

      entry =
        Repo.get_by!(Accounts.AuditEntry, action: "calendar_feeds.rotated", target_id: leaver.id)

      assert entry.actor_id == c.owner.id
      assert entry.detail["reason"] == "departed"
      assert %{"type" => "department", "id" => c.bar.id} in entry.detail["feeds"]
      refute inspect(entry.detail) =~ before.bar
      refute inspect(entry.detail) =~ tokens(c).bar
    end
  end

  describe "losing access without leaving (Q1)" do
    test "S11 a manager made an employee: Taproom rotates, their own feed doesn't", c do
      person = user_with_role("manager", "bar")
      [own | _] = CalendarFeeds.feeds_for(person)
      before = tokens(c)

      {:ok, _} =
        Accounts.set_memberships(
          person,
          [%{"department" => "bar", "role" => "employee"}],
          c.owner
        )

      refute tokens(c).bar == before.bar
      assert token("user", person.id) == own.token
      assert [n] = notes(c.bar_mgr)
      assert n.body =~ "no longer has access to them"
      assert notes(person) == []
    end

    test "S12 removed from Office only: only Office rotates", c do
      person = "manager" |> user_with_role("bar") |> add_membership("office", "manager")
      before = tokens(c)

      {:ok, _} =
        Accounts.set_memberships(person, [%{"department" => "bar", "role" => "manager"}], c.owner)

      now = tokens(c)

      refute now.office == before.office
      assert now.bar == before.bar
      assert [n] = notes(c.dual_mgr)
      assert n.body =~ "The link for Office changed"
      assert notes(c.bar_mgr) == []
    end

    test "S13 the owner flag removed: everything but their own department rotates", c do
      person = owner_fixture() |> add_membership("bar", "manager")
      before = tokens(c)

      {:ok, _} = Accounts.update_user(person, %{"is_owner" => false}, c.owner)
      now = tokens(c)

      assert now.bar == before.bar
      for k <- [:office, :brewery, :all], do: refute(now[k] == before[k])
      assert [n] = notes(c.owner2)
      assert n.body =~ "Whole schedule"
    end

    test "S14 gaining access rotates nothing", c do
      person = user_with_role("employee", "bar")
      before = tokens(c)

      {:ok, _} =
        Accounts.set_memberships(person, [%{"department" => "bar", "role" => "manager"}], c.owner)

      {:ok, _} =
        Accounts.update_user(Accounts.get_user!(person.id), %{"is_owner" => true}, c.owner)

      assert tokens(c) == before
      assert Repo.aggregate(Notification, :count) == 0
    end
  end

  describe "the notification (Q3)" do
    test "defaults to in-app and push, not email", c do
      assert Notifications.enabled?(c.bar_mgr, :calendar_feed_rotated, :in_app)
      assert Notifications.enabled?(c.bar_mgr, :calendar_feed_rotated, :push)
      refute Notifications.enabled?(c.bar_mgr, :calendar_feed_rotated, :email)
    end

    test "S15 someone who turned it off gets nothing; the others still do", c do
      prefs = %{
        "calendar_feed_rotated" => %{"in_app" => false, "push" => false, "email" => false}
      }

      c.bar_mgr |> Ecto.Changeset.change(notification_prefs: prefs) |> Repo.update!()

      deactivate(user_with_role("manager", "bar"), c.owner)

      assert notes(c.bar_mgr) == []
      assert [_] = notes(c.dual_mgr)
    end
  end
end
