defmodule RockcutApiWeb.IdeaBoardRouteMatrixTest do
  @moduledoc """
  D53 Part 2 stage 2: every Idea Board route × every board × {member,
  another department's member, manager, another department's manager,
  owner, `noDept`, Taproom tablet, Brewery tablet} (spec §4.2). Generated
  from the router: a new `/api/idea_boards` route fails "every route is
  classified" until it's given a kind below.

    * `:read`: the board and its labels and cards. Department boards: its
      members and owners; Company: every person; tablets: their home board
      and Company.
    * `:people_read`: Archived. As `:read`, but people only (`DeviceGate`).
    * `:history`: the department's managers and owners; Company: owners.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IdeaBoardFixtures

  alias RockcutApi.AccountsFixtures

  @routes %{
    {:get, "/api/idea_boards/:board/lists"} => :read,
    {:get, "/api/idea_boards/:board/labels"} => :read,
    {:get, "/api/idea_boards/:board/cards/:id"} => :read,
    {:get, "/api/idea_boards/:board/archived"} => :people_read,
    {:get, "/api/idea_boards/:board/history"} => :history
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

    cards = Map.new(@boards, &{&1, card!(starter(&1, "Ideas"), "#{&1} idea")})

    %{
      p: p,
      cards: cards,
      devices: %{
        "taproomDevice" => AccountsFixtures.device_token_fixture(taproom, "Taproom iPad"),
        "breweryDevice" => AccountsFixtures.device_token_fixture(brewery, "Brewhouse Tab")
      }
    }
  end

  defp request(%{p: p, devices: devices}, who, verb, path) do
    case devices[who] do
      nil -> call(p[who], verb, path)
      token -> call_device(token, verb, path)
    end
  end

  # What the spec says each actor gets.
  defp expected(:owner, _board, _kind), do: 200

  defp expected({:device, home}, board, :read),
    do: if(board in [home, "company"], do: 200, else: 403)

  defp expected({:device, _}, _board, _kind), do: 403

  defp expected(_roles, "company", kind) when kind in [:read, :people_read], do: 200
  defp expected(_roles, "company", :history), do: 403

  defp expected(roles, board, kind) when kind in [:read, :people_read],
    do: if(Map.has_key?(roles, board), do: 200, else: 403)

  defp expected(roles, board, :history), do: if(roles[board] == :manager, do: 200, else: 403)

  for {who, standing} <- @actors do
    test "#{who}: every route on every board", ctx do
      standing = unquote(Macro.escape(standing))

      failures =
        for {{verb, path}, kind} <- @routes,
            board <- @boards,
            url =
              path
              |> String.replace(":board", board)
              |> String.replace(":id", to_string(ctx.cards[board].id)),
            conn = request(ctx, unquote(who), verb, url),
            conn.status != expected(standing, board, kind) do
          {verb, url, conn.status, expected(standing, board, kind)}
        end

      assert failures == []
    end

    test "#{who}: GET /api/idea_boards lists the boards it can open", ctx do
      standing = unquote(Macro.escape(standing))
      conn = request(ctx, unquote(who), :get, "/api/idea_boards")
      assert conn.status == 200

      expected_keys = Enum.filter(@boards, &(expected(standing, &1, :read) == 200))
      boards = Jason.decode!(conn.resp_body)["data"]
      assert Enum.map(boards, & &1["key"]) == expected_keys

      for b <- boards do
        assert b["manage"] == (expected(standing, b["key"], :history) == 200)
        assert b["history"] == (expected(standing, b["key"], :history) == 200)
      end
    end
  end

  test "a card id from another board is 404 for someone who can open this one", ctx do
    for {board, other} <- [{"bar", "brewery"}, {"company", "bar"}] do
      url = "/api/idea_boards/#{board}/cards/#{ctx.cards[other].id}"
      assert call(ctx.p["owner"], :get, url).status == 404
    end

    url = "/api/idea_boards/company/cards/#{ctx.cards["bar"].id}"
    assert call(ctx.p["noDept"], :get, url).status == 404
    assert call_device(ctx.devices["taproomDevice"], :get, url).status == 404
  end
end
