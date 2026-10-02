defmodule RockcutApi.AuthzParity.MessagingTest do
  @moduledoc "D31 parity — D29 Appendix A rows 28–31 (messaging channels, access, audiences)."
  use RockcutApiWeb.ConnCase

  import RockcutApi.PersonaFixtures

  alias RockcutApi.Messaging

  @all_depts ~w(dept:bar dept:brewery dept:office dept:sales)

  setup do
    %{p: personas()}
  end

  defp channel_keys(conn) do
    conn.resp_body
    |> Jason.decode!()
    |> Map.fetch!("data")
    |> Enum.map(& &1["key"])
    |> MapSet.new()
  end

  defp keys_of(users, p) do
    by_id = Map.new(p, fn {k, u} -> {u.id, k} end)
    users |> Enum.map(&by_id[&1.id]) |> MapSet.new()
  end

  describe "channel list" do
    for {who, keys} <- [
          {"owner", ["all", "managers" | @all_depts]},
          {"owner2", ["all", "managers" | @all_depts]},
          {"barMgr", ~w(all managers dept:bar)},
          {"dualMgr", ~w(all managers dept:bar dept:office)},
          {"splitRole", ~w(all managers dept:bar dept:brewery)},
          {"breweryMgr", ~w(all managers dept:brewery)},
          {"floater", ~w(all dept:bar dept:brewery)},
          {"bartender1", ~w(all dept:bar)},
          {"sales1", ~w(all dept:sales)},
          {"noDept", ~w(all)}
        ] do
      test "#28 #{who} sees channels #{Enum.join(keys, ", ")}", %{p: p} do
        conn = call(p[unquote(who)], :get, "/api/channels")
        assert conn.status == 200
        assert channel_keys(conn) == MapSet.new(unquote(keys))
      end
    end
  end

  describe "view / post / mark read" do
    for {who, key, code} <- [
          {"noDept", "all", 200},
          {"noDept", "managers", 403},
          {"noDept", "dept:bar", 403},
          {"bartender1", "dept:bar", 200},
          {"bartender1", "dept:brewery", 403},
          {"bartender1", "managers", 403},
          {"floater", "dept:brewery", 200},
          {"splitRole", "managers", 200},
          {"splitRole", "dept:brewery", 200},
          {"splitRole", "dept:office", 403},
          {"dualMgr", "dept:office", 200},
          {"owner", "dept:sales", 200},
          {"owner", "dept:other", 403},
          {"owner", "managers", 200}
        ] do
      test "#29 #{who} views, posts to and marks read #{key} → #{code}", %{p: p} do
        user = p[unquote(who)]
        key = unquote(key)
        assert status(user, :get, "/api/channels/#{key}/messages") == unquote(code)

        assert status(user, :post, "/api/channels/#{key}/messages", %{body: "hi"}) ==
                 if(unquote(code) == 200, do: 201, else: 403)

        assert status(user, :post, "/api/channels/#{key}/read") ==
                 if(unquote(code) == 200, do: 204, else: 403)
      end
    end
  end

  describe "audiences" do
    test "#30 Managers-channel recipients = every manager persona + owners", %{p: p} do
      assert keys_of(Messaging.recipients("managers"), p) ==
               MapSet.new(~w(owner owner2 breweryMgr barMgr dualMgr splitRole))
    end

    test "#31 department-channel recipients = active department members", %{p: p} do
      assert keys_of(Messaging.recipients("dept:bar"), p) ==
               MapSet.new(~w(barMgr bartender1 bartender2 floater newhire dualMgr splitRole))

      assert keys_of(Messaging.recipients("dept:brewery"), p) ==
               MapSet.new(~w(breweryMgr brewer1 brewer2 floater splitRole))
    end
  end
end
