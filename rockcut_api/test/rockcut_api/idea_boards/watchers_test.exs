defmodule RockcutApi.IdeaBoards.WatchersTest do
  @moduledoc """
  D53 Part 2 stage 4: Watch notifications (§4.6, S225, S242, S243). Changes
  go through the API; `Watchers.flush/1` runs with a pinned "now" in place of
  the scheduler tick. Delivered notifications are read back from the
  in-app inbox (`notifications`).
  """
  use RockcutApiWeb.ConnCase, async: false

  import Ecto.Query, only: [from: 2]
  import RockcutApi.PersonaFixtures
  import RockcutApi.IdeaBoardFixtures

  alias RockcutApi.{Notifications, Repo}
  alias RockcutApi.IdeaBoards.{Watchers, WatchPending}
  alias RockcutApi.Notifications.Notification

  @bar "/api/idea_boards/bar"

  setup do
    %{p: personas(~w(owner barMgr bartender1 bartender2 brewer1 brewer2 breweryMgr floater))}
  end

  defp ok!(user, verb, path, params \\ %{}) do
    conn = call(user, verb, path, params)
    assert conn.status in 200..299, "#{verb} #{path}: #{conn.status} #{conn.resp_body}"
  end

  defp later(minutes), do: DateTime.add(DateTime.utc_now(), minutes * 60, :second)

  defp inbox(user),
    do:
      Repo.all(
        from n in Notification,
          where: n.user_id == ^user.id and n.event == "idea_card_changed",
          order_by: n.id
      )

  test "S225: one notification naming every change; never to whoever made them", %{p: p} do
    card = card!(starter("bar", "Ideas"), "Taproom remodel")
    item = item!(card, "Measure", 1)
    ok!(p["bartender1"], :put, "#{@bar}/cards/#{card.id}/watch")

    ok!(p["bartender2"], :post, "#{@bar}/cards/#{card.id}/notes", %{body: "Got a quote"})
    ok!(p["bartender2"], :patch, "#{@bar}/cards/#{card.id}/checklist/#{item.id}", %{done: true})

    # Inside the window: nothing yet.
    assert Watchers.flush(later(9)) == 0
    assert inbox(p["bartender1"]) == []

    assert Watchers.flush(later(10)) == 1

    assert [n] = inbox(p["bartender1"])
    assert n.title == "Alex changed Taproom remodel"
    assert n.body == "1 note, ticked 1 item"

    assert n.data == %{
             "url" => "/ideas/bar/cards/#{card.id}",
             "board" => "bar",
             "card_id" => card.id
           }

    assert inbox(p["bartender2"]) == []
    assert Repo.aggregate(WatchPending, :count) == 0

    # Flushed rows don't come back.
    assert Watchers.flush(later(30)) == 0
  end

  test "your own change never notifies you; nobody watching, nothing pending", %{p: p} do
    card = card!(starter("bar", "Ideas"), "Mine")
    ok!(p["bartender1"], :patch, "#{@bar}/cards/#{card.id}", %{title: "Unwatched edit"})
    assert Repo.aggregate(WatchPending, :count) == 0

    ok!(p["bartender1"], :put, "#{@bar}/cards/#{card.id}/watch")
    ok!(p["bartender1"], :patch, "#{@bar}/cards/#{card.id}", %{title: "My own edit"})
    assert Repo.aggregate(WatchPending, :count) == 0
  end

  test "S242: changes 15 minutes apart are two notifications; after Watch off, none", %{p: p} do
    card = card!(starter("brewery", "Ideas"), "Canning line")
    base = "/api/idea_boards/brewery/cards/#{card.id}"
    ok!(p["brewer1"], :put, base <> "/watch")

    ok!(p["breweryMgr"], :post, base <> "/move", %{list_id: starter("brewery", "Doing").id})
    assert Watchers.flush(later(10)) == 1

    ok!(p["brewer2"], :patch, base, %{title: "Canning line v2", due_on: "2026-12-01"})
    assert Watchers.flush(later(10)) == 1

    assert [first, second] = inbox(p["brewer1"])
    first_name = p["breweryMgr"].name |> String.split() |> hd()
    assert first.title == "#{first_name} changed Canning line"
    assert first.body == "moved to Doing"

    assert second.title ==
             "#{p["brewer2"].name |> String.split() |> hd()} changed Canning line v2"

    assert second.body == "renamed, due date"

    ok!(p["brewer1"], :delete, base <> "/watch")
    ok!(p["brewer2"], :patch, base, %{description: "More"})
    assert Watchers.flush(later(10)) == 0
    assert length(inbox(p["brewer1"])) == 2
  end

  test "several people and kinds read naturally", %{p: p} do
    card = card!(starter("bar", "Ideas"), "Fall releases")
    base = "#{@bar}/cards/#{card.id}"
    ok!(p["bartender1"], :put, base <> "/watch")

    ok!(p["bartender2"], :post, base <> "/notes", %{body: "One"})
    ok!(p["barMgr"], :post, base <> "/notes", %{body: "Two"})
    ok!(p["floater"], :post, base <> "/move", %{list_id: starter("bar", "Planned").id})
    ok!(p["floater"], :post, base <> "/move", %{list_id: starter("bar", "Doing").id})
    ok!(p["barMgr"], :post, base <> "/lock")

    Watchers.flush(later(10))
    [n] = inbox(p["bartender1"])
    assert n.title == "Alex and 2 others changed Fall releases"
    assert n.body == "2 notes, moved to Doing, locked"
  end

  test "the window is the card's: a change late in it rides along", %{p: p} do
    card = card!(starter("bar", "Ideas"), "C")
    base = "#{@bar}/cards/#{card.id}"
    ok!(p["bartender1"], :put, base <> "/watch")
    ok!(p["bartender2"], :post, base <> "/notes", %{body: "Early"})

    Repo.update_all(WatchPending,
      set: [
        inserted_at: DateTime.add(DateTime.utc_now(), -540, :second) |> DateTime.truncate(:second)
      ]
    )

    ok!(p["bartender2"], :post, base <> "/notes", %{body: "Late"})

    assert Watchers.flush(later(1)) == 1
    assert [%{body: "2 notes"}] = inbox(p["bartender1"])
  end

  test "S243: leaving the board drops the watch and anything pending", %{p: p} do
    card = card!(starter("bar", "Ideas"), "Taproom card")
    base = "#{@bar}/cards/#{card.id}"
    ok!(p["floater"], :put, base <> "/watch")
    ok!(p["bartender1"], :post, base <> "/notes", %{body: "Before"})
    assert Repo.aggregate(WatchPending, :count) == 1

    ok!(p["owner"], :put, "/api/users/#{p["floater"].id}/memberships", %{
      memberships: [%{department: "brewery", role: "employee"}]
    })

    assert Repo.aggregate(WatchPending, :count) == 0
    ok!(p["bartender1"], :post, base <> "/notes", %{body: "After"})
    assert Watchers.flush(later(10)) == 0
    assert inbox(p["floater"]) == []
  end

  test "someone who lost the board before the flush hears nothing", %{p: p} do
    card = card!(starter("bar", "Ideas"), "C")
    watch!(card, p["bartender2"])
    ok!(p["bartender1"], :post, "#{@bar}/cards/#{card.id}/notes", %{body: "Hi"})

    # Membership gone without the usual path (a direct delete).
    Repo.delete_all(
      from m in RockcutApi.Accounts.Membership, where: m.user_id == ^p["bartender2"].id
    )

    assert Watchers.flush(later(10)) == 0
    assert Repo.aggregate(WatchPending, :count) == 0
  end

  test "defaults: in-app on, push on, email off" do
    user = %RockcutApi.Accounts.User{notification_prefs: %{}}
    assert Notifications.enabled?(user, "idea_card_changed", :in_app)
    assert Notifications.enabled?(user, "idea_card_changed", :push)
    refute Notifications.enabled?(user, "idea_card_changed", :email)
  end
end
