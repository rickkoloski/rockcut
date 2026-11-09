defmodule RockcutApiWeb.HistoryFilterTest do
  @moduledoc """
  D55 §2.11 (D53 Part 2 recheck gap 10, lead decisions 3): a History filter
  (`task_id` on a task board, `card_id` on a Board) that isn't a usable id is
  a 422 on that param, not the whole board's History; absent (or empty) is the
  whole History, as before. A huge `page` is an empty page, not page 1. Also
  the messages `before` cursor, which was a 500 for junk.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IdeaBoardFixtures

  @junk ["1e20", "abc", "-1", "0", "99999999999999999999"]

  setup do
    p = personas(~w(owner barMgr))
    %{mgr: p["barMgr"]}
  end

  defp get_json(user, path) do
    conn = call(user, :get, path)
    {conn.status, Jason.decode!(conn.resp_body)}
  end

  test "task board History: a bad task_id is 422; absent or empty is the whole History", %{
    mgr: mgr
  } do
    assert call(mgr, :post, "/api/boards/bar/tasks", %{title: "x", due_on: "2026-11-10"}).status ==
             201

    for v <- @junk do
      assert {422, %{"errors" => %{"task_id" => [_]}}} =
               get_json(mgr, "/api/boards/bar/tasks/history?task_id=#{v}"),
             v
    end

    for q <- ["", "?task_id="] do
      assert {200, %{"data" => [_ | _], "page" => 1}} =
               get_json(mgr, "/api/boards/bar/tasks/history#{q}")
    end

    assert {200, %{"data" => [], "page" => 1_000_000}} =
             get_json(mgr, "/api/boards/bar/tasks/history?page=99999999999999999999")
  end

  test "Boards History: a bad card_id is 422; absent is the whole History", %{mgr: mgr} do
    list = list!("bar", "Filters")
    _card = card!(list, "A card")
    call(mgr, :patch, "/api/idea_boards/bar/lists/#{list.id}", %{name: "Filters 2"})

    for v <- @junk do
      assert {422, %{"errors" => %{"card_id" => [_]}}} =
               get_json(mgr, "/api/idea_boards/bar/history?card_id=#{v}"),
             v
    end

    assert {200, %{"data" => [_ | _], "page" => 1}} =
             get_json(mgr, "/api/idea_boards/bar/history")

    assert {200, %{"data" => [], "page" => 1_000_000}} =
             get_json(mgr, "/api/idea_boards/bar/history?page=99999999999999999999")
  end

  test "messages: a `before` that isn't a usable id is 422; a real one pages", %{mgr: mgr} do
    for v <- @junk do
      assert {422, %{"errors" => %{"before" => [_]}}} =
               get_json(mgr, "/api/channels/all/messages?before=#{v}"),
             v
    end

    assert {200, %{"data" => _}} = get_json(mgr, "/api/channels/all/messages?before=5")
    assert {200, %{"data" => _}} = get_json(mgr, "/api/channels/all/messages")
  end
end
