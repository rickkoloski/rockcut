defmodule RockcutApi.AuthzParity.CapabilitiesTest do
  @moduledoc """
  D31 parity — D29 Appendix A row 44: the `/api/me` capabilities map for every
  active persona. List fields are compared as sets; their order isn't
  meaningful (the UI sorts them).
  """
  use RockcutApi.DataCase

  import RockcutApi.PersonaFixtures

  alias RockcutApi.Accounts

  @all ~w(bar brewery office sales)

  # {persona, modules (without "schedule"), manages_departments, can_manage_users}
  @expected [
    {"owner", @all, @all, true},
    {"owner2", @all, @all, true},
    {"breweryMgr", ~w(brewery), ~w(brewery), true},
    {"barMgr", ~w(bar), ~w(bar), true},
    {"dualMgr", ~w(bar office), ~w(bar office), true},
    {"splitRole", ~w(bar brewery), ~w(bar), true},
    {"brewer1", ~w(brewery), [], false},
    {"brewer2", ~w(brewery), [], false},
    {"bartender1", ~w(bar), [], false},
    {"bartender2", ~w(bar), [], false},
    {"newhire", ~w(bar), [], false},
    {"floater", ~w(bar brewery), [], false},
    {"office1", ~w(office), [], false},
    {"hidden", ~w(office), [], false},
    {"sales1", ~w(sales), [], false},
    {"noDept", [], [], false}
  ]

  setup do
    %{p: personas()}
  end

  for {who, modules, manages, can_manage_users} <- @expected do
    test "#44 #{who} capabilities", %{p: p} do
      caps = Accounts.capabilities(reload(p[unquote(who)]))

      assert Enum.sort(caps.modules) == Enum.sort(["schedule" | unquote(modules)])
      assert Enum.sort(caps.manages_departments) == Enum.sort(unquote(manages))
      assert caps.can_manage_users == unquote(can_manage_users)
      assert caps.pending_owner_reviews == 0

      assert Map.keys(caps) |> Enum.sort() ==
               ~w(can_manage_users manages_departments modules pending_owner_reviews)a
    end
  end

  test "#44 /api/me returns the same capabilities map", %{p: p} do
    body = call(p["splitRole"], :get, "/api/me").resp_body |> Jason.decode!()
    assert Enum.sort(body["capabilities"]["modules"]) == ~w(bar brewery schedule)
    assert body["capabilities"]["manages_departments"] == ["bar"]
    assert body["capabilities"]["can_manage_users"] == true
  end
end
