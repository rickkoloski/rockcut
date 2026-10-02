defmodule RockcutApi.AuthzParity.AvailabilityTest do
  @moduledoc "D31 parity — D29 Appendix A rows 23–24 (availability)."
  use RockcutApiWeb.ConnCase

  import RockcutApi.PersonaFixtures

  alias RockcutApi.Availability

  @owners_of_slots ~w(bartender1 brewer1 floater office1 splitRole barMgr noDept)
  @slot %{"weekday" => 1, "kind" => "unavailable", "all_day" => true}

  setup do
    p = personas()

    slots =
      Map.new(@owners_of_slots, fn who ->
        {:ok, s} = Availability.create(@slot, p[who])
        {who, s}
      end)

    %{p: p, slots: slots}
  end

  defp slot_owner_keys(conn, p) do
    by_id = Map.new(p, fn {k, u} -> {u.id, k} end)

    conn.resp_body
    |> Jason.decode!()
    |> Map.fetch!("data")
    |> Enum.map(&by_id[&1["user_id"]])
    |> MapSet.new()
  end

  describe "list" do
    for {who, sees} <- [
          {"owner", ~w(bartender1 brewer1 floater office1 splitRole barMgr noDept)},
          {"barMgr", ~w(barMgr bartender1 floater splitRole)},
          {"dualMgr", ~w(bartender1 floater splitRole barMgr office1)},
          {"breweryMgr", ~w(brewer1 floater splitRole)},
          {"splitRole", ~w(splitRole bartender1 floater barMgr)},
          {"bartender1", ~w(bartender1)},
          {"noDept", ~w(noDept)},
          {"sales1", []}
        ] do
      test "#23 #{who} lists availability → slots of #{Enum.join(sees, ", ")}", %{p: p} do
        conn = call(p[unquote(who)], :get, "/api/availability")
        assert conn.status == 200
        assert slot_owner_keys(conn, p) == MapSet.new(unquote(sees))
      end
    end
  end

  describe "create" do
    for {who, target, code} <- [
          {"noDept", nil, 201},
          {"bartender1", nil, 201},
          {"bartender1", "bartender1", 201},
          {"bartender1", "bartender2", 403},
          {"owner", "noDept", 201},
          {"barMgr", "bartender1", 201},
          {"barMgr", "floater", 201},
          {"barMgr", "brewer1", 403},
          {"dualMgr", "office1", 201},
          {"splitRole", "brewer1", 403},
          {"breweryMgr", "splitRole", 201}
        ] do
      test "#24 #{who} creates a slot for #{target || "self"} → #{code}", %{p: p} do
        params =
          if unquote(target), do: Map.put(@slot, "user_id", p[unquote(target)].id), else: @slot

        assert status(p[unquote(who)], :post, "/api/availability", params) == unquote(code)
      end
    end
  end

  describe "delete" do
    for {who, owner_of_slot, code} <- [
          {"bartender1", "bartender1", 204},
          {"bartender1", "floater", 403},
          {"noDept", "noDept", 204},
          {"owner2", "noDept", 204},
          {"barMgr", "bartender1", 204},
          {"barMgr", "brewer1", 403},
          {"breweryMgr", "floater", 204},
          {"dualMgr", "office1", 204},
          {"splitRole", "brewer1", 403}
        ] do
      test "#24 #{who} deletes #{owner_of_slot}'s slot → #{code}", %{p: p, slots: slots} do
        assert status(
                 p[unquote(who)],
                 :delete,
                 "/api/availability/#{slots[unquote(owner_of_slot)].id}"
               ) ==
                 unquote(code)
      end
    end
  end
end
