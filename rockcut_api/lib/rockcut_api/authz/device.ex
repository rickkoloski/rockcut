defmodule RockcutApi.Authz.Device do
  @moduledoc """
  The shared-device allowlist (D33 §3.4). `RockcutApi.Authz.can?/3` sends
  every decision about a device here from its **first** clause, above the
  owner shortcut, so nothing written for people can grant a device anything.
  Anything not listed below is denied by the catch-all at the bottom.

  A device may:
    * read published shifts and events, positions, departments and the roster;
    * view (and mark read) the All-staff channel and its home department's channel;
    * access its home department's module.

  When roles become data (RBAC roadmap Phases 2–6), this list becomes the
  system role for device accounts; `authz_device_test.exs` pins it.
  """
  alias RockcutApi.Repo
  alias RockcutApi.Accounts.{Department, User}
  alias RockcutApi.Scheduling.{Position, ScheduleEvent, Shift}

  def can?(%User{} = _device, :read, %Shift{status: "published"}), do: true
  def can?(%User{} = _device, :read, %ScheduleEvent{status: "published"}), do: true
  def can?(%User{} = _device, :read, %Position{}), do: true
  def can?(%User{} = _device, :read, %Department{}), do: true
  def can?(%User{} = _device, :read, :roster), do: true

  # No anonymous posting from a shared screen, in any channel. The catch-all
  # would deny it too; this clause keeps the intent on record (spec §3.4).
  def can?(%User{} = _device, :post, {:channel, _key}), do: false

  def can?(%User{} = _device, action, {:channel, "all"}) when action in [:view, :mark_read],
    do: true

  def can?(%User{} = device, action, {:channel, "dept:" <> key})
      when action in [:view, :mark_read],
      do: key == home_key(device)

  def can?(%User{} = device, :access, {:module, key}) when is_atom(key),
    do: Atom.to_string(key) == home_key(device)

  def can?(_device, _action, _resource), do: false

  @doc "The `/api/me` capabilities for a device (D33 §3.4): the schedule and its home department."
  def capabilities(%User{} = device) do
    home = home_key(device)

    %{
      kind: "device",
      home_department: home,
      modules: [home, "schedule"],
      manages_departments: [],
      can_manage_users: false,
      pending_owner_reviews: 0
    }
  end

  @doc "The device's home department key (e.g. \"bar\")."
  def home_key(%User{home_department: %Department{key: key}}), do: key

  def home_key(%User{home_department_id: id}) when is_integer(id) do
    case Repo.get(Department, id) do
      %Department{key: key} -> key
      nil -> nil
    end
  end

  def home_key(_), do: nil
end
