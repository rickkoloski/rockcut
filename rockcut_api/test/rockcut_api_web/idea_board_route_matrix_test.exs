defmodule RockcutApiWeb.IdeaBoardRouteMatrixTest do
  @moduledoc """
  D53 Part 2: every Idea Board route × every board × {member, another
  department's member, manager, another department's manager, owner,
  `noDept`, Taproom tablet, Brewery tablet} (spec §4.2). Generated from the
  router: a new `/api/idea_boards` route fails "every route is classified"
  until it's given a kind below. Each call gets fresh records, so a delete
  never changes what the next call sees.

    * `:read`: the board and its labels and cards. Department boards: its
      members and owners; Company: every person; tablets: their home board
      and Company.
    * `:write`: Archived, the picker and every write that any member makes
      (on unlocked things). As `:read`, but people only (`DeviceGate`).
    * `:manage`: lock, unlock, delete for good, rename and delete labels;
      and `:history`. The department's managers and owners; Company: owners.

  Locks are the lock matrix's (`idea_board_write_test`).
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IdeaBoardFixtures

  alias RockcutApi.AccountsFixtures

  @archived ~U[2026-11-05 12:00:00Z]

  # {verb, path} => {kind, fixture, params}. `fixture` says what the call
  # needs (see `fixture/3`).
  @routes %{
    {:get, "/api/idea_boards/:board/lists"} => {:read, :card, %{}},
    {:get, "/api/idea_boards/:board/labels"} => {:read, :card, %{}},
    {:get, "/api/idea_boards/:board/cards/:id"} => {:read, :card, %{}},
    {:get, "/api/idea_boards/:board/archived"} => {:write, :card, %{}},
    {:get, "/api/idea_boards/:board/people"} => {:write, :card, %{}},
    {:get, "/api/idea_boards/:board/history"} => {:manage, :card, %{}},
    {:post, "/api/idea_boards/:board/lists"} => {:write, :card, %{name: "New"}},
    {:patch, "/api/idea_boards/:board/lists/:id"} => {:write, :list, %{name: "Renamed"}},
    {:delete, "/api/idea_boards/:board/lists/:id"} => {:manage, :archived_list, %{}},
    {:post, "/api/idea_boards/:board/lists/:id/move"} => {:write, :list, %{}},
    {:post, "/api/idea_boards/:board/lists/:id/lock"} => {:manage, :list, %{}},
    {:post, "/api/idea_boards/:board/lists/:id/unlock"} => {:manage, :list, %{}},
    {:post, "/api/idea_boards/:board/lists/:id/archive"} => {:write, :list, %{}},
    {:post, "/api/idea_boards/:board/lists/:id/restore"} => {:write, :archived_list, %{}},
    {:post, "/api/idea_boards/:board/cards"} => {:write, :new_card, %{title: "New"}},
    {:patch, "/api/idea_boards/:board/cards/:id"} => {:write, :card, %{title: "Edited"}},
    {:delete, "/api/idea_boards/:board/cards/:id"} => {:manage, :archived_card, %{}},
    {:post, "/api/idea_boards/:board/cards/:id/move"} => {:write, :card, %{}},
    {:post, "/api/idea_boards/:board/cards/:id/lock"} => {:manage, :card, %{}},
    {:post, "/api/idea_boards/:board/cards/:id/unlock"} => {:manage, :card, %{}},
    {:post, "/api/idea_boards/:board/cards/:id/archive"} => {:write, :card, %{}},
    {:post, "/api/idea_boards/:board/cards/:id/restore"} => {:write, :archived_card, %{}},
    {:post, "/api/idea_boards/:board/cards/:id/checklist"} => {:write, :card, %{text: "Item"}},
    {:put, "/api/idea_boards/:board/cards/:id/checklist/order"} => {:write, :item, %{}},
    {:patch, "/api/idea_boards/:board/cards/:id/checklist/:item_id"} =>
      {:write, :item, %{done: true}},
    {:delete, "/api/idea_boards/:board/cards/:id/checklist/:item_id"} => {:write, :item, %{}},
    {:post, "/api/idea_boards/:board/cards/:id/notes"} => {:write, :card, %{body: "Note"}},
    {:patch, "/api/idea_boards/:board/cards/:id/notes/:note_id"} =>
      {:write, :own_note, %{body: "Edited"}},
    {:delete, "/api/idea_boards/:board/cards/:id/notes/:note_id"} => {:write, :own_note, %{}},
    {:put, "/api/idea_boards/:board/cards/:id/watch"} => {:write, :card, %{}},
    {:delete, "/api/idea_boards/:board/cards/:id/watch"} => {:write, :card, %{}},
    {:post, "/api/idea_boards/:board/labels"} => {:write, :card, %{name: "L", color: "red"}},
    {:patch, "/api/idea_boards/:board/labels/:id"} => {:manage, :label, %{name: "Renamed"}},
    {:delete, "/api/idea_boards/:board/labels/:id"} => {:manage, :label, %{}}
  }

  # The board-less route: every actor, with the boards it lists.
  @index {:get, "/api/idea_boards"}

  @boards ~w(brewery bar office sales company)

  # Each actor's standing on each department board: :member, :manager, or
  # absent; `:owner`; or `{:device, home}`.
  @actors [
    {"bartender1", %{"bar" => :member}},
    {"brewer1", %{"brewery" => :member}},
    {"barMgr", %{"bar" => :manager}},
    {"breweryMgr", %{"brewery" => :manager}},
    {"owner", :owner},
    {"noDept", %{}},
    {"taproomDevice", {:device, "bar"}},
    {"breweryDevice", {:device, "brewery"}}
  ]

  test "every Idea Board route is classified" do
    routes =
      RockcutApiWeb.Router.__routes__()
      |> Enum.filter(&String.starts_with?(&1.path, "/api/idea_boards"))
      |> Enum.map(&{&1.verb, &1.path})

    assert Enum.sort(routes -- [@index]) == Enum.sort(Map.keys(@routes))
  end

  setup do
    p = personas(~w(bartender1 brewer1 barMgr breweryMgr owner noDept))
    taproom = AccountsFixtures.device_fixture(%{name: "Taproom tablets", home: "bar"})
    brewery = AccountsFixtures.device_fixture(%{name: "Brewhouse", home: "brewery"})

    %{
      p: Map.merge(p, %{"taproomDevice" => taproom, "breweryDevice" => brewery}),
      cards: Map.new(@boards, &{&1, card!(starter(&1, "Ideas"), "#{&1} idea")}),
      devices: %{
        "taproomDevice" => AccountsFixtures.device_token_fixture(taproom, "Taproom iPad"),
        "breweryDevice" => AccountsFixtures.device_token_fixture(brewery, "Brewhouse Tab")
      }
    }
  end

  defp request(%{p: p, devices: devices}, who, verb, path, params) do
    case devices[who] do
      nil -> call(p[who], verb, path, params)
      token -> call_device(token, verb, path, params)
    end
  end

  # Fresh records for one call: `{path ids, params}`.
  defp fixture(:card, board, _actor), do: {%{id: card!(starter(board, "Ideas"), "C").id}, %{}}

  defp fixture(:new_card, board, _actor), do: {%{}, %{list_id: starter(board, "Ideas").id}}
  defp fixture(:list, board, _actor), do: {%{id: list!(board, "L").id}, %{}}

  defp fixture(:archived_list, board, _actor),
    do: {%{id: list!(board, "Old", %{archived_at: @archived}).id}, %{}}

  defp fixture(:archived_card, board, _actor),
    do: {%{id: card!(starter(board, "Ideas"), "Old", %{archived_at: @archived}).id}, %{}}

  defp fixture(:label, board, _actor), do: {%{id: label!(board, "L#{unique()}").id}, %{}}

  defp fixture(:item, board, _actor) do
    card = card!(starter(board, "Ideas"), "C")
    item = item!(card, "I", 1)
    {%{id: card.id, item_id: item.id}, %{ids: [item.id]}}
  end

  defp fixture(:own_note, board, actor) do
    card = card!(starter(board, "Ideas"), "C")
    {%{id: card.id, note_id: note!(card, actor, "Mine").id}, %{}}
  end

  defp unique, do: System.unique_integer([:positive])

  defp fill(path, board, ids) do
    Enum.reduce(ids, String.replace(path, ":board", board), fn {k, v}, acc ->
      String.replace(acc, ":#{k}", to_string(v))
    end)
  end

  # What the spec says each actor gets: `:ok` (2xx) or 403.
  defp expected(:owner, _board, _kind), do: :ok

  defp expected({:device, home}, board, :read),
    do: if(board in [home, "company"], do: :ok, else: 403)

  defp expected({:device, _}, _board, _kind), do: 403
  defp expected(_roles, "company", kind) when kind in [:read, :write], do: :ok
  defp expected(_roles, "company", :manage), do: 403

  defp expected(roles, board, kind) when kind in [:read, :write],
    do: if(Map.has_key?(roles, board), do: :ok, else: 403)

  defp expected(roles, board, :manage), do: if(roles[board] == :manager, do: :ok, else: 403)

  defp got(status) when status in 200..299, do: :ok
  defp got(status), do: status

  defp standing(who), do: @actors |> Map.new() |> Map.fetch!(who)

  for {who, _standing} <- @actors do
    test "#{who}: every route on every board", ctx do
      standing = standing(unquote(who))
      who = unquote(who)

      failures =
        for {{verb, path}, {kind, fixture, params}} <- @routes,
            board <- @boards,
            {ids, extra} = fixture(fixture, board, ctx.p[who]),
            conn = request(ctx, who, verb, fill(path, board, ids), Map.merge(params, extra)),
            got(conn.status) != expected(standing, board, kind) do
          {verb, path, board, conn.status, expected(standing, board, kind)}
        end

      assert failures == []
    end

    test "#{who}: GET /api/idea_boards lists the boards it can open", ctx do
      standing = standing(unquote(who))
      conn = request(ctx, unquote(who), :get, "/api/idea_boards", %{})
      assert conn.status == 200

      expected_keys = Enum.filter(@boards, &(expected(standing, &1, :read) == :ok))
      boards = Jason.decode!(conn.resp_body)["data"]
      assert Enum.map(boards, & &1["key"]) == expected_keys

      for b <- boards do
        assert b["manage"] == (expected(standing, b["key"], :manage) == :ok)
        assert b["history"] == (expected(standing, b["key"], :manage) == :ok)
      end
    end
  end

  test "a card id from another board is 404 for someone who can open this one", ctx do
    for {board, other} <- [{"bar", "brewery"}, {"company", "bar"}] do
      url = "/api/idea_boards/#{board}/cards/#{ctx.cards[other].id}"
      assert call(ctx.p["owner"], :get, url).status == 404
      assert call(ctx.p["owner"], :patch, url, %{title: "X"}).status == 404
      assert call(ctx.p["owner"], :post, url <> "/notes", %{body: "X"}).status == 404
    end

    url = "/api/idea_boards/company/cards/#{ctx.cards["bar"].id}"
    assert call(ctx.p["noDept"], :get, url).status == 404
    assert call_device(ctx.devices["taproomDevice"], :get, url).status == 404
  end

  test "a list, label or before_id from another board is 404", ctx do
    owner = ctx.p["owner"]
    brewery_list = starter("brewery", "Ideas")
    brewery_label = label!("brewery", "Brewery only")
    card = ctx.cards["bar"]

    assert call(owner, :patch, "/api/idea_boards/bar/lists/#{brewery_list.id}", %{name: "X"}).status ==
             404

    assert call(owner, :post, "/api/idea_boards/bar/cards", %{
             list_id: brewery_list.id,
             title: "X"
           }).status ==
             404

    assert call(owner, :post, "/api/idea_boards/bar/cards/#{card.id}/move", %{
             list_id: brewery_list.id
           }).status == 404

    assert call(owner, :post, "/api/idea_boards/bar/cards/#{card.id}/move", %{
             before_id: ctx.cards["brewery"].id
           }).status == 404

    assert call(owner, :post, "/api/idea_boards/bar/lists/#{starter("bar", "Done").id}/move", %{
             before_id: brewery_list.id
           }).status == 404

    assert call(owner, :delete, "/api/idea_boards/bar/labels/#{brewery_label.id}").status == 404

    assert call(owner, :patch, "/api/idea_boards/bar/cards/#{card.id}", %{
             label_ids: [brewery_label.id]
           }).status == 422
  end
end
