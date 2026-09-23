defmodule RockcutApi.Notifications.WebPushTest do
  use RockcutApi.DataCase

  alias RockcutApi.Notifications
  alias RockcutApi.Notifications.WebPush
  alias RockcutApi.Accounts
  import RockcutApi.AccountsFixtures

  # A real P-256 keypair + auth secret so WebPushEx can encrypt the payload.
  defp valid_keys do
    {pub, _priv} = :crypto.generate_key(:ecdh, :prime256v1)

    %{
      p256dh: Base.url_encode64(pub, padding: false),
      auth: Base.url_encode64(:crypto.strong_rand_bytes(16), padding: false)
    }
  end

  defp sub_attrs(endpoint),
    do: Map.merge(%{endpoint: endpoint, user_agent: "test-agent"}, valid_keys())

  # Route the HTTP send to this test process instead of the network.
  defp stub_sender(status) do
    test_pid = self()

    Application.put_env(:rockcut_api, WebPush,
      sender: fn %WebPushEx.Request{} = req ->
        send(test_pid, {:pushed, URI.to_string(req.endpoint)})
        {:ok, status}
      end
    )

    on_exit(fn -> Application.delete_env(:rockcut_api, WebPush) end)
  end

  test "subscribe upserts by endpoint (one row per device)" do
    user = user_fixture()

    {:ok, _} = WebPush.subscribe(user, sub_attrs("https://push.example.com/a"))
    {:ok, _} = WebPush.subscribe(user, sub_attrs("https://push.example.com/a"))
    {:ok, _} = WebPush.subscribe(user, sub_attrs("https://push.example.com/b"))

    endpoints = WebPush.list(user) |> Enum.map(& &1.endpoint) |> Enum.sort()
    assert endpoints == ["https://push.example.com/a", "https://push.example.com/b"]
  end

  test "unsubscribe removes only the given endpoint for the user" do
    user = user_fixture()
    {:ok, _} = WebPush.subscribe(user, sub_attrs("https://push.example.com/a"))
    {:ok, _} = WebPush.subscribe(user, sub_attrs("https://push.example.com/b"))

    :ok = WebPush.unsubscribe(user, "https://push.example.com/a")

    assert WebPush.list(user) |> Enum.map(& &1.endpoint) == ["https://push.example.com/b"]
  end

  test "deliver sends to every subscribed device" do
    stub_sender(201)
    user = user_fixture()
    {:ok, _} = WebPush.subscribe(user, sub_attrs("https://push.example.com/a"))
    {:ok, _} = WebPush.subscribe(user, sub_attrs("https://push.example.com/b"))

    :ok =
      WebPush.deliver(user, %{title: "Shift published", body: "Brewer", data: %{"shift_id" => 1}})

    assert_receive {:pushed, "https://push.example.com/a"}
    assert_receive {:pushed, "https://push.example.com/b"}
  end

  test "a 410 from the push service prunes that subscription" do
    stub_sender(410)
    user = user_fixture()
    {:ok, _} = WebPush.subscribe(user, sub_attrs("https://push.example.com/gone"))

    :ok = WebPush.deliver(user, %{title: "x", body: "y", data: %{}})

    assert WebPush.list(user) == []
  end

  test "web_push channel is opt-in (default off), and on once enabled" do
    user = user_fixture()
    refute Notifications.enabled?(user, :shift_published, :web_push)

    {:ok, _} = Notifications.update_prefs(user, %{"shift_published" => %{"web_push" => true}})
    user = Accounts.get_user!(user.id)

    assert Notifications.enabled?(user, :shift_published, :web_push)
  end
end
