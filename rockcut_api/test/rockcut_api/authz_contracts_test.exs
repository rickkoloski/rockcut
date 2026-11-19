defmodule RockcutApi.AuthzContractsTest do
  @moduledoc """
  D61 decision 25: malt contracts are read by any Brewery member and written
  by owners and Brewery managers only. A manager of another department who
  is an employee in Brewery (`splitRole`) reads but doesn't write; no device
  does either (decision 26).
  """
  use RockcutApi.DataCase, async: false

  import RockcutApi.PersonaFixtures

  alias RockcutApi.Authz

  test "read: Brewery members and owners; write: owners and Brewery managers" do
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

    for {who, {read, write}} <- expected do
      assert Authz.can?(p[who], :read, :contracts) == read, "#{who} read"
      assert Authz.can?(p[who], :write, :contracts) == write, "#{who} write"
    end
  end

  test "no device reads or writes contracts" do
    device = RockcutApi.AccountsFixtures.device_fixture(%{home: "brewery", name: "Brewhouse"})
    device = RockcutApi.Accounts.get_user!(device.id)
    refute Authz.can?(device, :read, :contracts)
    refute Authz.can?(device, :write, :contracts)
  end
end
