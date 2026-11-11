defmodule RockcutApiWeb.OwnersPrivacyTest do
  @moduledoc """
  D59 privacy regression (spec §3, §4.3; plan Stage 2). The Owners task
  board, Idea Board and `dept:owners` channel belong to owners and the people
  they add. A manager of other departments (`dualMgr`) is refused, read and
  write, and finds no Owners entry in any list. A member (`ownersAsst`) reads
  and writes, but History, Daily items and Idea Board managing stay with
  owners (nobody manages Owners). Owners see it all, last. No device opens it.

  Every Idea Board route is also covered for `dualMgr` and `ownersAsst` in
  `IdeaBoardRouteMatrixTest`.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IdeaBoardFixtures

  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Messaging, Repo, Tasks}
  alias RockcutApi.Notifications.Notification

  setup do
    p = personas(~w(owner owner2 dualMgr ownersAsst office1))
    {_device, token} = taproom_device()
    %{p: p, d: departments(), token: token}
  end

  defp today, do: Date.to_iso8601(Tasks.today())
  defp range, do: %{from: today(), to: today()}
  defp ok?(conn), do: conn.status in 200..299
  defp body(conn), do: Jason.decode!(conn.resp_body)

  defp owners_task!(p) do
    call(p["owner"], :post, "/api/boards/owners/tasks", %{title: "Owner thing", due_on: today()})
    |> json_response(201)
    |> get_in(["data", "id"])
  end

  # A refusal for a board the person isn't in is whatever the same request gets
  # on another board they aren't in (here: Brewery), never a 2xx.
  defp refused_like_brewery(user_or_token, verb, path, params \\ %{}) do
    send = fn path ->
      case user_or_token do
        token when is_binary(token) -> call_device(token, verb, path, params)
        user -> call(user, verb, path, params)
      end
    end

    owners = send.(path)
    brewery = send.(String.replace(path, "/owners", "/brewery"))
    refute ok?(owners), "#{verb} #{path} → #{owners.status}"

    assert owners.status == brewery.status,
           "#{verb} #{path}: #{owners.status} vs #{brewery.status}"
  end

  describe "dualMgr (manages Taproom and Office, not in Owners)" do
    test "is refused on the Owners task board, read and write", %{p: p} do
      u = p["dualMgr"]
      id = owners_task!(p)

      refused_like_brewery(u, :get, "/api/boards/owners/tasks", range())
      refused_like_brewery(u, :post, "/api/boards/owners/tasks", %{title: "X", due_on: today()})
      refused_like_brewery(u, :get, "/api/boards/owners/tasks/history")
      refused_like_brewery(u, :get, "/api/boards/owners/daily_items")
      refused_like_brewery(u, :post, "/api/boards/owners/daily_items", %{name: "X"})
      refute ok?(call(u, :patch, "/api/boards/owners/tasks/#{id}", %{title: "Mine now"}))
      refute ok?(call(u, :post, "/api/boards/owners/tasks/#{id}/complete"))
      refute ok?(call(u, :get, "/api/boards/all/tasks", range()))
    end

    test "is refused on the Owners Idea Board, read and write", %{p: p} do
      u = p["dualMgr"]
      card = card!(starter("owners", "Ideas"), "Private idea")

      refused_like_brewery(u, :get, "/api/idea_boards/owners/lists")
      refute ok?(call(u, :get, "/api/idea_boards/owners/cards/#{card.id}"))

      refute ok?(
               call(u, :post, "/api/idea_boards/owners/cards", %{
                 list_id: starter("owners", "Ideas").id,
                 title: "X"
               })
             )

      refute ok?(call(u, :patch, "/api/idea_boards/owners/cards/#{card.id}", %{title: "X"}))
    end

    test "is refused on the Owners channel, read and write", %{p: p} do
      u = p["dualMgr"]
      assert call(u, :get, "/api/channels/dept:owners/messages").status == 403
      assert call(u, :post, "/api/channels/dept:owners/messages", %{body: "hi"}).status == 403
      assert call(u, :post, "/api/channels/dept:owners/read").status == 403
    end

    test "gets no Owners entry in any list", %{p: p} do
      u = p["dualMgr"]
      me = body(call(u, :get, "/api/me"))

      refute "owners" in Enum.map(me["task_boards"], & &1["key"])
      refute "owners" in Enum.map(me["idea_boards"], & &1["key"])
      refute "owners" in me["capabilities"]["modules"]
      refute "owners" in me["capabilities"]["manages_departments"]

      refute "owners" in Enum.map(body(call(u, :get, "/api/idea_boards"))["data"], & &1["key"])
      refute "dept:owners" in Enum.map(body(call(u, :get, "/api/channels"))["data"], & &1["key"])

      owners_id = departments()["owners"].id

      refute Enum.any?(
               body(call(u, :get, "/api/calendar_feeds"))["data"],
               &(&1["subject_type"] == "department" and &1["subject_id"] == owners_id)
             )
    end
  end

  describe "ownersAsst (Office employee + Owners member)" do
    test "reads and writes the Owners task board", %{p: p} do
      u = p["ownersAsst"]
      id = owners_task!(p)

      assert call(u, :get, "/api/boards/owners/tasks", range()) |> json_response(200)
      assert call(u, :get, "/api/boards/owners/daily_items") |> json_response(200)

      assert call(u, :post, "/api/boards/owners/tasks", %{title: "Mine", due_on: today()})
             |> json_response(201)

      assert call(u, :post, "/api/boards/owners/tasks/#{id}/complete") |> json_response(200)
      assert call(u, :patch, "/api/boards/owners/tasks/#{id}", %{title: "Renamed"}).status == 200
    end

    test "is refused History, Daily items management and All departments", %{p: p} do
      u = p["ownersAsst"]
      assert call(u, :get, "/api/boards/owners/tasks/history").status == 403
      assert call(u, :post, "/api/boards/owners/daily_items", %{name: "X"}).status == 403
      assert call(u, :put, "/api/boards/owners/daily_items/order", %{ids: []}).status == 403
      refute ok?(call(u, :get, "/api/boards/all/tasks", range()))

      me = body(call(u, :get, "/api/me"))

      assert %{"key" => "owners", "manage" => false} =
               Enum.find(me["task_boards"], &(&1["key"] == "owners"))
    end

    test "reads and writes the Owners Idea Board, but can't manage it", %{p: p} do
      u = p["ownersAsst"]
      card = card!(starter("owners", "Ideas"), "Shared idea")

      assert call(u, :get, "/api/idea_boards/owners/lists") |> json_response(200)

      assert call(u, :post, "/api/idea_boards/owners/cards", %{
               list_id: starter("owners", "Ideas").id,
               title: "Mine"
             })
             |> json_response(201)

      assert call(u, :get, "/api/idea_boards/owners/history").status == 403
      assert call(u, :post, "/api/idea_boards/owners/cards/#{card.id}/lock").status == 403

      board = Enum.find(body(call(u, :get, "/api/idea_boards"))["data"], &(&1["key"] == "owners"))
      assert %{"manage" => false, "history" => false} = board
    end

    test "reads and posts in the Owners channel", %{p: p} do
      u = p["ownersAsst"]
      assert "dept:owners" in Enum.map(body(call(u, :get, "/api/channels"))["data"], & &1["key"])

      assert call(u, :post, "/api/channels/dept:owners/messages", %{body: "Agenda is up"})
             |> json_response(201)

      assert [%{"body" => "Agenda is up"}] =
               call(u, :get, "/api/channels/dept:owners/messages")
               |> json_response(200)
               |> Map.fetch!("data")

      # Owners read it too.
      assert [%{"body" => "Agenda is up"}] =
               call(p["owner2"], :get, "/api/channels/dept:owners/messages")
               |> json_response(200)
               |> Map.fetch!("data")
    end
  end

  describe "owner" do
    test "passes everything on the Owners board, Idea Board and channel", %{p: p} do
      u = p["owner"]
      id = owners_task!(p)
      card = card!(starter("owners", "Ideas"), "Owner idea")

      for {verb, path, params} <- [
            {:get, "/api/boards/owners/tasks", range()},
            {:get, "/api/boards/owners/tasks/history", %{}},
            {:post, "/api/boards/owners/daily_items", %{name: "Review the books"}},
            {:post, "/api/boards/owners/tasks/#{id}/complete", %{}},
            {:get, "/api/idea_boards/owners/lists", %{}},
            {:get, "/api/idea_boards/owners/history", %{}},
            {:post, "/api/idea_boards/owners/cards/#{card.id}/lock", %{}},
            {:post, "/api/channels/dept:owners/messages", %{body: "hi"}},
            {:get, "/api/channels/dept:owners/messages", %{}}
          ] do
        conn = call(u, verb, path, params)
        assert ok?(conn), "#{verb} #{path} → #{conn.status}"
      end
    end

    test "sees Owners last in every list (Company and All departments after it)", %{p: p} do
      u = p["owner"]
      me = body(call(u, :get, "/api/me"))

      assert me["task_boards"] |> Enum.map(& &1["key"]) |> Enum.take(-2) == ["owners", "all"]
      assert me["idea_boards"] |> Enum.map(& &1["key"]) |> Enum.take(-2) == ["owners", "company"]

      assert body(call(u, :get, "/api/idea_boards"))["data"]
             |> Enum.map(& &1["key"])
             |> Enum.take(-2) == ["owners", "company"]

      assert body(call(u, :get, "/api/channels"))["data"]
             |> Enum.filter(&(&1["kind"] == "department"))
             |> Enum.map(& &1["key"])
             |> List.last() == "dept:owners"

      assert body(call(u, :get, "/api/departments"))["data"]
             |> Enum.map(& &1["key"])
             |> List.last() == "owners"
    end

    test "sees Owners' tasks in All departments", %{p: p} do
      id = owners_task!(p)

      cards =
        call(p["owner"], :get, "/api/boards/all/tasks", range())
        |> json_response(200)
        |> get_in(["data", "days"])
        |> Enum.flat_map(& &1["cards"])

      assert %{"department" => "owners"} = Enum.find(cards, &(&1["id"] == id))
    end

    test "the Owners board has no schedule header; another board keeps its own", %{p: p} do
      [owners_day] =
        call(p["owner"], :get, "/api/boards/owners/tasks", range())
        |> json_response(200)
        |> get_in(["data", "days"])

      assert Map.has_key?(owners_day, "header")
      assert owners_day["header"] == nil

      [office_day] =
        call(p["owner"], :get, "/api/boards/office/tasks", range())
        |> json_response(200)
        |> get_in(["data", "days"])

      assert %{"people" => [], "open_shifts" => [], "no_one_scheduled" => true} =
               office_day["header"]
    end
  end

  describe "who's told about a channel post (lead decisions 1, item 1)" do
    # message_posted skips the bell by default (email only); turn the bell on
    # for everyone so the in-app rows show who was told.
    setup %{p: p} do
      for {_, u} <- p do
        u
        |> Ecto.Changeset.change(notification_prefs: %{"message_posted" => %{"in_app" => true}})
        |> Repo.update!()
      end

      :ok
    end

    test "an Owners post tells owner and owner2, not dualMgr or office1", %{p: p} do
      post!(p["ownersAsst"], "dept:owners")

      assert notified_settled("dept:owners", [p["owner"], p["owner2"]]) ==
               MapSet.new([p["owner"].id, p["owner2"].id])

      ids = Enum.map(Messaging.recipients("dept:owners"), & &1.id)
      refute p["dualMgr"].id in ids
      refute p["office1"].id in ids
    end

    test "a post in another department's channel doesn't tell a non-member owner", %{p: p} do
      post!(p["ownersAsst"], "dept:office")
      notified = notified_settled("dept:office", [p["office1"], p["dualMgr"]])
      assert notified == MapSet.new([p["office1"].id, p["dualMgr"].id])
      refute p["owner"].id in notified
    end
  end

  defp post!(user, key) do
    assert call(user, :post, "/api/channels/#{key}/messages", %{body: "Agenda is up"})
           |> json_response(201)
  end

  # Notifications go out from a background task: wait until everyone expected
  # has one, then a moment more so an extra recipient would show up too.
  defp notified_settled(key, expected, tries \\ 100) do
    got = notified(key)

    cond do
      MapSet.subset?(MapSet.new(expected, & &1.id), got) ->
        Process.sleep(100)
        notified(key)

      tries == 0 ->
        got

      true ->
        Process.sleep(20)
        notified_settled(key, expected, tries - 1)
    end
  end

  defp notified(key) do
    from(n in Notification,
      where:
        n.event == "message_posted" and
          fragment("json_extract(?, '$.channel_key')", n.data) == ^key,
      select: n.user_id
    )
    |> Repo.all()
    |> MapSet.new()
  end

  describe "a shared device (taproomDevice)" do
    test "is refused on the Owners board and Idea Board", %{token: token} do
      refused_like_brewery(token, :get, "/api/boards/owners/tasks", range())
      refused_like_brewery(token, :get, "/api/boards/owners/daily_items")
      refused_like_brewery(token, :get, "/api/idea_boards/owners/lists")
      refused_like_brewery(token, :get, "/api/idea_boards/owners/labels")

      me = body(call_device(token, :get, "/api/me"))
      refute "owners" in Enum.map(me["task_boards"], & &1["key"])
      refute "owners" in Enum.map(me["idea_boards"], & &1["key"])

      channels = body(call_device(token, :get, "/api/channels"))["data"]
      refute "dept:owners" in Enum.map(channels, & &1["key"])
      assert call_device(token, :get, "/api/channels/dept:owners/messages").status == 403
    end
  end
end
