defmodule RockcutApi.AuthzEventsTest do
  @moduledoc """
  D32 — who may read and change schedule events, per persona. Mirrors shifts:
  published events are readable by everyone; drafts and every write belong to
  managers of the event's department, and owners.
  """
  use RockcutApi.DataCase

  import RockcutApi.PersonaFixtures
  import RockcutApi.SchedulingFixtures

  alias RockcutApi.Authz

  @writes [:create, :update, :delete, :publish, :unpublish]

  # Personas that manage the Bar (taproom) department, or own everything.
  @bar_managers ~w(owner owner2 barMgr dualMgr splitRole)
  @others ~w(breweryMgr bartender1 bartender2 floater brewer1 office1 noDept sales1 hidden)

  setup do
    p = personas()
    d = departments()

    %{
      p: p,
      bar_pub: event_fixture(%{department: d["bar"], status: "published"}),
      bar_draft: event_fixture(%{department: d["bar"], status: "draft"}),
      brewery_draft: event_fixture(%{department: d["brewery"], status: "draft"})
    }
  end

  for who <- @bar_managers ++ @others do
    test "#{who} reads a published Bar event", %{p: p, bar_pub: e} do
      assert Authz.can?(p[unquote(who)], :read, e)
    end
  end

  for who <- @bar_managers do
    test "#{who} reads and changes a Bar draft", %{p: p, bar_draft: e} do
      user = p[unquote(who)]
      assert Authz.can?(user, :read, e)
      for action <- @writes, do: assert(Authz.can?(user, action, e), "#{action}")
    end
  end

  for who <- @others do
    test "#{who} can't read or change a Bar draft", %{p: p, bar_draft: e, bar_pub: pub} do
      user = p[unquote(who)]
      refute Authz.can?(user, :read, e)
      for action <- @writes, do: refute(Authz.can?(user, action, e), "#{action}")
      for action <- @writes, do: refute(Authz.can?(user, action, pub), "#{action} published")
    end
  end

  test "breweryMgr changes Brewery events but not Bar ones", %{
    p: p,
    brewery_draft: b,
    bar_pub: bar
  } do
    for action <- @writes do
      assert Authz.can?(p["breweryMgr"], action, b)
      refute Authz.can?(p["breweryMgr"], action, bar)
    end
  end

  test "nobody can claim an event", %{p: p, bar_pub: e} do
    for who <- ~w(barMgr bartender1 floater), do: refute(Authz.can?(p[who], :claim, e))
  end
end
