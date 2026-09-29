defmodule RockcutApi.AuthzParity.BrewingTest do
  @moduledoc """
  D31 parity — D29 Appendix A row 41 (the `:brewery` route pipeline). Any
  Brewery member, of any role, or an owner has full access; everyone else is 403.
  Row 42 (the Brewing `can?/3` clause) has no callers.
  """
  use RockcutApiWeb.ConnCase

  import RockcutApi.PersonaFixtures

  @paths ~w(/api/brands /api/recipes /api/ingredients /api/ingredient_categories /api/batches /api/formulas/catalog)

  setup do
    %{p: personas()}
  end

  for {who, code} <-
        Enum.map(~w(owner owner2 breweryMgr brewer1 floater splitRole), &{&1, 200}) ++
          Enum.map(~w(barMgr dualMgr bartender1 office1 sales1 noDept), &{&1, 403}) do
    test "#41 #{who} reads every brewing resource → #{code}", %{p: p} do
      for path <- @paths do
        assert status(p[unquote(who)], :get, path) == unquote(code), path
      end
    end
  end

  for {who, code} <- [{"brewer1", 201}, {"floater", 201}, {"barMgr", 403}, {"noDept", 403}] do
    test "#41 #{who} creates a brand → #{code}", %{p: p} do
      assert status(p[unquote(who)], :post, "/api/brands", %{name: "Parity Pale #{unquote(who)}"}) ==
               unquote(code)
    end
  end
end
