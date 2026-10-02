defmodule RockcutApi.AuthzParity.OwnerOnlyTest do
  @moduledoc "D31 parity — D29 Appendix A rows 38–40 (departments, owner activity)."
  use RockcutApiWeb.ConnCase

  import RockcutApi.PersonaFixtures

  @non_owners ~w(barMgr breweryMgr dualMgr splitRole bartender1 floater noDept)

  setup do
    %{p: personas(), d: departments()}
  end

  for who <- ["owner", "noDept", "bartender1"] do
    test "#38 #{who} lists departments → 200", %{p: p} do
      assert status(p[unquote(who)], :get, "/api/departments") == 200
    end
  end

  for {who, code} <- [{"owner", 200}, {"owner2", 200}] ++ Enum.map(@non_owners, &{&1, 403}) do
    test "#39 #{who} changes a department's color → #{code}", %{p: p, d: d} do
      assert status(p[unquote(who)], :patch, "/api/departments/#{d["bar"].id}", %{
               color: "#123456"
             }) ==
               unquote(code)
    end
  end

  for {who, read, seen} <-
        [{"owner", 200, 204}, {"owner2", 200, 204}] ++ Enum.map(@non_owners, &{&1, 403, 403}) do
    test "#40 #{who} reads / marks seen the owner activity log → #{read}/#{seen}", %{p: p} do
      assert status(p[unquote(who)], :get, "/api/owner/activity") == unquote(read)
      assert status(p[unquote(who)], :post, "/api/owner/activity/seen") == unquote(seen)
    end
  end
end
