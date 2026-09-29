defmodule RockcutApi.AuthzParity.ScheduleSetupTest do
  @moduledoc """
  D31 parity — D29 Appendix A rows 8–15 (positions, shift templates, schedule
  templates, roster). Today: anyone reads; **any** manager (of any department)
  or owner writes. D29 §6 C narrows writes to managed departments in Phase 2;
  these tests pin the pre-change behavior and will be flipped then, not in D31.
  """
  use RockcutApiWeb.ConnCase

  import RockcutApi.PersonaFixtures
  import RockcutApi.SchedulingFixtures

  @writers ~w(owner owner2 barMgr breweryMgr dualMgr splitRole)
  @non_writers ~w(bartender1 brewer1 floater office1 sales1 noDept)

  setup do
    p = personas()
    d = departments()
    brewery_pos = position_fixture(%{department: d["brewery"]})
    other_pos = position_fixture(%{department: d["other"]})
    # Unreferenced, so delete is a real delete. (Deleting a position used by a
    # schedule template 500s today — a separate bug, not an authz decision.)
    spare_pos = position_fixture(%{department: d["brewery"]})

    shift_template =
      call(p["owner"], :post, "/api/shift_templates", %{
        position_id: brewery_pos.id,
        name: "Brew day",
        start_time: "07:00:00",
        end_time: "15:00:00"
      })
      |> json_data()

    schedule_template =
      call(p["owner"], :post, "/api/schedule_templates", %{
        name: "Brew week",
        kind: "week",
        items: [
          %{
            position_id: brewery_pos.id,
            day_index: 0,
            start_time: "07:00:00",
            end_time: "15:00:00"
          }
        ]
      })
      |> json_data()

    %{
      p: p,
      d: d,
      brewery_pos: brewery_pos,
      other_pos: other_pos,
      spare_pos: spare_pos,
      shift_template: shift_template,
      schedule_template: schedule_template
    }
  end

  defp json_data(conn), do: conn.resp_body |> Jason.decode!() |> Map.fetch!("data")

  describe "reads (anyone)" do
    for who <- ~w(noDept bartender1 office1 barMgr owner) do
      test "#8 #10 #12 #14 #{who} reads positions, shift templates, schedule templates, roster → 200",
           %{p: p} do
        user = p[unquote(who)]

        for path <- ~w(/api/positions /api/shift_templates /api/schedule_templates /api/roster) do
          assert status(user, :get, path) == 200, path
        end
      end
    end
  end

  describe "positions write" do
    for who <- @writers do
      test "#9 #{who} creates, updates and deletes a Brewery position → allowed",
           %{p: p, d: d, brewery_pos: pos, spare_pos: spare} do
        user = p[unquote(who)]

        assert status(user, :post, "/api/positions", %{
                 name: "New",
                 department_id: d["brewery"].id
               }) ==
                 201

        assert status(user, :patch, "/api/positions/#{pos.id}", %{color_shade: 0.4}) == 200
        assert status(user, :delete, "/api/positions/#{spare.id}") == 200
      end

      test "#9 #{who} edits a position in Other → allowed", %{p: p, other_pos: pos} do
        assert status(p[unquote(who)], :patch, "/api/positions/#{pos.id}", %{color_shade: 0.4}) ==
                 200
      end
    end

    for who <- @non_writers do
      test "#9 #{who} creates, updates or deletes a position → 403",
           %{p: p, d: d, brewery_pos: pos, spare_pos: spare} do
        user = p[unquote(who)]

        assert status(user, :post, "/api/positions", %{
                 name: "New",
                 department_id: d["brewery"].id
               }) ==
                 403

        assert status(user, :patch, "/api/positions/#{pos.id}", %{color_shade: 0.4}) == 403
        assert status(user, :delete, "/api/positions/#{spare.id}") == 403
      end
    end
  end

  describe "shift templates write" do
    for {who, create, change} <-
          Enum.map(@writers, &{&1, 201, 200}) ++ Enum.map(@non_writers, &{&1, 403, 403}) do
      test "#11 #{who} creates / updates / deletes a Brewery shift template → #{create}/#{change}/#{change}",
           %{p: p, brewery_pos: pos, shift_template: t} do
        user = p[unquote(who)]

        assert status(user, :post, "/api/shift_templates", %{
                 position_id: pos.id,
                 name: "Late",
                 start_time: "12:00:00",
                 end_time: "20:00:00"
               }) == unquote(create)

        assert status(user, :patch, "/api/shift_templates/#{t["id"]}", %{name: "Renamed"}) ==
                 unquote(change)

        assert status(user, :delete, "/api/shift_templates/#{t["id"]}") == unquote(change)
      end
    end
  end

  describe "schedule templates write" do
    for {who, create, delete} <-
          Enum.map(@writers, &{&1, 201, 200}) ++ Enum.map(@non_writers, &{&1, 403, 403}) do
      test "#13 #{who} creates / deletes a Brewery schedule template → #{create}/#{delete}",
           %{p: p, brewery_pos: pos, schedule_template: t} do
        user = p[unquote(who)]

        assert status(user, :post, "/api/schedule_templates", %{
                 name: "Another week",
                 kind: "week",
                 items: [
                   %{
                     position_id: pos.id,
                     day_index: 1,
                     start_time: "07:00:00",
                     end_time: "15:00:00"
                   }
                 ]
               }) == unquote(create)

        assert status(user, :delete, "/api/schedule_templates/#{t["id"]}") == unquote(delete)
      end
    end
  end

  describe "roster order" do
    for {who, code} <- Enum.map(@writers, &{&1, 200}) ++ Enum.map(@non_writers, &{&1, 403}) do
      test "#15 #{who} reorders the company roster → #{code}", %{p: p} do
        ids = [p["bartender1"].id, p["brewer1"].id]

        assert status(p[unquote(who)], :post, "/api/roster/order", %{user_ids: ids}) ==
                 unquote(code)
      end
    end
  end
end
