defmodule RockcutApi.TimeOffD44Test do
  @moduledoc """
  D44 Stage 1: the current/past split (§2.4), past requests read-only, the
  `time_off_requested` (§2.5) and `time_off_reviewed` (§2.7) notifications,
  and the `pending_time_off` badge count (§2.6).
  """
  use RockcutApiWeb.ConnCase

  import Ecto.Query
  import RockcutApi.PersonaFixtures

  alias RockcutApi.{Authz, Notifications, Repo, TimeOff}
  alias RockcutApi.Accounts.User
  alias RockcutApi.Notifications.Notification
  alias RockcutApi.Scheduling.Recurrence
  alias RockcutApi.TimeOff.Request

  setup do
    %{p: personas()}
  end

  # Colorado today, and Colorado wall-clock times as UTC ISO strings.
  defp today, do: elem(Recurrence.to_local(DateTime.utc_now()), 0)
  defp at(%Date{} = date, %Time{} = time), do: Recurrence.local_to_utc(date, time)

  defp attrs(first, last, end_time \\ ~T[23:59:00], extra \\ %{}) do
    Map.merge(
      %{
        "type" => "pto",
        "all_day" => true,
        "starts_at" => at(first, ~T[00:00:00]) |> DateTime.to_iso8601(),
        "ends_at" => at(last, end_time) |> DateTime.to_iso8601()
      },
      extra
    )
  end

  # An own request. One that has already ended can't be made through
  # `create/2` any more (§2.4), so it goes in directly, pending, as one left
  # unreviewed would be.
  defp request!(user, attrs) do
    case TimeOff.create(attrs, user) do
      {:ok, req} ->
        req

      {:error, :past_request} ->
        %Request{}
        |> Request.create_changeset(Map.put(attrs, "user_id", user.id))
        |> Repo.insert!()
        |> then(&TimeOff.get(&1.id))
    end
  end

  defp ids(conn), do: data_ids(conn) |> MapSet.new()

  defp error(conn), do: Jason.decode!(conn.resp_body)["error"]

  defp events(%User{} = user, event) do
    Repo.all(
      from n in Notification, where: n.user_id == ^user.id and n.event == ^to_string(event)
    )
  end

  defp recipients(event) do
    Repo.all(from n in Notification, where: n.event == ^to_string(event), select: n.user_id)
  end

  defp key_set(p, user_ids) do
    by_id = Map.new(p, fn {k, u} -> {u.id, k} end)
    user_ids |> Enum.map(&by_id[&1]) |> MapSet.new()
  end

  defp pending_badge(user) do
    conn = call(user, :get, "/api/me")
    assert conn.status == 200
    Jason.decode!(conn.resp_body)["capabilities"]["pending_time_off"]
  end

  describe "past?/1 and the when filter" do
    setup %{p: p} do
      t = today()
      y = Date.add(t, -1)
      me = p["bartender1"]

      reqs = %{
        ends_today: request!(me, attrs(y, t)),
        ends_yesterday: request!(me, attrs(Date.add(y, -2), y)),
        # Yesterday 23:30 Colorado is early this morning in UTC.
        ends_early_utc_today: request!(me, attrs(Date.add(y, -1), y, ~T[23:30:00])),
        future: request!(me, attrs(Date.add(t, 3), Date.add(t, 4))),
        last_month: request!(me, attrs(Date.add(t, -40), Date.add(t, -38)))
      }

      %{reqs: reqs, me: me}
    end

    test "a request ending early this UTC morning is still yesterday in Colorado", %{reqs: r} do
      assert DateTime.to_date(r.ends_early_utc_today.ends_at) == today()
      assert TimeOff.past?(r.ends_early_utc_today)
    end

    test "past?: ending 23:59 today is current, ending yesterday is past", %{reqs: r} do
      refute TimeOff.past?(r.ends_today)
      refute TimeOff.past?(r.future)
      assert TimeOff.past?(r.ends_yesterday)
      assert TimeOff.past?(r.last_month)
    end

    test "when=current lists today and later only", %{reqs: r, me: me} do
      conn = call(me, :get, "/api/time_off", %{"when" => "current"})
      assert conn.status == 200
      assert ids(conn) == MapSet.new([r.ends_today.id, r.future.id])
    end

    test "when=past lists the past ones, newest first by start", %{reqs: r, me: me} do
      conn = call(me, :get, "/api/time_off", %{"when" => "past"})
      assert conn.status == 200

      assert data_ids(conn) == [
               r.ends_early_utc_today.id,
               r.ends_yesterday.id,
               r.last_month.id
             ]
    end

    test "no when lists everything as before", %{reqs: r, me: me} do
      conn = call(me, :get, "/api/time_off")
      assert conn.status == 200
      assert ids(conn) == r |> Map.values() |> MapSet.new(& &1.id)
    end

    test "an unknown when is a 422", %{me: me} do
      conn = call(me, :get, "/api/time_off", %{"when" => "archive"})
      assert conn.status == 422
      assert error(conn) == "when must be current or past"
    end

    test "when keeps visibility: a manager's past list has their department only", %{
      p: p,
      reqs: r
    } do
      t = today()
      brewer_past = request!(p["brewer1"], attrs(Date.add(t, -5), Date.add(t, -4)))

      bar = call(p["barMgr"], :get, "/api/time_off", %{"when" => "past"}) |> ids()
      assert MapSet.member?(bar, r.last_month.id)
      refute MapSet.member?(bar, brewer_past.id)

      brewery = call(p["breweryMgr"], :get, "/api/time_off", %{"when" => "past"}) |> ids()
      assert MapSet.member?(brewery, brewer_past.id)
      refute MapSet.member?(brewery, r.last_month.id)
    end
  end

  describe "past requests are read-only" do
    setup %{p: p} do
      t = today()
      me = p["bartender1"]

      %{
        me: me,
        past: request!(me, attrs(Date.add(t, -3), Date.add(t, -1))),
        current: request!(me, attrs(t, Date.add(t, 1)))
      }
    end

    test "reviewing a past request → 422", %{p: p, past: past} do
      for status <- ~w(approved denied) do
        conn =
          call(p["barMgr"], :post, "/api/time_off/#{past.id}/review", %{"status" => status})

        assert conn.status == 422
        assert error(conn) == "This time off has already passed"
      end

      assert TimeOff.get(past.id).status == "pending"
    end

    test "reviewing a current request still works", %{p: p, current: current} do
      conn =
        call(p["barMgr"], :post, "/api/time_off/#{current.id}/review", %{"status" => "approved"})

      assert conn.status == 200
      assert TimeOff.get(current.id).status == "approved"
    end

    test "removing past approved time off → 422", %{p: p, past: past} do
      past |> Ecto.Changeset.change(status: "approved") |> Repo.update!()

      conn = call(p["barMgr"], :post, "/api/time_off/#{past.id}/review", %{"status" => "denied"})
      assert conn.status == 422
      assert TimeOff.get(past.id).status == "approved"
    end

    test "cancelling a past request → 422", %{me: me, past: past} do
      conn = call(me, :post, "/api/time_off/#{past.id}/cancel")
      assert conn.status == 422
      assert error(conn) == "This time off has already passed"
      assert TimeOff.get(past.id).status == "pending"
    end

    test "cancelling a current request still works", %{me: me, current: current} do
      conn = call(me, :post, "/api/time_off/#{current.id}/cancel")
      assert conn.status == 200
      assert TimeOff.get(current.id).status == "cancelled"
    end

    test "a stranger on a past request still gets 403", %{p: p, past: past} do
      conn =
        call(p["breweryMgr"], :post, "/api/time_off/#{past.id}/review", %{"status" => "approved"})

      assert conn.status == 403
      assert call(p["barMgr"], :post, "/api/time_off/#{past.id}/cancel").status == 403
    end
  end

  describe "time_off_requested" do
    setup do
      inactive_owner =
        Repo.insert!(%User{
          email: "gone.owner@rockcut-test.com",
          name: "Gone Owner",
          is_owner: true,
          active: false,
          password_hash: "x"
        })

      {device, _token} = taproom_device()
      t = today()
      %{inactive_owner: inactive_owner, device: device, attrs: attrs(t, Date.add(t, 2))}
    end

    # Everyone (persons and devices, active or not) for whom can?(:review) holds,
    # active people only, minus the requester.
    defp reviewable_by(req, everyone) do
      everyone
      |> Enum.filter(&(&1.active and Authz.can?(&1, :review, req) and &1.id != req.user_id))
      |> Enum.reject(&Authz.device?/1)
      |> MapSet.new(& &1.id)
    end

    defp everyone(p, extra), do: Enum.map(Map.values(p) ++ extra, &reload/1)

    test "a bartender's request reaches the bar managers and owners, once each", %{
      p: p,
      attrs: a,
      inactive_owner: io,
      device: d
    } do
      req = request!(p["bartender1"], Map.put(a, "note", "Family wedding"))
      sent = recipients(:time_off_requested)

      assert Enum.sort(sent) == sent |> Enum.uniq() |> Enum.sort()
      assert key_set(p, sent) == MapSet.new(~w(barMgr dualMgr splitRole owner owner2))
      assert MapSet.new(sent) == reviewable_by(req, everyone(p, [io, d]))

      refute io.id in sent
      refute d.id in sent
      refute p["breweryMgr"].id in sent
      refute p["bartender1"].id in sent

      [n] = events(p["barMgr"], :time_off_requested)
      assert n.title == "Sam Pour requested time off"
      assert n.body =~ "PTO"
      assert n.body =~ "all day"
      assert n.body =~ "Family wedding"
      assert n.data["url"] == "/time_off"
    end

    test "a brewer's request reaches the brewery side, not the bar managers", %{p: p, attrs: a} do
      request!(p["brewer1"], a)
      sent = recipients(:time_off_requested)

      assert key_set(p, sent) == MapSet.new(~w(breweryMgr owner owner2))
    end

    test "a manager's own request reaches the other reviewers, not them", %{
      p: p,
      attrs: a,
      inactive_owner: io,
      device: d
    } do
      req = request!(p["barMgr"], a)
      sent = recipients(:time_off_requested)

      assert key_set(p, sent) == MapSet.new(~w(dualMgr splitRole owner owner2))
      assert MapSet.new(sent) == reviewable_by(req, everyone(p, [io, d]))
      assert events(p["barMgr"], :time_off_requested) == []
    end

    test "an on-behalf create sends nothing", %{p: p, attrs: a} do
      {:ok, req} = TimeOff.create(Map.put(a, "user_id", p["bartender1"].id), p["barMgr"])
      assert req.status == "approved"
      assert recipients(:time_off_requested) == []
    end

    test "the request is still created when there is nobody to tell", %{p: p, attrs: a} do
      Repo.update_all(User, set: [active: false])
      me = p["noDept"] |> Ecto.Changeset.change(active: true) |> Repo.update!()

      assert {:ok, %{status: "pending"}} = TimeOff.create(a, me)
      assert recipients(:time_off_requested) == []
    end

    test "timed requests show the Colorado times", %{p: p} do
      t = Date.add(today(), 1)

      request!(p["bartender1"], %{
        "type" => "sick",
        "all_day" => false,
        "starts_at" => at(t, ~T[14:00:00]),
        "ends_at" => at(t, ~T[17:30:00])
      })

      [n] = events(p["owner"], :time_off_requested)
      assert n.body =~ "Sick · #{Calendar.strftime(t, "%a %b %-d")}, 2:00 PM–5:30 PM"
    end
  end

  describe "time_off_reviewed" do
    setup %{p: p} do
      t = today()
      %{req: request!(p["bartender1"], attrs(t, Date.add(t, 2)))}
    end

    defp review(user, req, status, note \\ nil) do
      call(user, :post, "/api/time_off/#{req.id}/review", %{
        "status" => status,
        "reviewer_note" => note
      })
    end

    test "approval notifies the requester with the note", %{p: p, req: req} do
      assert review(p["barMgr"], req, "approved", "Enjoy the trip").status == 200

      [n] = events(p["bartender1"], :time_off_reviewed)
      assert n.title == "Your time off was approved"
      assert n.body =~ "PTO"
      assert n.body =~ "Approved by Casey Tap"
      assert n.body =~ "Enjoy the trip"
      assert n.data["url"] == "/time_off"
      assert events(p["barMgr"], :time_off_reviewed) == []
    end

    test "denial notifies the requester with the note", %{p: p, req: req} do
      assert review(p["owner"], req, "denied", "Sorry, we're short that weekend").status == 200

      [n] = events(p["bartender1"], :time_off_reviewed)
      assert n.title == "Your time off was denied"
      assert n.body =~ "Denied by Olivia Owner"
      assert n.body =~ "Sorry, we're short that weekend"
    end

    test "denying an approved request (Remove) notifies again", %{p: p, req: req} do
      assert review(p["barMgr"], req, "approved").status == 200
      assert review(p["dualMgr"], req, "denied", "Needed after all").status == 200

      titles = p["bartender1"] |> events(:time_off_reviewed) |> Enum.map(& &1.title)

      assert Enum.sort(titles) ==
               Enum.sort(["Your time off was approved", "Your time off was denied"])

      assert Enum.any?(
               events(p["bartender1"], :time_off_reviewed),
               &(&1.body =~ "Needed after all")
             )
    end

    test "no note, no note line", %{p: p, req: req} do
      assert review(p["barMgr"], req, "approved").status == 200
      [n] = events(p["bartender1"], :time_off_reviewed)
      assert n.body |> String.split("\n") |> length() == 2
    end

    test "a refused review notifies no one", %{p: p, req: req} do
      assert review(p["breweryMgr"], req, "approved").status == 403
      assert recipients(:time_off_reviewed) == []
    end

    test "a manager approving their own request gets nothing", %{p: p} do
      t = today()
      own = request!(p["barMgr"], attrs(t, t))
      assert review(p["barMgr"], own, "approved").status == 200
      assert recipients(:time_off_reviewed) == []
    end

    test "both events take preferences, with the normal defaults", %{p: p} do
      for event <- ~w(time_off_requested time_off_reviewed) do
        owner = p["owner"]
        assert Notifications.enabled?(owner, event, :in_app)
        assert Notifications.enabled?(owner, event, :email)
        refute Notifications.enabled?(owner, event, :push)

        assert {:ok, _} = Notifications.update_prefs(owner, %{event => %{"in_app" => false}})
        refute Notifications.enabled?(reload(owner), event, :in_app)
      end

      assert {:error, :invalid_prefs} =
               Notifications.update_prefs(p["owner"], %{"time_off_nope" => %{"email" => false}})
    end

    test "turning the bell off stops the in-app record", %{p: p} do
      {:ok, _} =
        Notifications.update_prefs(p["bartender1"], %{
          "time_off_reviewed" => %{"in_app" => false}
        })

      t = today()
      req = request!(reload(p["bartender1"]), attrs(t, t))
      assert review(p["barMgr"], req, "approved").status == 200
      assert events(p["bartender1"], :time_off_reviewed) == []
    end
  end

  describe "own requests can't be in the past" do
    @past_request "This date has passed. Ask your manager to enter it for you."

    defp post_own(user, a), do: call(user, :post, "/api/time_off", a)

    test "an own request that ended yesterday → 422, nothing stored, no one told", %{p: p} do
      y = Date.add(today(), -1)
      conn = post_own(p["bartender1"], attrs(Date.add(y, -1), y))

      assert conn.status == 422
      assert error(conn) == @past_request
      assert Repo.aggregate(Request, :count) == 0
      assert recipients(:time_off_requested) == []
    end

    test "an own request ending today is fine", %{p: p} do
      t = today()
      conn = post_own(p["bartender1"], attrs(Date.add(t, -2), t))
      assert conn.status == 201
      assert Jason.decode!(conn.resp_body)["data"]["status"] == "pending"
    end

    test "an own request that started yesterday and ends tomorrow is fine", %{p: p} do
      t = today()
      conn = post_own(p["bartender1"], attrs(Date.add(t, -1), Date.add(t, 1)))
      assert conn.status == 201
      assert recipients(:time_off_requested) != []
    end

    test "a request ending 23:30 yesterday Colorado (this morning UTC) is past", %{p: p} do
      y = Date.add(today(), -1)
      conn = post_own(p["bartender1"], attrs(y, y, ~T[23:30:00]))
      assert conn.status == 422
    end

    test "a manager on behalf with past dates → approved, no one told", %{p: p} do
      t = today()

      conn =
        post_own(
          p["barMgr"],
          Map.put(attrs(Date.add(t, -5), Date.add(t, -4)), "user_id", p["bartender1"].id)
        )

      assert conn.status == 201
      assert Jason.decode!(conn.resp_body)["data"]["status"] == "approved"
      assert recipients(:time_off_requested) == []
    end

    test "managers and owners are held to it for their own requests", %{p: p} do
      t = today()

      for who <- ~w(owner barMgr) do
        conn = post_own(p[who], attrs(Date.add(t, -3), Date.add(t, -2)))
        assert conn.status == 422, who
        assert error(conn) == @past_request
      end

      assert Repo.aggregate(Request, :count) == 0
    end

    test "naming oneself as user_id is still an own request", %{p: p} do
      t = today()
      me = p["owner"]
      conn = post_own(me, Map.put(attrs(Date.add(t, -3), Date.add(t, -2)), "user_id", me.id))
      assert conn.status == 422
    end

    test "an invalid request still gets its field errors, not the past message", %{p: p} do
      t = today()
      a = attrs(Date.add(t, -3), Date.add(t, -2)) |> Map.put("type", "vacation")
      conn = post_own(p["bartender1"], a)
      assert conn.status == 422
      refute conn.resp_body =~ "This date has passed"
    end
  end

  describe "pending_time_off" do
    test "an employee with and without a pending request", %{p: p} do
      t = today()
      assert pending_badge(p["bartender1"]) == 0

      req = request!(p["bartender1"], attrs(t, t))
      assert pending_badge(p["bartender1"]) == 1

      TimeOff.cancel(req, p["bartender1"])
      assert pending_badge(p["bartender1"]) == 0
    end

    test "managers of the department and owners count it; others don't", %{p: p} do
      t = today()
      request!(p["bartender1"], attrs(t, Date.add(t, 1)))

      assert pending_badge(p["barMgr"]) == 1
      assert pending_badge(p["dualMgr"]) == 1
      assert pending_badge(p["owner"]) == 1
      assert pending_badge(p["breweryMgr"]) == 0
      assert pending_badge(p["bartender2"]) == 0
    end

    test "approved, denied and past pending requests don't count", %{p: p} do
      t = today()
      request!(p["bartender1"], attrs(Date.add(t, -3), Date.add(t, -1)))
      assert pending_badge(p["bartender1"]) == 0
      assert pending_badge(p["barMgr"]) == 0

      req = request!(p["bartender1"], attrs(t, t))
      assert pending_badge(p["barMgr"]) == 1
      {:ok, _} = TimeOff.review(req, p["barMgr"], "approved", nil)
      assert pending_badge(p["barMgr"]) == 0
      assert pending_badge(p["bartender1"]) == 0
    end

    test "a manager's own request counts once for them", %{p: p} do
      t = today()
      request!(p["barMgr"], attrs(t, t))
      request!(p["bartender1"], attrs(t, t))

      assert pending_badge(p["barMgr"]) == 2
      assert pending_badge(p["owner"]) == 2
    end

    test "a device gets 0", %{p: p} do
      t = today()
      request!(p["bartender1"], attrs(t, t))
      {_device, token} = taproom_device()

      conn = call_device(token, :get, "/api/me")
      assert conn.status == 200
      assert Jason.decode!(conn.resp_body)["capabilities"]["pending_time_off"] == 0
    end
  end
end
