defmodule RockcutApi.AuthzSchedulingTest do
  use RockcutApi.DataCase

  alias RockcutApi.Authz
  alias RockcutApi.Scheduling.{Shift, Position}
  import RockcutApi.AccountsFixtures

  describe "shift authorization" do
    setup do
      %{bar: department_fixture("bar")}
    end

    test "published shift is readable by anyone; drafts only by their manager/owner", %{bar: bar} do
      owner = owner_fixture()
      bar_mgr = user_with_role("manager", "bar")
      bar_emp = user_with_role("employee", "bar")
      sales_emp = user_with_role("employee", "sales")
      published = %Shift{department_id: bar.id, status: "published"}
      draft = %Shift{department_id: bar.id, status: "draft"}

      for u <- [owner, bar_mgr, bar_emp, sales_emp], do: assert(Authz.can?(u, :read, published))
      assert Authz.can?(owner, :read, draft)
      assert Authz.can?(bar_mgr, :read, draft)
      refute Authz.can?(bar_emp, :read, draft)
      refute Authz.can?(sales_emp, :read, draft)
    end

    test "only manager/owner may create, edit, publish", %{bar: bar} do
      bar_mgr = user_with_role("manager", "bar")
      bar_emp = user_with_role("employee", "bar")
      shift = %Shift{department_id: bar.id, status: "draft"}

      for verb <- [:create, :update, :assign, :delete, :publish] do
        assert Authz.can?(bar_mgr, verb, shift)
        refute Authz.can?(bar_emp, verb, shift)
      end
    end

    test "claim only for a department employee on an open published shift", %{bar: bar} do
      bar_emp = user_with_role("employee", "bar")
      sales_emp = user_with_role("employee", "sales")
      open_published = %Shift{department_id: bar.id, status: "published", assignee_id: nil}
      assigned = %Shift{department_id: bar.id, status: "published", assignee_id: 999}
      open_draft = %Shift{department_id: bar.id, status: "draft", assignee_id: nil}

      assert Authz.can?(bar_emp, :claim, open_published)
      refute Authz.can?(bar_emp, :claim, assigned)
      refute Authz.can?(bar_emp, :claim, open_draft)
      refute Authz.can?(sales_emp, :claim, open_published)
    end
  end

  describe "position authorization" do
    test "employees read; any manager or owner writes" do
      owner = owner_fixture()
      manager = user_with_role("manager", "bar")
      employee = user_with_role("employee", "bar")
      pos = %Position{}

      assert Authz.can?(employee, :read, pos)
      assert Authz.can?(manager, :create, pos)
      assert Authz.can?(owner, :delete, pos)
      refute Authz.can?(employee, :create, pos)
      refute Authz.can?(employee, :delete, pos)
    end
  end
end
