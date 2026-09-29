defmodule RockcutApi.AuthzParity.CalendarFeedsTest do
  @moduledoc "D31 parity — D29 Appendix A rows 25–26 (calendar feeds). Row 27 (public ICS fetch) is not an access decision."
  use RockcutApiWeb.ConnCase

  import RockcutApi.PersonaFixtures

  setup do
    %{p: personas(), d: departments()}
  end

  # The entitlement list as {subject_type, dept_key | :self | nil}.
  defp entitlements(conn, user, d) do
    key_by_id = Map.new(d, fn {k, dept} -> {dept.id, k} end)

    conn.resp_body
    |> Jason.decode!()
    |> Map.fetch!("data")
    |> Enum.map(fn
      %{"subject_type" => "user", "subject_id" => id} when id == user.id -> {"user", :self}
      %{"subject_type" => "department", "subject_id" => id} -> {"department", key_by_id[id]}
      %{"subject_type" => type, "subject_id" => id} -> {type, id}
    end)
    |> MapSet.new()
  end

  describe "entitlements" do
    for {who, depts, whole?} <- [
          {"owner", ~w(brewery bar office sales other), true},
          {"owner2", ~w(brewery bar office sales other), true},
          {"barMgr", ~w(bar), false},
          {"dualMgr", ~w(bar office), false},
          {"splitRole", ~w(bar), false},
          {"breweryMgr", ~w(brewery), false},
          {"bartender1", [], false},
          {"floater", [], false},
          {"noDept", [], false}
        ] do
      test "#25 #{who} gets My shifts + #{inspect(depts)} dept feeds, whole-schedule #{whole?}",
           %{p: p, d: d} do
        user = p[unquote(who)]
        conn = call(user, :get, "/api/calendar_feeds")
        assert conn.status == 200

        expected =
          [{"user", :self}] ++
            Enum.map(unquote(depts), &{"department", &1}) ++
            if(unquote(whole?), do: [{"all", nil}], else: [])

        assert entitlements(conn, user, d) == MapSet.new(expected)
      end
    end
  end

  describe "rotate" do
    for {who, type, subject, code} <- [
          {"bartender1", "user", :self, 200},
          {"noDept", "user", :self, 200},
          {"bartender1", "user", "bartender2", 403},
          {"barMgr", "user", "bartender1", 403},
          {"owner", "user", "bartender1", 200},
          {"barMgr", "department", "bar", 200},
          {"barMgr", "department", "brewery", 403},
          {"dualMgr", "department", "office", 200},
          {"dualMgr", "department", "brewery", 403},
          {"splitRole", "department", "bar", 200},
          {"splitRole", "department", "brewery", 403},
          {"bartender1", "department", "bar", 403},
          {"owner2", "department", "other", 200},
          {"owner", "all", nil, 200},
          {"barMgr", "all", nil, 403},
          {"dualMgr", "all", nil, 403}
        ] do
      test "#26 #{who} rotates the #{type} feed for #{inspect(subject)} → #{code}", %{p: p, d: d} do
        user = p[unquote(who)]

        subject_id =
          case {unquote(type), unquote(subject)} do
            {"user", :self} -> user.id
            {"user", other} -> p[other].id
            {"department", key} -> d[key].id
            {"all", _} -> nil
          end

        assert status(user, :post, "/api/calendar_feeds/rotate", %{
                 subject_type: unquote(type),
                 subject_id: subject_id
               }) == unquote(code)
      end
    end
  end
end
