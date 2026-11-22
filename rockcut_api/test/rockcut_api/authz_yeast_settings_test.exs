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

  test "a count (or entry) is changed by its maker if a Brewery member, a Brewery manager, or an owner" do
    p = personas(~w(owner breweryMgr brewer1 brewer2 splitRole bartender1))
    by_brewer1 = {:yeast_record, %{entered_by_id: p["brewer1"].id}}
    by_bartender = {:yeast_record, %{entered_by_id: p["bartender1"].id}}

    expected = %{
      "owner" => true,
      "breweryMgr" => true,
      "brewer1" => true,
      "brewer2" => false,
      "splitRole" => false,
      "bartender1" => false
    }

    for {who, allowed} <- expected do
      assert Authz.can?(p[who], :change, by_brewer1) == allowed, who
    end

    # Their own, but not a Brewery member: no.
    refute Authz.can?(p["bartender1"], :change, by_bartender)
  end

  test "no device reads or manages the yeast settings" do
    device = RockcutApi.AccountsFixtures.device_fixture(%{home: "brewery", name: "Brewhouse"})
    device = RockcutApi.Accounts.get_user!(device.id)
    refute Authz.can?(device, :read, :yeast_settings)
    refute Authz.can?(device, :manage, :yeast_settings)
    refute Authz.can?(device, :change, {:yeast_record, %{entered_by_id: device.id}})
  end
end
