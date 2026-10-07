defmodule RockcutApi.AuthzDeviceTest do
  @moduledoc """
  D33 §3.7: every D29 decision (`stepwise_results/d29_rbac_capability_model_COMPLETE.md`,
  #1–#44) × `taproomDevice` → the expected allow or deny. UI-only decisions
  (#45–#48) are covered by the Playwright device specs. `#nn` in a test name
  is the D29 inventory number.

  This file pins the device allowlist. When roles become data (RBAC roadmap
  Phases 2–6) it must pass unchanged.
  """
  use RockcutApi.DataCase, async: false

  import Ecto.Query, only: [from: 2]

  import RockcutApi.PersonaFixtures
  import RockcutApi.SchedulingFixtures

  alias RockcutApi.{Accounts, Authz, Messaging, Scheduling}
  alias RockcutApi.Accounts.{Department, User}
  alias RockcutApi.Availability.Slot
  alias RockcutApi.Scheduling.{Position, ScheduleEvent, ShiftTemplate, ScheduleTemplate}
  alias RockcutApi.TimeOff.Request

  setup do
    p = personas(~w(owner barMgr bartender1))
    {device, _token} = taproom_device()
    depts = departments()
    %{p: p, d: Accounts.get_user!(device.id), depts: depts}
  end

  describe "schedule (#1–#7)" do
    test "#1 reads published shifts, not drafts", %{d: d, depts: depts} do
      assert Authz.can?(d, :read, shift_fixture(%{status: "published", department: depts["bar"]}))
      refute Authz.can?(d, :read, shift_fixture(%{status: "draft", department: depts["bar"]}))
    end

    test "#2 lists published shifts and events only", %{d: d, depts: depts} do
      pub = shift_fixture(%{status: "published", department: depts["bar"]})
      draft = shift_fixture(%{status: "draft", department: depts["bar"]})
      ids = Scheduling.list_shifts(d) |> Enum.map(& &1.id)
      assert pub.id in ids
      refute draft.id in ids

      pub_e = event_fixture(%{status: "published", department: depts["bar"]})
      draft_e = event_fixture(%{status: "draft", department: depts["bar"]})
      eids = Scheduling.list_events(d) |> Enum.map(& &1.id)
      assert pub_e.id in eids
      refute draft_e.id in eids
    end

    test "#3–#6 no shift writes", %{d: d, depts: depts} do
      s = shift_fixture(%{status: "published", department: depts["bar"]})

      for action <- [:create, :update, :assign, :delete, :publish, :unpublish],
          do: refute(Authz.can?(d, action, s), "#{action}")
    end

    test "#7 can't claim an open published shift in its home department (S7)", %{
      d: d,
      depts: depts
    } do
      refute Authz.can?(
               d,
               :claim,
               shift_fixture(%{status: "published", department: depts["bar"]})
             )
    end

    test "D32 events: read published only; no writes", %{d: d, depts: depts} do
      assert Authz.can?(d, :read, %ScheduleEvent{
               status: "published",
               department_id: depts["bar"].id
             })

      refute Authz.can?(d, :read, %ScheduleEvent{status: "draft", department_id: depts["bar"].id})

      for action <- [:create, :update, :delete, :publish, :unpublish],
          do: refute(Authz.can?(d, action, %ScheduleEvent{status: "published"}))
    end
  end

  describe "schedule setup (#8–#15)" do
    test "#8 reads positions; #9 can't write them", %{d: d} do
      assert Authz.can?(d, :read, %Position{})
      for a <- [:create, :update, :delete], do: refute(Authz.can?(d, a, %Position{}))
    end

    test "#10–#13 templates: no read, no write (not on the device allowlist)", %{d: d} do
      for r <- [%ShiftTemplate{}, %ScheduleTemplate{}],
          a <- [:read, :create, :update, :delete],
          do: refute(Authz.can?(d, a, r))
    end

    test "#14 reads the roster; #15 can't reorder it", %{d: d} do
      assert Authz.can?(d, :read, :roster)
      refute Authz.can?(d, :reorder, :roster)
    end
  end

  describe "time off, availability, calendar feeds (#16–#27)" do
    test "#16/#23/#25 scopes are :none", %{d: d} do
      for m <- [:time_off, :availability, :calendar_feeds, :people, :schedule, :devices],
          l <- [:read, :edit, :manage],
          do: assert(Authz.scope(d, m, l) == :none, "#{m} #{l}")
    end

    test "#17–#22 no time-off decisions", %{d: d, p: p} do
      req = %Request{user_id: p["bartender1"].id, user: p["bartender1"]}

      for a <- [:read, :review, :cancel, :create], do: refute(Authz.can?(d, a, req))
      refute Authz.can?(d, :cancel, %Request{user_id: d.id})
      refute Authz.can?(d, :review, %Request{user_id: d.id})
      refute Authz.can?(d, :manage, {:user_for, p["bartender1"].id})
    end

    test "#24 no availability decisions", %{d: d, p: p} do
      refute Authz.can?(d, :delete, %Slot{user_id: d.id})
      refute Authz.can?(d, :delete, %Slot{user_id: p["bartender1"].id})
    end

    test "#26 can't rotate any calendar feed", %{d: d, depts: depts} do
      refute Authz.can?(d, :rotate, {:calendar_feed, "user", d.id})
      refute Authz.can?(d, :rotate, {:calendar_feed, "department", depts["bar"].id})
      refute Authz.can?(d, :rotate, {:calendar_feed, "all", nil})
    end
  end

  describe "messaging (#28–#31) — S8" do
    test "#28 lists All-staff and its home channel only", %{d: d} do
      assert Messaging.channels_for(d) |> Enum.map(& &1.key) == ["all", "dept:bar"]
      assert Authz.scope(d, :messaging, :edit) == {:departments, [d.home_department_id]}
    end

    test "#29 views and marks read All-staff + home; never posts", %{d: d} do
      for key <- ["all", "dept:bar"] do
        assert Authz.can?(d, :view, {:channel, key})
        assert Authz.can?(d, :mark_read, {:channel, key})
        refute Authz.can?(d, :post, {:channel, key})
      end

      for key <- ["managers", "dept:brewery", "dept:office", "dept:other"],
          a <- [:view, :post, :mark_read],
          do: refute(Authz.can?(d, a, {:channel, key}), "#{a} #{key}")
    end

    test "#30/#31 never a Managers or department-channel recipient", %{d: d} do
      refute d.id in Enum.map(Messaging.recipients("managers"), & &1.id)
      refute d.id in Enum.map(Messaging.recipients("dept:bar"), & &1.id)
      refute d.id in Enum.map(Messaging.recipients("all"), & &1.id)
      refute Authz.counts_as_manager?(d)
    end

    test "posting through the context is refused", %{d: d} do
      assert {:error, :forbidden} = Messaging.post_message(d, "all", "hello")
      assert :ok = Messaging.mark_read(d, "all")
      assert {:error, :forbidden} = Messaging.list_messages(d, "managers")
    end
  end

  describe "people and departments (#33–#40)" do
    test "#33–#37 no user or membership decisions", %{d: d, p: p, depts: depts} do
      for a <- [:list, :create], do: refute(Authz.can?(d, a, %User{}))

      for a <- [:update, :reset_password, :set_owner],
          do: refute(Authz.can?(d, a, p["bartender1"]))

      refute Authz.can?(d, :set, :memberships)
      refute Authz.can?(d, :assign, {:memberships, depts["bar"].id})
      refute Authz.can_manage_user?(d, p["bartender1"])
      refute Authz.can_manage_user?(d, p["bartender1"].id)
    end

    test "#38 reads departments; #39 can't update them", %{d: d} do
      assert Authz.can?(d, :read, %Department{})
      refute Authz.can?(d, :update, %Department{})
    end

    test "#40 no owner activity", %{d: d} do
      refute Authz.can?(d, :read, :owner_activity)
    end

    test "shared devices: can't create, pair, revoke or manage devices", %{d: d} do
      refute Authz.can?(d, :create, :devices)

      for a <- [:view_device, :pair, :revoke_token, :manage_device],
          do: refute(Authz.can?(d, a, d))
    end
  end

  describe "modules and capabilities (#41, #44)" do
    test "#41 module access is its home department only", %{d: d} do
      assert Authz.can?(d, :access, {:module, :bar})
      refute Authz.can?(d, :access, {:module, :brewery})
      refute Authz.can?(d, :access, {:module, :office})
    end

    test "#44 capabilities", %{d: d} do
      assert Accounts.capabilities(d) == %{
               kind: "device",
               home_department: "bar",
               modules: ["bar", "schedule"],
               manages_departments: [],
               can_manage_users: false,
               pending_owner_reviews: 0
             }

      refute Accounts.shared_devices?(d)
    end
  end

  describe "D37 Buy-a-Beer Board and staff codes" do
    test "a Taproom tablet reads the board; nothing else", %{d: d} do
      assert Authz.can?(d, :read, :beer_board)

      for action <- [:write, :history, :import, :export],
          do: refute(Authz.can?(d, action, :beer_board), inspect(action))
    end

    test "a tablet from another department doesn't read it" do
      brewery =
        RockcutApi.AccountsFixtures.device_fixture(%{home: "brewery", name: "Brew tablet"})

      refute Authz.can?(Accounts.get_user!(brewery.id), :read, :beer_board)
    end

    test "can't hold, set or see staff codes", %{d: d, p: p} do
      refute Authz.can_hold_staff_code?(d)
      refute Authz.can?(d, :set_staff_code, p["bartender1"])
      refute Authz.can?(d, :reveal_staff_code, p["bartender1"])
    end
  end

  test "anything else is denied (catch-all)", %{d: d} do
    refute Authz.can?(d, :anything, :anything)
    refute Authz.can?(d, :read, %ShiftTemplate{})
    refute Authz.owner?(d)
  end

  describe "an owner acting on a device as the target (review item 2)" do
    test "no one acts on behalf of a device, owners included", %{d: d, p: p} do
      for who <- ["owner", "barMgr"] do
        refute Authz.can?(p[who], :manage, {:user_for, d.id}), who
      end

      refute Authz.can_manage_user?(d, d.id)
    end

    test "owners still act on behalf of people", %{p: p} do
      assert Authz.can?(p["owner"], :manage, {:user_for, p["bartender1"].id})
      assert Authz.can?(p["barMgr"], :manage, {:user_for, p["bartender1"].id})
    end

    test "no personal calendar feed for a device, owners included", %{d: d, p: p} do
      refute Authz.can?(p["owner"], :rotate, {:calendar_feed, "user", d.id})
      assert Authz.can?(p["owner"], :rotate, {:calendar_feed, "user", p["bartender1"].id})
      assert Authz.can?(p["bartender1"], :rotate, {:calendar_feed, "user", p["bartender1"].id})
    end

    test "time off, availability and a feed for a device are refused through the API", %{
      d: d,
      p: p
    } do
      owner = p["owner"]

      time_off =
        call(owner, :post, "/api/time_off", %{
          user_id: d.id,
          type: "pto",
          all_day: true,
          starts_at: "2030-01-07T07:00:00Z",
          ends_at: "2030-01-08T07:00:00Z"
        })

      assert time_off.status == 403

      slot =
        call(owner, :post, "/api/availability", %{
          user_id: d.id,
          weekday: 1,
          kind: "unavailable",
          all_day: true
        })

      assert slot.status == 403

      feed =
        call(owner, :post, "/api/calendar_feeds/rotate", %{subject_type: "user", subject_id: d.id})

      assert feed.status == 403

      assert Repo.aggregate(from(r in Request, where: r.user_id == ^d.id), :count) == 0
      assert Repo.aggregate(from(s in Slot, where: s.user_id == ^d.id), :count) == 0
    end
  end

  test "an owner's powers don't reach a device: invariants hold through the owner", %{
    d: d,
    p: p
  } do
    owner = p["owner"]
    assert {:error, :device_account} = Accounts.update_user(d, %{"is_owner" => true}, owner)
    assert {:error, :device_account} = Accounts.reset_password(d, owner)

    assert {:error, :device_account} =
             Accounts.set_memberships(d, [%{"department" => "bar", "role" => "manager"}], owner)
  end
end
