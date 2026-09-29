defmodule RockcutApi.AuthzParity.OwnRecordsTest do
  @moduledoc """
  D31 parity — D29 Appendix A row 43 (notifications, push subscriptions,
  notification preferences). Every query is scoped to the signed-in user; no
  role is consulted, owners included.
  """
  use RockcutApiWeb.ConnCase

  import RockcutApi.PersonaFixtures

  alias RockcutApi.Repo
  alias RockcutApi.Notifications.{Notification, WebPush}

  setup do
    p = personas(~w(owner barMgr bartender1))

    note =
      Repo.insert!(%Notification{
        user_id: p["bartender1"].id,
        event: "shift_published",
        title: "Parity"
      })

    %{p: p, note: note}
  end

  for who <- ~w(owner barMgr) do
    test "#43 #{who} doesn't see or mark read bartender1's notification", %{p: p, note: note} do
      user = p[unquote(who)]
      refute note.id in data_ids(call(user, :get, "/api/notifications"))
      call(user, :post, "/api/notifications/#{note.id}/read")
      call(user, :post, "/api/notifications/read_all")
      assert is_nil(Repo.get!(Notification, note.id).read_at)
    end

    test "#43 #{who} can't remove bartender1's push subscription", %{p: p} do
      endpoint = "https://push.example.test/#{System.unique_integer([:positive])}"
      {:ok, _} = WebPush.subscribe(p["bartender1"], %{endpoint: endpoint, p256dh: "k", auth: "a"})
      call(p[unquote(who)], :delete, "/api/push/subscriptions", %{endpoint: endpoint})
      assert [_] = WebPush.list(p["bartender1"])
    end

    test "#43 #{who} changing their preferences leaves bartender1's untouched", %{p: p} do
      before = call(p["bartender1"], :get, "/api/notification_preferences").resp_body

      conn =
        call(p[unquote(who)], :put, "/api/notification_preferences", %{
          prefs: %{"open_shift" => %{"email" => false}}
        })

      assert conn.status == 200

      assert call(p["bartender1"], :get, "/api/notification_preferences").resp_body == before
    end
  end

  test "#43 bartender1 removes their own push subscription", %{p: p} do
    endpoint = "https://push.example.test/#{System.unique_integer([:positive])}"
    {:ok, _} = WebPush.subscribe(p["bartender1"], %{endpoint: endpoint, p256dh: "k", auth: "a"})

    assert status(p["bartender1"], :delete, "/api/push/subscriptions", %{endpoint: endpoint}) ==
             204

    assert [] = WebPush.list(p["bartender1"])
  end

  test "#43 bartender1 sees and marks read their own notification", %{p: p, note: note} do
    assert note.id in data_ids(call(p["bartender1"], :get, "/api/notifications"))
    call(p["bartender1"], :post, "/api/notifications/#{note.id}/read")
    refute is_nil(Repo.get!(Notification, note.id).read_at)
  end
end
