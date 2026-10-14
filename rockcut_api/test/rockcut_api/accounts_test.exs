defmodule RockcutApi.AccountsTest do
  use RockcutApi.DataCase

  alias RockcutApi.Accounts
  import RockcutApi.AccountsFixtures

  describe "get_user_by_email_and_password/2" do
    test "returns the user with correct credentials" do
      user = user_fixture(%{email: "brewer@rockcut.com", password: "secret-pass"})

      assert %{id: id} =
               Accounts.get_user_by_email_and_password("brewer@rockcut.com", "secret-pass")

      assert id == user.id
    end

    test "is case-insensitive on email" do
      user = user_fixture(%{email: "Brewer@Rockcut.com", password: "secret-pass"})

      assert %{id: id} =
               Accounts.get_user_by_email_and_password("brewer@rockcut.com", "secret-pass")

      assert id == user.id
    end

    test "returns nil on wrong password" do
      user_fixture(%{email: "brewer@rockcut.com", password: "secret-pass"})
      refute Accounts.get_user_by_email_and_password("brewer@rockcut.com", "wrong")
    end

    test "returns nil for unknown email (constant-time path)" do
      refute Accounts.get_user_by_email_and_password("nobody@rockcut.com", "whatever")
    end
  end

  describe "email uniqueness (COLLATE NOCASE)" do
    test "rejects a duplicate email differing only by case" do
      user_fixture(%{email: "dup@rockcut.com"})

      assert {:error, changeset} =
               %RockcutApi.Accounts.User{}
               |> RockcutApi.Accounts.User.registration_changeset(%{
                 email: "DUP@rockcut.com",
                 password: "password123"
               })
               |> RockcutApi.Repo.insert()

      assert %{email: ["has already been taken"]} = errors_on(changeset)
    end
  end

  describe "get_user!/1" do
    test "preloads memberships and departments" do
      user = user_with_role("manager", "brewery")
      loaded = Accounts.get_user!(user.id)
      assert [membership] = loaded.memberships
      assert membership.department.key == "brewery"
    end
  end

  describe "list_departments/0" do
    test "returns seeded departments" do
      department_fixture("brewery")
      department_fixture("sales")
      keys = Accounts.list_departments() |> Enum.map(& &1.key)
      assert "brewery" in keys
      assert "sales" in keys
    end
  end

  describe "leaving the Brewery (D38 S49)" do
    alias RockcutApi.Tasks
    alias RockcutApi.Authz
    alias RockcutApi.Tasks.{DailyCheck, Event, Task}

    setup do
      mgr = user_with_role("manager", "brewery")
      brewer2 = user_with_role("employee", "brewery") |> add_membership("bar", "employee")
      today = ~D[2026-10-14]

      {:ok, open} =
        Tasks.create(%{title: "Open", due_on: today, assignee_id: brewer2.id}, mgr)

      {:ok, done} =
        Tasks.create(%{title: "Done", due_on: today, assignee_id: brewer2.id}, mgr)

      {:ok, _} = Tasks.complete(done, nil, brewer2, today)
      [item | _] = Tasks.list_items()
      {:ok, _} = Tasks.tick(today, item, brewer2, today)

      %{mgr: mgr, brewer2: brewer2, open: open, done: done}
    end

    test "removing someone from the Brewery unassigns open tasks only", ctx do
      assert {:ok, _} =
               Accounts.set_memberships(ctx.brewer2, [], ctx.mgr)

      # The manager touches only the Brewery; the Taproom membership stays.
      assert Authz.member_of?(Accounts.get_user!(ctx.brewer2.id), "bar")
      assert Repo.get!(Task, ctx.open.id).assignee_id == nil
      done = Repo.get!(Task, ctx.done.id)
      assert {done.assignee_id, done.completed_by_id} == {ctx.brewer2.id, ctx.brewer2.id}
      assert [%DailyCheck{completed_by_id: id}] = Repo.all(DailyCheck)
      assert id == ctx.brewer2.id

      assert [%Event{actor_id: actor_id, detail: detail}] =
               Repo.all(from e in Event, where: e.action == "unassigned")

      assert actor_id == ctx.mgr.id
      assert detail == %{"from" => ctx.brewer2.id, "to" => nil, "reason" => "left_brewery"}
    end

    test "deactivating someone unassigns their open tasks", ctx do
      owner = owner_fixture()
      assert {:ok, _} = Accounts.update_user(ctx.brewer2, %{"active" => false}, owner)
      assert Repo.get!(Task, ctx.open.id).assignee_id == nil
      assert Repo.get!(Task, ctx.done.id).assignee_id == ctx.brewer2.id
    end

    test "a change that keeps them in the Brewery leaves their tasks", ctx do
      assert {:ok, _} =
               Accounts.set_memberships(
                 ctx.brewer2,
                 [%{"department" => "brewery", "role" => "manager"}],
                 owner_fixture()
               )

      assert Repo.get!(Task, ctx.open.id).assignee_id == ctx.brewer2.id
      assert Repo.all(from e in Event, where: e.action == "unassigned") == []
    end
  end
end
