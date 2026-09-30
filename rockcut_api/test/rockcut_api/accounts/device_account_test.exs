defmodule RockcutApi.Accounts.DeviceAccountTest do
  @moduledoc "D33 §3.1: the device account's invariants and the four listing fixes."
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.AccountsFixtures
  import RockcutApi.SchedulingFixtures
  import RockcutApi.DataCase, only: [errors_on: 1]

  alias RockcutApi.{Accounts, Messaging, Repo, Scheduling}
  alias RockcutApi.Accounts.User
  alias RockcutApi.Scheduling.ScheduleTemplateItem

  setup do
    %{device: device_fixture(), owner: owner_fixture(), bar: department_fixture("bar")}
  end

  describe "invariants" do
    test "a new device has the fixed shape", %{device: d, bar: bar} do
      assert d.kind == "device"
      assert d.home_department_id == bar.id
      refute d.is_owner
      refute d.schedulable
      refute d.must_reset_password
      assert d.memberships == []
      assert d.email =~ ~r/^device-[0-9a-f]{16}@devices\.rockcut\.invalid$/
      assert is_binary(d.password_hash) and d.password_hash != ""
    end

    test "a device needs a name and a home department" do
      cs = User.device_create_changeset(%{name: "  "})
      refute cs.valid?
      assert %{name: _, home_department_id: _} = errors_on(cs)
    end

    test "the home department must be assignable (review item 6)", %{device: d} do
      other =
        Repo.insert!(%RockcutApi.Accounts.Department{
          key: "other",
          name: "Other",
          assignable: false
        })

      cs =
        User.device_create_changeset(%{name: "Back office tablet", home_department_id: other.id})

      refute cs.valid?
      assert "must be a department people can be assigned to" in errors_on(cs).home_department_id

      cs = User.device_update_changeset(d, %{home_department_id: other.id})
      refute cs.valid?
      assert errors_on(cs).home_department_id

      assert User.device_update_changeset(d, %{name: "Renamed"}).valid?
    end

    test "a device can't be made an owner", %{device: d} do
      cs = User.owner_flag_changeset(d, true)
      refute cs.valid?
      assert "not allowed for a shared device" in errors_on(cs).is_owner
    end

    test "a device can't be made schedulable", %{device: d} do
      cs = User.changeset(d, %{schedulable: true})
      refute cs.valid?
      assert errors_on(cs).schedulable
    end

    test "a device can't be given a password or a forced reset", %{device: d} do
      cs = User.password_changeset(d, %{password: "longenough1", must_reset_password: true})
      refute cs.valid?
      assert errors_on(cs).password
      assert errors_on(cs).must_reset_password
    end

    test "kind can't be changed through the person changesets", %{device: d} do
      person = user_fixture()

      assert Ecto.Changeset.get_field(User.changeset(person, %{kind: "device"}), :kind) ==
               "person"

      assert Ecto.Changeset.get_field(User.changeset(d, %{kind: "person"}), :kind) == "device"
    end

    test "a person can't have a home department", %{bar: bar} do
      person = user_fixture()

      cs = User.changeset(%{person | home_department_id: bar.id}, %{})

      refute cs.valid?
      assert errors_on(cs).home_department_id
    end
  end

  describe "Accounts refuses person operations on a device" do
    test "set_memberships → :device_account", %{device: d, owner: o} do
      assert {:error, :device_account} =
               Accounts.set_memberships(d, [%{"department" => "bar", "role" => "employee"}], o)

      assert Accounts.get_user!(d.id).memberships == []
    end

    test "the membership changeset itself refuses a device (review item 7)", %{
      device: d,
      bar: bar
    } do
      cs =
        RockcutApi.Accounts.Membership.changeset(%RockcutApi.Accounts.Membership{}, %{
          user_id: d.id,
          department_id: bar.id,
          role: "employee"
        })

      refute cs.valid?
      assert "can't be a shared device" in errors_on(cs).user_id

      person = user_fixture()

      assert RockcutApi.Accounts.Membership.changeset(%RockcutApi.Accounts.Membership{}, %{
               user_id: person.id,
               department_id: bar.id,
               role: "employee"
             }).valid?
    end

    test "update_user and reset_password → :device_account", %{device: d, owner: o} do
      assert {:error, :device_account} = Accounts.update_user(d, %{"is_owner" => true}, o)
      assert {:error, :device_account} = Accounts.reset_password(d, o)
      refute Accounts.get_user!(d.id).is_owner
    end

    test "no password authenticates a device", %{device: d} do
      assert is_nil(Accounts.get_user_by_email_and_password(d.email, "anything-at-all"))
    end
  end

  describe "the four listing fixes" do
    test "list_roster excludes devices", %{device: d} do
      p = user_fixture(%{name: "Roster Person"})
      ids = Accounts.list_roster() |> Enum.map(& &1.id)
      assert p.id in ids
      refute d.id in ids
    end

    test "list_users_for (owner) excludes devices", %{device: d, owner: o} do
      ids = Accounts.list_users_for(o) |> Enum.map(& &1.id)
      assert o.id in ids
      refute d.id in ids
    end

    test "All-staff recipients exclude devices (S10)", %{device: d, owner: o} do
      ids = Messaging.recipients("all") |> Enum.map(& &1.id)
      assert o.id in ids
      refute d.id in ids
    end

    test "department and Managers recipients exclude devices", %{device: d} do
      refute d.id in Enum.map(Messaging.recipients("dept:bar"), & &1.id)
      refute d.id in Enum.map(Messaging.recipients("managers"), & &1.id)
    end
  end

  describe "assignees (S14)" do
    test "a shift can't be assigned to a device", %{device: d, owner: o} do
      shift = shift_fixture()

      assert {:error, cs} = Scheduling.update_shift(shift, %{"assignee_id" => d.id})
      assert "can't be a shared device" in errors_on(cs).assignee_id

      pos = position_fixture()

      assert {:error, cs} =
               Scheduling.create_shift(
                 %{
                   "position_id" => pos.id,
                   "assignee_id" => d.id,
                   "starts_at" => ~U[2026-10-05 16:00:00Z],
                   "ends_at" => ~U[2026-10-05 22:00:00Z]
                 },
                 o
               )

      assert errors_on(cs).assignee_id
    end

    test "a template item can't be assigned to a device", %{device: d} do
      pos = position_fixture()

      cs =
        ScheduleTemplateItem.changeset(%ScheduleTemplateItem{}, %{
          position_id: pos.id,
          assignee_id: d.id,
          day_index: 1,
          start_time: ~T[16:00:00],
          end_time: ~T[22:00:00]
        })

      refute cs.valid?
      assert errors_on(cs).assignee_id
    end

    test "a person is still assignable" do
      p = user_fixture()
      shift = shift_fixture()
      assert {:ok, _} = Scheduling.update_shift(shift, %{"assignee_id" => p.id})
    end
  end

  describe "API refusals" do
    setup %{owner: o} do
      token = Phoenix.Token.sign(RockcutApiWeb.Endpoint, "user auth", o.id)
      %{authed: build_conn() |> put_req_header("authorization", "Bearer #{token}")}
    end

    test "Users & Roles can't edit, reset or give memberships to a device (422)",
         %{authed: conn, device: d} do
      assert conn |> patch("/api/users/#{d.id}", %{"is_owner" => true}) |> json_response(422)
      assert conn |> post("/api/users/#{d.id}/reset_password") |> json_response(422)

      assert conn
             |> put("/api/users/#{d.id}/memberships", %{
               "memberships" => [%{"department" => "bar", "role" => "employee"}]
             })
             |> json_response(422)

      assert Repo.get!(User, d.id).is_owner == false
    end

    test "password login as a device is refused (S5)", %{device: d} do
      resp = build_conn() |> post("/api/session", %{email: d.email, password: "whatever12"})
      assert json_response(resp, 401)["error"] == "Invalid credentials"
    end

    test "an assignee id of a device is a 422 (S14)", %{authed: conn, device: d} do
      pos = position_fixture()

      resp =
        post(conn, "/api/shifts", %{
          "position_id" => pos.id,
          "assignee_id" => d.id,
          "starts_at" => "2026-10-05T16:00:00Z",
          "ends_at" => "2026-10-05T22:00:00Z"
        })

      assert json_response(resp, 422)["errors"]["assignee_id"]
    end
  end
end
