defmodule RockcutApi.Accounts.DeactivateShiftsTest do
  @moduledoc """
  D58 lead decisions 1 (DEV QA gap 9): deactivating a person, by an owner or
  a manager, takes them off every shift that starts after now. Drafts stay
  drafts; published ones become open shifts, with the open-shift
  notification. One change-log entry with the count. Past shifts keep them;
  reactivating gives nothing back.
  """
  use RockcutApiWeb.ConnCase

  import RockcutApi.PersonaFixtures
  import RockcutApi.SchedulingFixtures
  import Ecto.Query

  alias RockcutApi.{Accounts, AccountsFixtures, Notifications, Repo}
  alias RockcutApi.Accounts.AuditEntry
  alias RockcutApi.Scheduling.Shift

  setup do
    p = personas()
    d = departments()

    person =
      AccountsFixtures.user_fixture(%{name: "[TEST-TEMP] D58 leaving"})
      |> AccountsFixtures.add_membership("bar", "employee")

    now = DateTime.utc_now() |> DateTime.truncate(:second)
    at = fn hours -> DateTime.add(now, hours * 3600) end

    shift = fn status, from ->
      shift_fixture(%{
        department: d["bar"],
        assignee_id: person.id,
        status: status,
        starts_at: at.(from),
        ends_at: at.(from + 4)
      })
    end

    %{
      p: p,
      person: person,
      draft: shift.("draft", 24),
      published: shift.("published", 48),
      past: shift.("published", -48),
      started: shift.("published", -1)
    }
  end

  defp shift_now(%Shift{id: id}), do: Repo.get!(Shift, id)

  defp entries(person),
    do:
      Repo.all(
        from a in AuditEntry,
          where: a.target_id == ^person.id and a.action == "user.shifts_unassigned"
      )

  test "a manager's deactivate: future shifts lose their assignee; drafts stay drafts, published become open",
       ctx do
    bartender = ctx.p["bartender2"]
    Notifications.list(bartender)

    assert call(ctx.p["barMgr"], :get, "/api/users/#{ctx.person.id}/future_shifts")
           |> json_response(200) == %{"data" => %{"count" => 2}}

    assert call(ctx.p["barMgr"], :patch, "/api/users/#{ctx.person.id}", %{active: false})
           |> json_response(200)

    assert %{assignee_id: nil, status: "draft"} = shift_now(ctx.draft)
    assert %{assignee_id: nil, status: "published"} = shift_now(ctx.published)
    # Past and already started shifts keep them.
    assert shift_now(ctx.past).assignee_id == ctx.person.id
    assert shift_now(ctx.started).assignee_id == ctx.person.id

    assert [%{actor_id: actor_id, detail: %{"count" => 2}}] = entries(ctx.person)
    assert actor_id == ctx.p["barMgr"].id

    # The Taproom hears about the open shift, as when one is published.
    assert "open_shift" in Enum.map(Notifications.list(bartender), & &1.event)
  end

  test "an owner's deactivate does the same; reactivating gives nothing back", ctx do
    assert {:ok, _} = Accounts.update_user(ctx.person, %{"active" => false}, ctx.p["owner"])
    assert shift_now(ctx.published).assignee_id == nil
    assert [%{detail: %{"count" => 2}}] = entries(ctx.person)

    person = Accounts.get_user!(ctx.person.id)
    assert {:ok, _} = Accounts.update_user(person, %{"active" => true}, ctx.p["owner"])
    assert shift_now(ctx.published).assignee_id == nil
    assert shift_now(ctx.draft).assignee_id == nil
    assert length(entries(ctx.person)) == 1
  end

  test "no future shifts: no change-log entry", ctx do
    Repo.delete!(ctx.draft)
    Repo.delete!(ctx.published)
    assert {:ok, _} = Accounts.update_user(ctx.person, %{"active" => false}, ctx.p["owner"])
    assert entries(ctx.person) == []
    assert shift_now(ctx.past).assignee_id == ctx.person.id
  end

  test "another change leaves the shifts alone", ctx do
    assert {:ok, _} = Accounts.update_user(ctx.person, %{"name" => "Renamed"}, ctx.p["owner"])
    assert shift_now(ctx.published).assignee_id == ctx.person.id
    assert entries(ctx.person) == []
  end

  test "a refused deactivate changes nothing", ctx do
    assert call(ctx.p["breweryMgr"], :patch, "/api/users/#{ctx.person.id}", %{active: false})
           |> json_response(403)

    assert shift_now(ctx.published).assignee_id == ctx.person.id
  end

  test "the count is for whoever may deactivate the person", ctx do
    assert call(ctx.p["breweryMgr"], :get, "/api/users/#{ctx.person.id}/future_shifts")
           |> json_response(403)

    assert call(ctx.p["bartender1"], :get, "/api/users/#{ctx.person.id}/future_shifts")
           |> json_response(403)

    assert call(ctx.p["owner"], :get, "/api/users/999999/future_shifts") |> json_response(404)
  end
end
