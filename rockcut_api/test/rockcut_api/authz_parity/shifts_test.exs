defmodule RockcutApi.AuthzParity.ShiftsTest do
  @moduledoc """
  D31 parity — D29 Appendix A rows 1–7 (shifts). Written against the
  pre-consolidation code; must pass unmodified after D31.
  """
  use RockcutApiWeb.ConnCase

  import RockcutApi.PersonaFixtures
  import RockcutApi.SchedulingFixtures

  alias RockcutApi.Repo
  alias RockcutApi.Scheduling.Shift

  setup do
    p = personas()
    d = departments()
    pos = Map.new(~w(bar brewery office), &{&1, position_fixture(%{department: d[&1]})})
    pos = Map.put(pos, "bar2", position_fixture(%{department: d["bar"]}))

    shift = fn dept, status, assignee ->
      shift_fixture(%{
        department: d[dept],
        position: pos[dept],
        status: status,
        assignee_id: assignee && p[assignee].id
      })
    end

    s = %{
      bar_draft: shift.("bar", "draft", "bartender1"),
      bar_pub: shift.("bar", "published", "bartender1"),
      bar_open: shift.("bar", "published", nil),
      bar_draft_open: shift.("bar", "draft", nil),
      brewery_draft: shift.("brewery", "draft", "brewer1"),
      brewery_open: shift.("brewery", "published", nil)
    }

    %{p: p, pos: pos, s: s}
  end

  defp later(hours) do
    DateTime.utc_now()
    |> DateTime.add(hours * 3600)
    |> DateTime.truncate(:second)
    |> DateTime.to_iso8601()
  end

  describe "shift read" do
    for who <- ~w(owner breweryMgr barMgr bartender1 brewer1 floater noDept sales1) do
      test "#1 #{who} reads a published Bar shift → 200", %{p: p, s: s} do
        assert status(p[unquote(who)], :get, "/api/shifts/#{s.bar_pub.id}") == 200
      end
    end

    for {who, code} <- [
          {"owner", 200},
          {"owner2", 200},
          {"barMgr", 200},
          {"dualMgr", 200},
          {"splitRole", 200},
          {"breweryMgr", 403},
          {"bartender1", 403},
          {"floater", 403},
          {"noDept", 403}
        ] do
      test "#1 #{who} reads a Bar draft → #{code}", %{p: p, s: s} do
        assert status(p[unquote(who)], :get, "/api/shifts/#{s.bar_draft.id}") == unquote(code)
      end
    end
  end

  describe "shift list" do
    for {who, sees_bar_draft, sees_brewery_draft} <- [
          {"owner", true, true},
          {"barMgr", true, false},
          {"dualMgr", true, false},
          {"splitRole", true, false},
          {"breweryMgr", false, true},
          {"bartender1", false, false},
          {"brewer1", false, false},
          {"floater", false, false},
          {"noDept", false, false}
        ] do
      test "#2 #{who} lists shifts: published always; Bar draft #{sees_bar_draft}, Brewery draft #{sees_brewery_draft}",
           %{p: p, s: s} do
        ids = call(p[unquote(who)], :get, "/api/shifts") |> data_ids()

        for published <- [s.bar_pub, s.bar_open, s.brewery_open], do: assert(published.id in ids)
        assert s.bar_draft.id in ids == unquote(sees_bar_draft)
        assert s.bar_draft_open.id in ids == unquote(sees_bar_draft)
        assert s.brewery_draft.id in ids == unquote(sees_brewery_draft)
      end
    end
  end

  describe "shift create" do
    for {who, dept, code} <- [
          {"owner", "brewery", 201},
          {"barMgr", "bar", 201},
          {"dualMgr", "bar", 201},
          {"dualMgr", "office", 201},
          {"dualMgr", "brewery", 403},
          {"splitRole", "bar", 201},
          {"splitRole", "brewery", 403},
          {"breweryMgr", "brewery", 201},
          {"breweryMgr", "bar", 403},
          {"bartender1", "bar", 403},
          {"floater", "brewery", 403},
          {"noDept", "bar", 403}
        ] do
      test "#3 #{who} creates a #{dept} shift → #{code}", %{p: p, pos: pos} do
        params = %{position_id: pos[unquote(dept)].id, starts_at: later(24), ends_at: later(30)}
        assert status(p[unquote(who)], :post, "/api/shifts", params) == unquote(code)
      end
    end
  end

  describe "shift update / move" do
    for {who, to, code} <- [
          {"barMgr", "bar2", 200},
          {"barMgr", "brewery", 403},
          {"dualMgr", "office", 200},
          {"splitRole", "brewery", 403},
          {"breweryMgr", "brewery", 403},
          {"owner", "brewery", 200},
          {"bartender1", "bar2", 403}
        ] do
      test "#4 #{who} moves a Bar draft to the #{to} position → #{code}", %{p: p, pos: pos, s: s} do
        assert status(p[unquote(who)], :patch, "/api/shifts/#{s.bar_draft.id}", %{
                 position_id: pos[unquote(to)].id
               }) == unquote(code)
      end
    end

    for {who, code} <- [
          {"barMgr", 200},
          {"splitRole", 200},
          {"breweryMgr", 403},
          {"floater", 403}
        ] do
      test "#4 #{who} reassigns a Bar draft → #{code}", %{p: p, s: s} do
        assert status(p[unquote(who)], :patch, "/api/shifts/#{s.bar_draft.id}", %{
                 assignee_id: p["bartender2"].id
               }) == unquote(code)
      end
    end
  end

  describe "delete / publish / unpublish" do
    for {who, code} <- [
          {"owner2", 200},
          {"barMgr", 200},
          {"dualMgr", 200},
          {"splitRole", 200},
          {"breweryMgr", 403},
          {"bartender1", 403},
          {"noDept", 403}
        ] do
      test "#5 #{who} publishes a Bar draft → #{code}", %{p: p, s: s} do
        assert status(p[unquote(who)], :post, "/api/shifts/#{s.bar_draft.id}/publish") ==
                 unquote(code)
      end

      test "#5 #{who} unpublishes a Bar shift → #{code}", %{p: p, s: s} do
        assert status(p[unquote(who)], :post, "/api/shifts/#{s.bar_pub.id}/unpublish") ==
                 unquote(code)
      end

      test "#5 #{who} deletes a Bar draft → #{code}", %{p: p, s: s} do
        assert status(p[unquote(who)], :delete, "/api/shifts/#{s.bar_draft.id}") == unquote(code)
      end
    end

    test "#5 splitRole deletes a Brewery draft → 403", %{p: p, s: s} do
      assert status(p["splitRole"], :delete, "/api/shifts/#{s.brewery_draft.id}") == 403
    end
  end

  describe "publish batch" do
    for {who, published} <- [
          {"owner", [:bar_draft, :brewery_draft]},
          {"breweryMgr", [:brewery_draft]},
          {"barMgr", [:bar_draft]},
          {"splitRole", [:bar_draft]},
          {"bartender1", []}
        ] do
      test "#6 #{who} publishes the week → only #{inspect(published)}", %{p: p, s: s} do
        published = unquote(published)
        ids = [s.bar_draft.id, s.brewery_draft.id]
        conn = call(p[unquote(who)], :post, "/api/shifts/publish", %{ids: ids})
        assert conn.status == 200

        for key <- [:bar_draft, :brewery_draft] do
          expected = if key in published, do: "published", else: "draft"
          assert Repo.get!(Shift, s[key].id).status == expected
        end
      end
    end
  end

  describe "claim an open shift" do
    for {who, shift, code} <- [
          {"bartender1", :bar_open, 200},
          {"floater", :bar_open, 200},
          {"floater", :brewery_open, 200},
          {"splitRole", :brewery_open, 200},
          {"barMgr", :bar_open, 200},
          {"brewer1", :bar_open, 403},
          {"breweryMgr", :bar_open, 403},
          {"noDept", :bar_open, 403},
          {"bartender1", :bar_draft_open, 403},
          {"bartender2", :bar_pub, 403}
        ] do
      test "#7 #{who} claims #{shift} → #{code}", %{p: p, s: s} do
        assert status(p[unquote(who)], :post, "/api/shifts/#{s[unquote(shift)].id}/claim") ==
                 unquote(code)
      end
    end
  end
end
