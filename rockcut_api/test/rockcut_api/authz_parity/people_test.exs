defmodule RockcutApi.AuthzParity.PeopleTest do
  @moduledoc """
  D31 parity — D29 Appendix A rows 33–37 (users, passwords, owner flag,
  memberships). User create by "any manager" (#34) is narrowed in Phase 2
  (D29 §6 C); these tests pin today's behavior.
  """
  use RockcutApiWeb.ConnCase

  import RockcutApi.PersonaFixtures

  alias RockcutApi.Accounts

  @bar_members ~w(barMgr bartender1 bartender2 floater newhire dualMgr splitRole)
  @brewery_members ~w(breweryMgr brewer1 brewer2 floater splitRole)
  @office_members ~w(office1 hidden dualMgr)
  @employees ~w(bartender1 brewer1 floater office1 sales1 noDept)

  setup do
    %{p: personas()}
  end

  defp user_keys(conn, p) do
    by_id = Map.new(p, fn {k, u} -> {u.id, k} end)

    conn.resp_body
    |> Jason.decode!()
    |> Map.fetch!("data")
    |> Enum.map(&by_id[&1["id"]])
    |> MapSet.new()
  end

  describe "list" do
    for {who, sees} <- [
          {"barMgr", @bar_members},
          {"splitRole", @bar_members},
          {"dualMgr", Enum.uniq(@bar_members ++ @office_members)},
          {"breweryMgr", @brewery_members}
        ] do
      test "#33 #{who} lists users → members of managed departments only", %{p: p} do
        conn = call(p[unquote(who)], :get, "/api/users")
        assert conn.status == 200
        assert user_keys(conn, p) == MapSet.new(unquote(sees))
      end
    end

    test "#33 owner lists users → everyone", %{p: p} do
      conn = call(p["owner"], :get, "/api/users")
      assert conn.status == 200
      assert user_keys(conn, p) == MapSet.new(Map.keys(p))
    end

    for who <- @employees do
      test "#33 #{who} lists users → 403", %{p: p} do
        assert status(p[unquote(who)], :get, "/api/users") == 403
      end
    end
  end

  describe "create" do
    for {who, memberships, code} <- [
          {"owner", [{"sales", "manager"}], 201},
          {"owner", [], 201},
          {"owner", [{"other", "employee"}], 422},
          {"barMgr", [{"bar", "employee"}], 201},
          {"barMgr", [{"bar", "manager"}], 201},
          {"barMgr", [], 201},
          {"barMgr", [{"brewery", "employee"}], 403},
          {"dualMgr", [{"office", "employee"}], 201},
          {"splitRole", [{"brewery", "employee"}], 403},
          {"breweryMgr", [{"brewery", "employee"}, {"bar", "employee"}], 403},
          {"bartender1", [], 403},
          {"noDept", [], 403}
        ] do
      test "#34 #{who} creates a user with #{inspect(memberships)} → #{code}", %{p: p} do
        params = %{
          email: "new#{System.unique_integer([:positive])}@rockcut-test.com",
          name: "New Person",
          memberships: Enum.map(unquote(memberships), fn {d, r} -> %{department: d, role: r} end)
        }

        assert status(p[unquote(who)], :post, "/api/users", params) == unquote(code)
      end
    end
  end

  describe "update / reset password" do
    for {who, target, code} <- [
          {"owner", "noDept", 200},
          {"owner2", "barMgr", 200},
          {"barMgr", "floater", 200},
          {"barMgr", "barMgr", 200},
          {"barMgr", "dualMgr", 200},
          {"barMgr", "brewer1", 403},
          {"barMgr", "noDept", 403},
          {"barMgr", "owner", 403},
          {"splitRole", "brewer1", 403},
          {"splitRole", "bartender1", 200},
          {"dualMgr", "office1", 200},
          {"breweryMgr", "splitRole", 200},
          {"bartender1", "bartender2", 403},
          {"noDept", "noDept", 403}
        ] do
      test "#35 #{who} renames and resets the password of #{target} → #{code}", %{p: p} do
        id = p[unquote(target)].id

        assert status(p[unquote(who)], :patch, "/api/users/#{id}", %{name: "Renamed"}) ==
                 unquote(code)

        assert status(p[unquote(who)], :post, "/api/users/#{id}/reset_password") == unquote(code)
      end
    end
  end

  describe "owner flag" do
    test "#36 a manager's is_owner param is ignored", %{p: p} do
      assert status(p["barMgr"], :patch, "/api/users/#{p["bartender1"].id}", %{is_owner: true}) ==
               200

      refute Accounts.get_user!(p["bartender1"].id).is_owner
    end

    test "#36 an owner may grant the owner flag", %{p: p} do
      assert status(p["owner"], :patch, "/api/users/#{p["bartender1"].id}", %{is_owner: true}) ==
               200

      assert Accounts.get_user!(p["bartender1"].id).is_owner
    end

    test "#36 owners can be demoted until one active owner is left", %{p: p} do
      assert status(p["owner"], :patch, "/api/users/#{p["owner2"].id}", %{is_owner: false}) == 200
      assert status(p["owner"], :patch, "/api/users/#{p["owner"].id}", %{is_owner: false}) == 422
      assert status(p["owner"], :patch, "/api/users/#{p["owner"].id}", %{active: false}) == 422
    end
  end

  describe "memberships" do
    for {who, target, memberships, code} <- [
          {"owner", "noDept", [{"sales", "employee"}], 200},
          {"owner", "noDept", [{"other", "employee"}], 422},
          {"barMgr", "bartender1", [{"bar", "manager"}], 200},
          {"barMgr", "bartender1", [], 200},
          {"barMgr", "brewer1", [{"bar", "employee"}], 200},
          # Listing an unmanaged department is refused, even with its role unchanged.
          {"barMgr", "brewer1", [{"brewery", "employee"}, {"bar", "employee"}], 403},
          {"barMgr", "bartender1", [{"brewery", "employee"}], 403},
          {"barMgr", "noDept", [{"bar", "employee"}], 200},
          {"dualMgr", "office1", [{"office", "manager"}], 200},
          {"splitRole", "brewer1", [{"brewery", "manager"}], 403},
          {"bartender1", "bartender2", [{"bar", "manager"}], 403},
          {"noDept", "noDept", [{"bar", "manager"}], 403}
        ] do
      test "#37 #{who} sets #{target}'s memberships to #{inspect(memberships)} → #{code}", %{p: p} do
        params = %{
          memberships: Enum.map(unquote(memberships), fn {d, r} -> %{department: d, role: r} end)
        }

        assert status(
                 p[unquote(who)],
                 :put,
                 "/api/users/#{p[unquote(target)].id}/memberships",
                 params
               ) ==
                 unquote(code)
      end
    end

    test "#37 a manager's change leaves departments they don't manage untouched", %{p: p} do
      assert status(p["barMgr"], :put, "/api/users/#{p["floater"].id}/memberships", %{
               memberships: []
             }) ==
               200

      keys = Accounts.get_user!(p["floater"].id).memberships |> Enum.map(& &1.department.key)
      assert keys == ["brewery"]
    end
  end
end
