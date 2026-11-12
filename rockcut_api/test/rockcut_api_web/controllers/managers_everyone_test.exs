defmodule RockcutApiWeb.ManagersEveryoneTest do
  @moduledoc """
  D58 §3.3, §3.4 (decisions 3, 5, 6, 7): every manager sees every person;
  outside their departments a person is read-only except Add department;
  deactivating needs every department managed; positions and templates stop
  at a manager's departments. Spec §5 S7–S14, as `breweryMgr`, `barMgr`,
  `dualMgr` and `owner`.
  """
  use RockcutApiWeb.ConnCase

  import RockcutApi.PersonaFixtures
  import RockcutApi.SchedulingFixtures

  alias RockcutApi.{Accounts, AccountsFixtures}

  setup do
    %{p: personas(), d: departments()}
  end

  defp body(conn), do: Jason.decode!(conn.resp_body)

  defp row(conn, %{id: id}),
    do: conn |> body() |> Map.fetch!("data") |> Enum.find(&(&1["id"] == id))

  defp keys(%{"memberships" => ms}), do: ms |> Enum.map(& &1["department_key"]) |> Enum.sort()

  defp dept_keys(user),
    do: reload(user).memberships |> Enum.map(& &1.department.key) |> Enum.sort()

  # A `[TEST-TEMP]` person in `depts` (employee), so no persona changes.
  defp temp_person(depts) do
    user =
      AccountsFixtures.user_fixture(%{
        name: "[TEST-TEMP] D58 #{System.unique_integer([:positive])}"
      })

    Enum.reduce(depts, user, &AccountsFixtures.add_membership(&2, &1, "employee"))
  end

  defp set_active(actor, target, active),
    do: call(actor, :patch, "/api/users/#{target.id}", %{active: active})

  describe "S7 list and Add department" do
    test "breweryMgr sees everyone; bartender1 is read-only with Add department (Brewery)",
         %{p: p} do
      conn = call(p["breweryMgr"], :get, "/api/users")
      assert conn.status == 200

      ids = conn |> body() |> Map.fetch!("data") |> Enum.map(& &1["id"]) |> MapSet.new()
      assert ids == p |> Map.values() |> MapSet.new(& &1.id)

      assert %{
               "can_edit" => false,
               "can_deactivate" => false,
               "addable_departments" => [%{"key" => "brewery", "name" => _}]
             } = bt = row(conn, p["bartender1"])

      assert keys(bt) == ["bar"]

      assert %{"can_edit" => true, "addable_departments" => []} = row(conn, p["brewer1"])
    end

    test "breweryMgr adds Brewery to bartender1, who keeps Taproom", %{p: p} do
      conn =
        call(p["breweryMgr"], :put, "/api/users/#{p["bartender1"].id}/memberships", %{
          memberships: [%{department: "brewery", role: "employee"}]
        })

      assert conn.status == 200
      assert dept_keys(p["bartender1"]) == ["bar", "brewery"]
      # D58 lead decisions 1: the Taproom isn't theirs, so still read-only.
      assert %{"can_edit" => false} = body(conn)["data"]
    end

    test "an empty membership PUT on someone not managed removes nothing", %{p: p} do
      conn =
        call(p["breweryMgr"], :put, "/api/users/#{p["ownersAsst"].id}/memberships", %{
          memberships: []
        })

      assert conn.status == 200
      assert dept_keys(p["ownersAsst"]) == ["office", "owners"]
      assert keys(body(conn)["data"]) == ["office"]
    end

    test "Add department only offers departments the manager manages", %{p: p} do
      conn =
        call(p["breweryMgr"], :put, "/api/users/#{p["bartender1"].id}/memberships", %{
          memberships: [%{department: "office", role: "employee"}]
        })

      assert conn.status == 403
      assert dept_keys(p["bartender1"]) == ["bar"]

      conn = call(p["dualMgr"], :get, "/api/users")

      assert row(conn, p["brewer1"])["addable_departments"] |> Enum.map(& &1["key"]) ==
               ~w(bar office)
    end

    test "an owner can edit and deactivate anyone; addable is every assignable department they're not in",
         %{p: p} do
      conn = call(p["owner"], :get, "/api/users")

      assert %{"can_edit" => true, "can_deactivate" => true, "addable_departments" => addable} =
               bt = row(conn, p["bartender1"])

      refute "bar" in Enum.map(addable, & &1["key"])
      assert "owners" in Enum.map(addable, & &1["key"])
      assert keys(bt) == ["bar"]
      assert keys(row(conn, p["ownersAsst"])) == ["office", "owners"]
    end

    test "employees still can't list users", %{p: p} do
      assert status(p["bartender1"], :get, "/api/users") == 403
    end
  end

  describe "S8 deactivate needs every department managed" do
    test "breweryMgr can't deactivate floater (Taproom + Brewery)", %{p: p} do
      conn = call(p["breweryMgr"], :get, "/api/users")
      # D58 lead decisions 1: not every department, so no other change either.
      assert %{"can_edit" => false, "can_deactivate" => false} = row(conn, p["floater"])

      conn = set_active(p["breweryMgr"], p["floater"], false)
      assert conn.status == 403
      assert body(conn)["error"] =~ "only in your departments"
      assert reload(p["floater"]).active

      # D58 lead decisions 1
      assert status(p["breweryMgr"], :patch, "/api/users/#{p["floater"].id}", %{
               name: "Jordan Float",
               active: true
             }) == 403

      # Their role in the Brewery is still breweryMgr's to change.
      assert status(p["breweryMgr"], :put, "/api/users/#{p["floater"].id}/memberships", %{
               memberships: [%{department: "brewery", role: "manager"}]
             }) == 200
    end

    test "breweryMgr deactivates and reactivates brewer1 (Brewery only)", %{p: p} do
      assert set_active(p["breweryMgr"], p["brewer1"], false).status == 200
      refute reload(p["brewer1"]).active
      assert set_active(p["breweryMgr"], p["brewer1"], true).status == 200
      assert reload(p["brewer1"]).active
    end
  end

  describe "S9 dualMgr manages every department" do
    test "deactivates and reactivates a [TEST-TEMP] person in Taproom + Office", %{p: p} do
      person = temp_person(~w(bar office))
      conn = call(p["dualMgr"], :get, "/api/users")
      assert %{"can_deactivate" => true} = row(conn, person)

      assert set_active(p["dualMgr"], person, false).status == 200
      refute reload(person).active
      assert set_active(p["dualMgr"], person, true).status == 200
      assert reload(person).active
    end

    test "barMgr can't deactivate the same person (Office not theirs)", %{p: p} do
      person = temp_person(~w(bar office))
      assert set_active(p["barMgr"], person, false).status == 403
      assert reload(person).active
    end
  end

  describe "S10 a person with no department" do
    test "barMgr deactivates and reactivates noDept, and edits them", %{p: p} do
      conn = call(p["barMgr"], :get, "/api/users")

      # D58 lead decisions 1: no department, so any manager edits them too.
      assert %{"can_edit" => true, "can_deactivate" => true} = row(conn, p["noDept"])

      assert set_active(p["barMgr"], p["noDept"], false).status == 200
      refute reload(p["noDept"]).active
      assert set_active(p["barMgr"], p["noDept"], true).status == 200
      assert reload(p["noDept"]).active

      # D58 lead decisions 1
      assert status(p["barMgr"], :patch, "/api/users/#{p["noDept"].id}", %{name: "Renamed"}) ==
               200

      assert reload(p["noDept"]).name == "Renamed"
    end

    test "no manager deactivates an owner, even one with no department", %{p: p} do
      conn = call(p["barMgr"], :get, "/api/users")
      assert %{"can_deactivate" => false} = row(conn, p["owner2"])
      assert set_active(p["barMgr"], p["owner2"], false).status == 403
      assert reload(p["owner2"]).active
    end

    test "employees can't deactivate anyone", %{p: p} do
      conn = set_active(p["bartender1"], p["noDept"], false)
      assert conn.status == 403
      assert body(conn)["error"] == "Forbidden"
    end

    test "owners still deactivate anyone, with the last-owner guard", %{p: p} do
      assert set_active(p["owner"], p["floater"], false).status == 200
      assert set_active(p["owner"], p["owner2"], false).status == 200
      assert set_active(p["owner"], p["owner"], false).status == 422
    end
  end

  describe "S11 dualMgr on ownersAsst (Office + Owners)" do
    # D58 lead decisions 1: nobody manages Owners, so dualMgr changes only
    # ownersAsst's Office role; details, password and Active are refused,
    # and Owners doesn't show.
    test "the Office role only; Owners hidden; details and Deactivate refused", %{p: p} do
      conn = call(p["dualMgr"], :get, "/api/users")

      assert %{"can_edit" => false, "can_deactivate" => false} = asst = row(conn, p["ownersAsst"])
      assert keys(asst) == ["office"]

      assert status(p["dualMgr"], :patch, "/api/users/#{p["ownersAsst"].id}", %{name: "Ellis A."}) ==
               403

      conn =
        call(p["dualMgr"], :put, "/api/users/#{p["ownersAsst"].id}/memberships", %{
          memberships: [%{department: "office", role: "manager"}]
        })

      assert conn.status == 200
      assert keys(body(conn)["data"]) == ["office"]
      assert dept_keys(p["ownersAsst"]) == ["office", "owners"]

      assert set_active(p["dualMgr"], p["ownersAsst"], false).status == 403
      assert reload(p["ownersAsst"]).active
    end
  end

  describe "S12 breweryMgr on ownersAsst (not managed)" do
    test "no Owners in any response", %{p: p} do
      id = p["ownersAsst"].id
      mgr = p["breweryMgr"]

      list = call(mgr, :get, "/api/users")
      assert keys(row(list, p["ownersAsst"])) == ["office"]

      replies = [
        list,
        call(mgr, :put, "/api/users/#{id}/memberships", %{memberships: []}),
        call(mgr, :patch, "/api/users/#{id}", %{name: "X"}),
        call(mgr, :patch, "/api/users/#{id}", %{active: false}),
        call(mgr, :post, "/api/users/#{id}/reset_password"),
        call(mgr, :get, "/api/users/#{id}/staff_code"),
        call(mgr, :put, "/api/users/#{id}/staff_code", %{code: "4826"}),
        call(mgr, :delete, "/api/users/#{id}/staff_code")
      ]

      # The department's key or name (not `owners_only`, nor the persona's email).
      for conn <- replies, do: refute(conn.resp_body =~ ~r/"owners"|"Owners"/, conn.resp_body)
    end

    # D58 lead decisions 1 (gap 7): Add department doesn't make the row
    # managed, so Owners stays hidden.
    test "after Add department the row is still read-only and Owners stays hidden", %{p: p} do
      conn =
        call(p["breweryMgr"], :put, "/api/users/#{p["ownersAsst"].id}/memberships", %{
          memberships: [%{department: "brewery", role: "employee"}]
        })

      assert %{"can_edit" => false} = data = body(conn)["data"]
      assert keys(data) == ["brewery", "office"]
    end
  end

  describe "S13 read-only rows refuse every other write" do
    test "breweryMgr on bartender1: name, email, schedulable, password, staff code, roles → 403",
         %{p: p} do
      id = p["bartender1"].id
      mgr = p["breweryMgr"]

      for params <- [%{name: "X"}, %{email: "x@rockcut-test.com"}, %{schedulable: false}] do
        assert status(mgr, :patch, "/api/users/#{id}", params) == 403, inspect(params)
      end

      assert status(mgr, :post, "/api/users/#{id}/reset_password") == 403
      assert status(mgr, :get, "/api/users/#{id}/staff_code") == 403
      assert status(mgr, :put, "/api/users/#{id}/staff_code", %{code: "4826"}) == 403
      assert status(mgr, :delete, "/api/users/#{id}/staff_code") == 403

      assert status(mgr, :put, "/api/users/#{id}/memberships", %{
               memberships: [%{department: "bar", role: "manager"}]
             }) == 403

      u = reload(p["bartender1"])
      assert {u.name, u.schedulable, dept_keys(u)} == {"Sam Pour", true, ["bar"]}
    end

    test "barMgr can still edit and reset bartender1", %{p: p} do
      id = p["bartender1"].id
      assert status(p["barMgr"], :patch, "/api/users/#{id}", %{name: "Sam P."}) == 200
      assert status(p["barMgr"], :post, "/api/users/#{id}/reset_password") == 200
    end
  end

  describe "D58 lead decisions 1 (gaps 12, 13): Add department doesn't open the account" do
    defp refuses_account_writes(mgr, target) do
      id = target.id

      for params <- [%{name: "X"}, %{email: "x@rockcut-test.com"}, %{schedulable: false}] do
        assert status(mgr, :patch, "/api/users/#{id}", params) == 403, inspect(params)
      end

      assert status(mgr, :post, "/api/users/#{id}/reset_password") == 403
      assert status(mgr, :get, "/api/users/#{id}/staff_code") == 403
      assert status(mgr, :put, "/api/users/#{id}/staff_code", %{code: "4826"}) == 403
      assert status(mgr, :delete, "/api/users/#{id}/staff_code") == 403
    end

    defp add_brewery(mgr, target) do
      conn =
        call(mgr, :put, "/api/users/#{target.id}/memberships", %{
          memberships: [%{department: "brewery", role: "employee"}]
        })

      assert conn.status == 200
      body(conn)["data"]
    end

    test "an owner: Add department, then details, staff code and reset → 403", %{p: p} do
      owner = AccountsFixtures.owner_fixture(%{name: "[TEST-TEMP] D58 owner"})
      mgr = p["breweryMgr"]

      conn = call(mgr, :get, "/api/users")
      assert %{"can_edit" => false} = row(conn, owner)

      assert %{"can_edit" => false} = add_brewery(mgr, owner)
      refuses_account_writes(mgr, owner)

      u = reload(owner)
      assert {u.name, u.is_owner, u.staff_code_digest} == {"[TEST-TEMP] D58 owner", true, nil}
    end

    test "an Office + Owners person: Add department, then details, staff code and reset → 403",
         %{p: p} do
      person = temp_person(~w(office owners))
      mgr = p["breweryMgr"]

      assert %{"can_edit" => false} = data = add_brewery(mgr, person)
      assert keys(data) == ["brewery", "office"]
      refuses_account_writes(mgr, person)
      assert reload(person).name == person.name
    end

    test "a person the manager fully manages still works", %{p: p} do
      person = temp_person(~w(brewery))
      mgr = p["breweryMgr"]
      id = person.id

      conn = call(mgr, :get, "/api/users")
      assert %{"can_edit" => true, "can_deactivate" => true} = row(conn, person)

      assert status(mgr, :patch, "/api/users/#{id}", %{name: "[TEST-TEMP] Renamed"}) == 200
      assert status(mgr, :post, "/api/users/#{id}/reset_password") == 200
      assert status(mgr, :put, "/api/users/#{id}/staff_code", %{code: "4826"}) == 200
      assert status(mgr, :get, "/api/users/#{id}/staff_code") == 200
      assert status(mgr, :delete, "/api/users/#{id}/staff_code") == 200
    end
  end

  describe "S14 positions stop at a manager's departments" do
    setup %{d: d} do
      %{
        office: position_fixture(%{department: d["office"]}),
        brewery: position_fixture(%{department: d["brewery"]})
      }
    end

    test "breweryMgr can't create, rename or delete an Office position", %{
      p: p,
      d: d,
      office: pos
    } do
      mgr = p["breweryMgr"]

      assert status(mgr, :post, "/api/positions", %{name: "Clerk", department_id: d["office"].id}) ==
               403

      assert status(mgr, :patch, "/api/positions/#{pos.id}", %{name: "Renamed"}) == 403
      assert status(mgr, :patch, "/api/positions/#{pos.id}", %{active: false}) == 403
      assert status(mgr, :delete, "/api/positions/#{pos.id}") == 403
    end

    test "breweryMgr's Brewery positions still work", %{p: p, d: d, brewery: pos} do
      mgr = p["breweryMgr"]

      assert status(mgr, :post, "/api/positions", %{
               name: "Cellar",
               department_id: d["brewery"].id
             }) == 201

      assert status(mgr, :patch, "/api/positions/#{pos.id}", %{
               name: "Head brewer",
               color_shade: 0.3
             }) == 200

      assert status(mgr, :delete, "/api/positions/#{pos.id}") == 200
    end

    test "moving a position needs both departments", %{
      p: p,
      d: d,
      brewery: brewery,
      office: office
    } do
      assert status(p["breweryMgr"], :patch, "/api/positions/#{brewery.id}", %{
               department_id: d["office"].id
             }) == 403

      assert status(p["breweryMgr"], :patch, "/api/positions/#{office.id}", %{
               department_id: d["brewery"].id
             }) == 403

      assert status(p["dualMgr"], :patch, "/api/positions/#{office.id}", %{
               department_id: d["bar"].id
             }) == 200

      assert status(p["owner"], :patch, "/api/positions/#{brewery.id}", %{
               department_id: d["office"].id
             }) == 200
    end

    test "dualMgr writes Office positions; owners write anywhere", %{
      p: p,
      office: office,
      brewery: brewery
    } do
      assert status(p["dualMgr"], :patch, "/api/positions/#{office.id}", %{color_shade: 0.5}) ==
               200

      assert status(p["dualMgr"], :patch, "/api/positions/#{brewery.id}", %{color_shade: 0.5}) ==
               403

      assert status(p["owner"], :patch, "/api/positions/#{brewery.id}", %{color_shade: 0.5}) ==
               200
    end

    test "shift templates follow their position, and a change of position needs both",
         %{p: p, brewery: brewery, office: office} do
      hours = %{name: "Early", start_time: "07:00:00", end_time: "15:00:00"}

      assert status(
               p["breweryMgr"],
               :post,
               "/api/shift_templates",
               Map.put(hours, :position_id, office.id)
             ) == 403

      conn =
        call(
          p["breweryMgr"],
          :post,
          "/api/shift_templates",
          Map.put(hours, :position_id, brewery.id)
        )

      assert conn.status == 201
      id = body(conn)["data"]["id"]

      assert status(p["breweryMgr"], :patch, "/api/shift_templates/#{id}", %{
               position_id: office.id
             }) == 403

      assert status(p["dualMgr"], :patch, "/api/shift_templates/#{id}", %{name: "X"}) == 403
      assert status(p["dualMgr"], :delete, "/api/shift_templates/#{id}") == 403

      assert status(p["breweryMgr"], :patch, "/api/shift_templates/#{id}", %{name: "Brew day"}) ==
               200

      assert status(p["breweryMgr"], :delete, "/api/shift_templates/#{id}") == 200
    end

    test "a shift template on an unknown position is still a 422", %{p: p} do
      assert status(p["breweryMgr"], :post, "/api/shift_templates", %{
               position_id: 999_999,
               name: "X",
               start_time: "07:00:00",
               end_time: "15:00:00"
             }) == 422
    end

    test "schedule templates need every position's department managed",
         %{p: p, brewery: brewery, office: office} do
      item = fn pos ->
        %{position_id: pos.id, day_index: 0, start_time: "07:00:00", end_time: "15:00:00"}
      end

      mixed = %{name: "Mixed", kind: "week", items: [item.(brewery), item.(office)]}

      assert status(p["breweryMgr"], :post, "/api/schedule_templates", mixed) == 403
      assert status(p["dualMgr"], :post, "/api/schedule_templates", mixed) == 403

      conn = call(p["owner"], :post, "/api/schedule_templates", mixed)
      assert conn.status == 201
      id = body(conn)["data"]["id"]
      assert status(p["breweryMgr"], :delete, "/api/schedule_templates/#{id}") == 403

      conn =
        call(p["breweryMgr"], :post, "/api/schedule_templates", %{mixed | items: [item.(brewery)]})

      assert conn.status == 201

      assert status(
               p["breweryMgr"],
               :delete,
               "/api/schedule_templates/#{body(conn)["data"]["id"]}"
             ) == 200

      # Nothing on it: any manager, as before.
      assert status(p["barMgr"], :post, "/api/schedule_templates", %{
               name: "Empty",
               kind: "day",
               items: []
             }) == 201
    end
  end

  test "Accounts.user_access/2 hides Owners from managers", %{p: p} do
    asst = reload(p["ownersAsst"])
    owners_id = Enum.find(asst.memberships, & &1.department.owners_only).department_id

    assert Accounts.user_access(p["breweryMgr"], asst).hidden_department_ids == [owners_id]
    # D58 lead decisions 1: dualMgr no longer manages the whole row.
    assert Accounts.user_access(p["dualMgr"], asst).hidden_department_ids == [owners_id]
    assert Accounts.user_access(p["owner"], asst).hidden_department_ids == []
  end
end
