defmodule RockcutApiWeb.OwnersMembershipTest do
  @moduledoc """
  D59 §4.3: who can join the Owners department, and as what. Only owners add
  or remove members; nobody is a manager of it, owners included.
  """
  use RockcutApiWeb.ConnCase

  import Ecto.Query, only: [from: 2]
  import RockcutApi.PersonaFixtures

  alias RockcutApi.{Accounts, Authz, Repo}
  alias RockcutApi.Accounts.{AuditEntry, Membership}

  setup do
    %{p: personas(), d: departments()}
  end

  defp put_memberships(actor, target, memberships),
    do: call(actor, :put, "/api/users/#{target.id}/memberships", %{"memberships" => memberships})

  defp roles(user) do
    user
    |> reload()
    |> Map.fetch!(:memberships)
    |> Map.new(&{&1.department.key, &1.role})
  end

  defp audit(target, action) do
    Repo.all(
      from(a in AuditEntry,
        where: a.target_id == ^target.id and a.action == ^action,
        select: a.detail
      )
    )
  end

  describe "no managers in Owners (422)" do
    test "an owner asking for manager in Owners is refused, nothing changed", %{p: p} do
      before = roles(p["ownersAsst"])

      conn =
        put_memberships(p["owner"], p["ownersAsst"], [
          %{"department" => "office", "role" => "employee"},
          %{"department" => "owners", "role" => "manager"}
        ])

      assert json_response(conn, 422) == %{
               "errors" => %{"memberships" => ["Owners has no managers"]}
             }

      assert roles(p["ownersAsst"]) == before
    end

    test "an owner creating someone as an Owners manager is refused, no user made", %{p: p} do
      conn =
        call(p["owner"], :post, "/api/users", %{
          "email" => "owners.mgr@rockcut-test.com",
          "name" => "Would Manage",
          "memberships" => [%{"department" => "owners", "role" => "manager"}]
        })

      assert json_response(conn, 422)["errors"]["memberships"] == ["Owners has no managers"]
      refute Accounts.get_user_by_email("owners.mgr@rockcut-test.com")
    end

    test "the message names the department, not a fixed word", %{p: p, d: d} do
      d["owners"] |> Ecto.Changeset.change(name: "Partners") |> Repo.update!()

      conn =
        put_memberships(p["owner"], p["office1"], [
          %{"department" => "owners", "role" => "manager"}
        ])

      assert json_response(conn, 422)["errors"]["memberships"] == ["Partners has no managers"]
    end

    test "Membership.changeset refuses manager in Owners, insert or update", %{p: p, d: d} do
      cs =
        Membership.changeset(%Membership{}, %{
          user_id: p["office1"].id,
          department_id: d["owners"].id,
          role: "manager"
        })

      assert {"Owners has no managers", _} = cs.errors[:role]

      m = Repo.get_by!(Membership, user_id: p["ownersAsst"].id, department_id: d["owners"].id)

      assert {"Owners has no managers", _} =
               Membership.changeset(m, %{role: "manager"}).errors[:role]
    end

    test "Membership.changeset allows employee in Owners and manager elsewhere", %{p: p, d: d} do
      assert Membership.changeset(%Membership{}, %{
               user_id: p["office1"].id,
               department_id: d["owners"].id,
               role: "employee"
             }).valid?

      assert Membership.changeset(%Membership{}, %{
               user_id: p["office1"].id,
               department_id: d["office"].id,
               role: "manager"
             }).valid?
    end
  end

  describe "owners add and remove Owners members" do
    test "an owner adds office1 to Owners as employee, then removes it, both audited",
         %{p: p, d: d} do
      conn =
        put_memberships(p["owner"], p["office1"], [
          %{"department" => "office", "role" => "employee"},
          %{"department" => "owners", "role" => "employee"}
        ])

      assert json_response(conn, 200)
      assert roles(p["office1"]) == %{"office" => "employee", "owners" => "employee"}

      assert %{"department_id" => d["owners"].id, "role" => "employee"} in audit(
               p["office1"],
               "membership.added"
             )

      conn =
        put_memberships(p["owner"], p["office1"], [
          %{"department" => "office", "role" => "employee"}
        ])

      assert json_response(conn, 200)
      assert roles(p["office1"]) == %{"office" => "employee"}

      assert %{"department_id" => d["owners"].id, "role" => "employee"} in audit(
               p["office1"],
               "membership.removed"
             )
    end

    test "an owner creates someone straight into Owners", %{p: p} do
      conn =
        call(p["owner"], :post, "/api/users", %{
          "email" => "owners.new@rockcut-test.com",
          "name" => "New Assist",
          "memberships" => [%{"department" => "owners", "role" => "employee"}]
        })

      assert json_response(conn, 201)
      user = Accounts.get_user_by_email("owners.new@rockcut-test.com")
      assert Authz.role_in(Accounts.get_user!(user.id), "owners") == :employee
    end
  end

  describe "managers can't touch Owners (403, all or nothing)" do
    test "dualMgr adding themselves to Owners → 403, nothing changed", %{p: p} do
      before = roles(p["dualMgr"])

      conn =
        put_memberships(p["dualMgr"], p["dualMgr"], [
          %{"department" => "bar", "role" => "manager"},
          %{"department" => "office", "role" => "manager"},
          %{"department" => "owners", "role" => "employee"}
        ])

      assert json_response(conn, 403) == %{"error" => "You can't assign roles in that department"}
      assert roles(p["dualMgr"]) == before
    end

    test "a request that also changes a managed department applies nothing", %{p: p} do
      # office1: Office employee. Promote in Office (allowed alone) + add Owners.
      conn =
        put_memberships(p["dualMgr"], p["office1"], [
          %{"department" => "office", "role" => "manager"},
          %{"department" => "bar", "role" => "employee"},
          %{"department" => "owners", "role" => "employee"}
        ])

      assert json_response(conn, 403)
      assert roles(p["office1"]) == %{"office" => "employee"}
    end

    test "the same request without Owners is allowed", %{p: p} do
      conn =
        put_memberships(p["dualMgr"], p["office1"], [
          %{"department" => "office", "role" => "manager"},
          %{"department" => "bar", "role" => "employee"}
        ])

      assert json_response(conn, 200)
      assert roles(p["office1"]) == %{"office" => "manager", "bar" => "employee"}
    end

    test "dualMgr creating someone in Owners (with Office) → 403, no user made", %{p: p} do
      conn =
        call(p["dualMgr"], :post, "/api/users", %{
          "email" => "sneaky@rockcut-test.com",
          "name" => "Sneaky",
          "memberships" => [
            %{"department" => "office", "role" => "employee"},
            %{"department" => "owners", "role" => "employee"}
          ]
        })

      assert json_response(conn, 403) == %{"error" => "You can't assign roles in that department"}
      refute Accounts.get_user_by_email("sneaky@rockcut-test.com")
    end

    # D59 gap 9: permission before role, so the manager role in Owners gets the
    # same neutral 403 as the employee role and never names the department.
    for actor <- ["breweryMgr", "dualMgr"] do
      test "#{actor} asking for manager in Owners alone → neutral 403, nothing changed",
           %{p: p} do
        target = if unquote(actor) == "breweryMgr", do: p["brewer1"], else: p["office1"]
        before = roles(target)

        conn =
          put_memberships(p[unquote(actor)], target, [
            %{"department" => "owners", "role" => "manager"}
          ])

        assert json_response(conn, 403) == %{
                 "error" => "You can't assign roles in that department"
               }

        assert roles(target) == before
      end

      test "#{actor} asking for manager in Owners with a managed department → neutral 403",
           %{p: p} do
        target = if unquote(actor) == "breweryMgr", do: p["brewer1"], else: p["office1"]
        own = if unquote(actor) == "breweryMgr", do: "brewery", else: "office"
        before = roles(target)

        conn =
          put_memberships(p[unquote(actor)], target, [
            %{"department" => own, "role" => "manager"},
            %{"department" => "owners", "role" => "manager"}
          ])

        assert json_response(conn, 403) == %{
                 "error" => "You can't assign roles in that department"
               }

        assert roles(target) == before
      end

      test "#{actor} creating someone as an Owners manager → neutral 403, no user made",
           %{p: p} do
        own = if unquote(actor) == "breweryMgr", do: "brewery", else: "office"
        email = "gap9.#{String.downcase(unquote(actor))}@rockcut-test.com"

        conn =
          call(p[unquote(actor)], :post, "/api/users", %{
            "email" => email,
            "name" => "Gap Nine",
            "memberships" => [
              %{"department" => own, "role" => "employee"},
              %{"department" => "owners", "role" => "manager"}
            ]
          })

        assert json_response(conn, 403) == %{
                 "error" => "You can't assign roles in that department"
               }

        refute Accounts.get_user_by_email(email)
      end
    end

    test "O6: dualMgr edits ownersAsst's Office role; the Owners membership stays", %{p: p} do
      conn =
        put_memberships(p["dualMgr"], p["ownersAsst"], [
          %{"department" => "office", "role" => "manager"}
        ])

      assert json_response(conn, 200)
      assert roles(p["ownersAsst"]) == %{"office" => "manager", "owners" => "employee"}
    end

    test "O6: dualMgr removes ownersAsst from Office; Owners stays", %{p: p} do
      assert json_response(put_memberships(p["dualMgr"], p["ownersAsst"], []), 200)
      assert roles(p["ownersAsst"]) == %{"owners" => "employee"}
    end
  end
end
