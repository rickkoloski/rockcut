defmodule RockcutApi.AuthzYeastSettingsTest do
  @moduledoc """
  D64 §6.5 (A7, A13), D31 parity: the yeast settings (the Strain Type list
  now, brinks from Stop 2) are read by any Brewery member and managed by
  owners and Brewery managers only. A manager of another department who is
  an employee in Brewery (`splitRole`) reads but doesn't manage; no device
  does either (spec §8). The boundary test (`AuthzBoundaryTest`) covers the
  code: the rule lives in `Authz` alone.
  """
  use RockcutApi.DataCase, async: false

  import RockcutApi.PersonaFixtures

  alias RockcutApi.Authz

  test "read: Brewery members and owners; manage: owners and Brewery managers" do
    p = personas(~w(owner breweryMgr brewer1 floater splitRole barMgr bartender1 office1))

    expected = %{
      "owner" => {true, true},
      "breweryMgr" => {true, true},
      "brewer1" => {true, false},
      "floater" => {true, false},
      "splitRole" => {true, false},
      "barMgr" => {false, false},
      "bartender1" => {false, false},
      "office1" => {false, false}
    }

    for {who, {read, manage}} <- expected do
      assert Authz.can?(p[who], :read, :yeast_settings) == read, "#{who} read"
      assert Authz.can?(p[who], :manage, :yeast_settings) == manage, "#{who} manage"
    end
  end

  test "no device reads or manages the yeast settings" do
    device = RockcutApi.AccountsFixtures.device_fixture(%{home: "brewery", name: "Brewhouse"})
    device = RockcutApi.Accounts.get_user!(device.id)
    refute Authz.can?(device, :read, :yeast_settings)
    refute Authz.can?(device, :manage, :yeast_settings)
  end
end
