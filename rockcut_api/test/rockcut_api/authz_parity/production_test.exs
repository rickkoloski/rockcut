defmodule RockcutApi.AuthzParity.ProductionTest do
  @moduledoc """
  D46 §3.13: production setup (`/api/production`). Brewery members of any
  role and owners read and change it; everyone else is 403 (other
  departments' managers included). Devices: 403 on every route until D49
  (the route matrix, `device_route_matrix_test`).
  """
  use RockcutApiWeb.ConnCase

  import RockcutApi.PersonaFixtures

  @reads ~w(/api/production/tanks /api/production/phases /api/production/step_types /api/production/templates)

  setup do
    %{p: personas()}
  end

  for {who, code} <-
        Enum.map(~w(owner owner2 breweryMgr brewer1 brewer2 floater splitRole), &{&1, 200}) ++
          Enum.map(~w(barMgr dualMgr bartender1 office1 sales1 noDept), &{&1, 403}) do
    test "D46 #{who} reads the production setup → #{code}", %{p: p} do
      for path <- @reads do
        assert status(p[unquote(who)], :get, path) == unquote(code), path
      end
    end

    test "D46 #{who} adds a tank, a period, a step type and a template → #{code}", %{p: p} do
      user = p[unquote(who)]
      ok? = unquote(code) == 200

      tank =
        call(user, :post, "/api/production/tanks", %{
          name: "Parity #{unquote(who)}",
          capacity_bbl: 20
        })

      assert tank.status == if(ok?, do: 201, else: 403)

      assert status(user, :post, "/api/production/step_types", %{name: "Parity #{unquote(who)}"}) ==
               if(ok?, do: 201, else: 403)

      assert status(user, :post, "/api/production/templates", %{name: "Parity #{unquote(who)}"}) ==
               if(ok?, do: 201, else: 403)

      # Out-of-service periods are a schedule write (`:write`).
      id =
        if ok?,
          do: Jason.decode!(tank.resp_body)["data"]["id"],
          else:
            RockcutApi.Production.create_tank(%{name: "Parity spare", capacity_bbl: 20})
            |> elem(1)
            |> Map.get(:id)

      assert status(user, :post, "/api/production/tanks/#{id}/outages", %{starts_on: "2026-11-01"}) ==
               if(ok?, do: 201, else: 403)
    end
  end
end
