defmodule RockcutApiWeb.ProductionDeviceTest do
  @moduledoc """
  D50: the brewhouse device (a shared device at home in the Brewery) on the
  production schedule, at the API (spec §4: P104, P105, D1–D5, D7, D8,
  L2–L4; P106 and P107 are in the route matrix). Every write needs a
  person's staff code and is made as that person, with the device recorded
  beside them. Also the per-device "Show planned batches" (decision 5) and
  links on a batch's steps (§2.7). Every write is checked after a reload.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.ProductionFixtures
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{AccountsFixtures, Repo, StaffCodes, Tasks}
  alias RockcutApi.Brewing.Batch
  alias RockcutApi.Production.{FlagSignoff, Outage, Step, StepLink, UndoRecord}

  setup do
    p = personas(~w(owner breweryMgr brewer1 brewer2 bartender1))
    mgr = p["breweryMgr"]
    {:ok, _} = StaffCodes.set(p["brewer1"], "1111", mgr)
    {:ok, _} = StaffCodes.set(p["brewer2"], "2222", mgr)
    {:ok, _} = StaffCodes.set(p["breweryMgr"], "4444", mgr)
    {:ok, _} = StaffCodes.set(p["owner"], "5555", p["owner"])
    {:ok, _} = StaffCodes.set(p["bartender1"], "3333", p["owner"])

    device = AccountsFixtures.device_fixture(%{home: "brewery", name: "Brewhouse"})
    token = AccountsFixtures.device_token_fixture(device, "Brewhouse Tab")
    %{p: p, device: device, token: token, template: ale_template!(), fv4: tank!("FV4")}
  end

  defp day(offset), do: Date.add(Tasks.today(), offset)
  defp iso(offset), do: Date.to_iso8601(day(offset))
  defp step(s), do: Repo.get!(Step, s.id)
  defp first_name(user), do: user.name |> String.split() |> hd()

  # Planned by a person through the API, brewing `offset` days from today.
  defp plan(ctx, brand, offset, tank_ids \\ nil) do
    %{"data" => %{"batches" => [%{"id" => id}]}} =
      call(ctx.p["brewer1"], :post, "/api/production/batches", %{
        brand_id: brand!(brand).id,
        template_id: ctx.template.id,
        brew_on: iso(offset),
        volume_bbl: "20",
        tank_ids: tank_ids || [ctx.fv4.id]
      })
      |> json_response(201)

    Repo.get!(Batch, id)
  end

  defp move(ctx, s, code, days \\ 1) do
    params = %{ids: [s.id], days: days, answer: "move_only"}
    params = if code, do: Map.put(params, :staff_code, code), else: params
    call_device(ctx.token, :post, "/api/production/steps/move", params)
  end

  describe "P104, P105: reading, and a move with a code" do
    test "the schedule reads without a code; a check-off without one is refused", ctx do
      fdh = named(plan(ctx, "Galactic", 2), "FDH")

      sched =
        call_device(ctx.token, :get, "/api/production/schedule") |> json_response(200)

      assert Enum.any?(sched["data"]["batches"], &(&1["id"] == fdh.batch_id))

      assert %{"error" => "staff_code_required"} =
               call_device(ctx.token, :post, "/api/production/steps/#{fdh.id}/complete", %{})
               |> json_response(422)

      assert step(fdh).done_on == nil
    end

    # D56 decision 26 (DEV gap 13): the device's check-off obeys it too.
    test "brew day comes first on the device: FDH before brew day is 422 brew_first", ctx do
      fdh = named(plan(ctx, "Galactic", 2), "FDH")

      assert %{"error" => "brew_first"} =
               call_device(ctx.token, :post, "/api/production/steps/#{fdh.id}/complete", %{
                 staff_code: "1111",
                 answer: "move_only"
               })
               |> json_response(422)

      assert step(fdh).done_on == nil
    end

    test "brewer1's code moves a step, recorded as brewer1 on the device", ctx do
      fdh = named(plan(ctx, "Galactic", 2), "FDH")
      before = step(fdh).due_on

      body = move(ctx, fdh, "1111") |> json_response(200)

      assert body["recorded_as"] == ctx.p["brewer1"].name
      assert step(fdh).due_on == Date.add(before, 1)

      record = Repo.get_by!(UndoRecord, token: body["undo_token"])
      assert {record.user_id, record.device_id} == {ctx.p["brewer1"].id, ctx.device.id}
    end

    test "a preview needs a code too, and changes nothing", ctx do
      fdh = named(plan(ctx, "Galactic", 2), "FDH")
      params = %{ids: [fdh.id], days: 1, preview: true}

      assert call_device(ctx.token, :post, "/api/production/steps/move", params).status == 422

      body =
        call_device(
          ctx.token,
          :post,
          "/api/production/steps/move",
          Map.put(params, :staff_code, "1111")
        )
        |> json_response(200)

      assert body["data"]["preview"]
      assert step(fdh).due_on == day(9)
    end
  end

  test "D1: plans a batch with brewer1's code; its linked tasks are on the Brewery board", ctx do
    body =
      call_device(ctx.token, :post, "/api/production/batches", %{
        brand_id: brand!("Galactic").id,
        template_id: ctx.template.id,
        brew_on: iso(3),
        volume_bbl: "20",
        tank_ids: [ctx.fv4.id],
        staff_code: "1111"
      })
      |> json_response(201)

    assert body["recorded_as"] == ctx.p["brewer1"].name
    assert [%{"id" => id, "p_number" => "P" <> _}] = body["data"]["batches"]
    batch = Repo.get!(Batch, id)
    assert batch.status == "planned"

    step_ids = Enum.map(steps_of(batch), & &1.id)

    linked =
      Repo.all(from(t in Tasks.Task, where: t.production_step_id in ^step_ids, select: t.id))

    assert linked != []

    record = Repo.get_by!(UndoRecord, token: body["undo_token"])
    assert {record.user_id, record.device_id} == {ctx.p["brewer1"].id, ctx.device.id}
  end

  test "D2: a flag signed off with breweryMgr's code is breweryMgr's, on the device", ctx do
    batch = plan(ctx, "Galactic", 2, [nil])

    flag =
      call_device(ctx.token, :get, "/api/production/schedule")
      |> json_response(200)
      |> get_in(["data", "flags"])
      |> Enum.find(&(&1["key"] =~ "no_tank:#{batch.id}"))

    body =
      call_device(ctx.token, :post, "/api/production/flags/signoff", %{
        key: flag["key"],
        signature: flag["signature"],
        staff_code: "4444"
      })
      |> json_response(200)

    assert body["recorded_as"] == ctx.p["breweryMgr"].name
    signoff = Repo.get_by!(FlagSignoff, flag_key: flag["key"])
    assert {signoff.user_id, signoff.device_id} == {ctx.p["breweryMgr"].id, ctx.device.id}

    again =
      call(ctx.p["brewer1"], :get, "/api/production/schedule")
      |> json_response(200)
      |> get_in(["data", "flags"])
      |> Enum.find(&(&1["key"] == flag["key"]))

    assert again["signed_off"]

    assert again["signoff"]["user_name"] == ctx.p["breweryMgr"].name
    assert again["signoff"]["device_name"] == "Brewhouse"
  end

  # D50 lead decisions 3 (gap 1; was `staff_code_invalid`, counted): a real
  # person outside the Brewery can't do this here, and it isn't counted.
  test "D3: bartender1's code can't do this here on every kind of write; nothing changes; not counted",
       ctx do
    batch = plan(ctx, "Galactic", 2, [nil])
    fdh = named(batch, "FDH")
    batches = Repo.aggregate(Batch, :count)

    writes = [
      {:post, "/api/production/steps/move", %{ids: [fdh.id], days: 1, answer: "move_only"}},
      {:post, "/api/production/steps/#{fdh.id}/complete", %{}},
      {:patch, "/api/production/steps/#{fdh.id}", %{notes: "x"}},
      {:post, "/api/production/batches",
       %{brand_id: batch.brand_id, template_id: ctx.template.id, brew_on: iso(5)}},
      {:post, "/api/production/flags/signoff", %{key: "no_tank:#{batch.id}.0", signature: "s"}}
    ]

    # All five kinds, and none locks the device (five wrong codes would).
    for {verb, path, params} <- writes do
      body =
        call_device(ctx.token, verb, path, Map.put(params, :staff_code, "3333"))
        |> json_response(422)

      assert body == %{
               "error" => "staff_code_not_allowed",
               "message" => "That staff code can't do this here"
             },
             "#{verb} #{path}"
    end

    assert %{due_on: due, done_on: nil, notes: nil} = step(fdh)
    assert due == day(9)
    assert Repo.aggregate(Batch, :count) == batches
    refute Repo.get_by(FlagSignoff, flag_key: "no_tank:#{batch.id}.0")
  end

  test "gap 1: five not-allowed codes on the Gantt and the board don't lock; five wrong codes still do",
       ctx do
    fdh = named(plan(ctx, "Galactic", 2), "FDH")
    board = %{title: "Keg wash", staff_code: "3333"}

    for _ <- 1..3,
        do:
          assert(
            %{"error" => "staff_code_not_allowed"} = move(ctx, fdh, "3333") |> json_response(422)
          )

    for _ <- 1..2 do
      assert %{"error" => "staff_code_not_allowed"} =
               call_device(ctx.token, :post, "/api/boards/brewery/tasks", board)
               |> json_response(422)
    end

    # Not locked: the right code still works (and nothing moved before it).
    assert step(fdh).due_on == day(9)
    assert move(ctx, fdh, "1111") |> json_response(200)
    assert step(fdh).due_on == day(10)

    for _ <- 1..4,
        do:
          assert(
            %{"error" => "staff_code_invalid"} = move(ctx, fdh, "9999") |> json_response(422)
          )

    assert %{"error" => "staff_code_locked"} = move(ctx, fdh, "9999") |> json_response(429)
    # Locked, a real outsider's code gets the lock too: it never says whether a code is real.
    assert %{"error" => "staff_code_locked"} = move(ctx, fdh, "3333") |> json_response(429)
  end

  test "an owner's code works on the device (decision 5.1)", ctx do
    fdh = named(plan(ctx, "Galactic", 2), "FDH")

    body =
      call_device(ctx.token, :patch, "/api/production/steps/#{fdh.id}", %{
        notes: "Owner was here",
        staff_code: "5555"
      })
      |> json_response(200)

    assert body["recorded_as"] == ctx.p["owner"].name
    assert step(fdh).notes == "Owner was here"
  end

  describe "D5: Undo is the person's who made the change" do
    test "brewer2's code can't undo brewer1's move; brewer1's can", ctx do
      fdh = named(plan(ctx, "Galactic", 2), "FDH")
      token = (move(ctx, fdh, "1111") |> json_response(200))["undo_token"]
      url = "/api/production/undo/#{token}"

      assert %{"error" => "staff_code_required"} =
               call_device(ctx.token, :post, url, %{}) |> json_response(422)

      assert call_device(ctx.token, :post, url, %{staff_code: "2222"}) |> json_response(403) ==
               %{
                 "error" => "undo_not_yours",
                 "message" => "Only #{first_name(ctx.p["brewer1"])} can undo this."
               }

      assert step(fdh).due_on == day(10)

      # Signed in as themselves, brewer2 can't either; brewer1 on the device can.
      assert call(ctx.p["brewer2"], :post, url).status == 403

      body = call_device(ctx.token, :post, url, %{staff_code: "1111"}) |> json_response(200)
      assert body["recorded_as"] == ctx.p["brewer1"].name
      assert step(fdh).due_on == day(9)
    end

    test "a change made on the device is undone by its person on their own login", ctx do
      fdh = named(plan(ctx, "Galactic", 2), "FDH")
      token = (move(ctx, fdh, "1111") |> json_response(200))["undo_token"]

      assert call(ctx.p["brewer1"], :post, "/api/production/undo/#{token}").status == 200
      assert step(fdh).due_on == day(9)
    end
  end

  test "check off and un-check: done by the person, on the device", ctx do
    batch = plan(ctx, "Galactic", 0)
    brew = named(batch, "Brew day")

    body =
      call_device(ctx.token, :post, "/api/production/steps/#{brew.id}/complete", %{
        batch_number: "71",
        staff_code: "2222"
      })
      |> json_response(200)

    assert body["recorded_as"] == ctx.p["brewer2"].name
    assert %{done_by_id: by, done_on_device_id: on} = step(brew)
    assert {by, on} == {ctx.p["brewer2"].id, ctx.device.id}

    [json] = Enum.filter(body["data"]["batches"], &(&1["id"] == batch.id))
    brew_json = Enum.find(json["steps"], &(&1["id"] == brew.id))
    assert brew_json["done_on_device"] == %{"id" => ctx.device.id, "name" => "Brewhouse"}

    # A person's own check-off has no device.
    call_device(ctx.token, :post, "/api/production/steps/#{brew.id}/uncomplete", %{
      staff_code: "2222"
    })
    |> json_response(200)

    assert %{done_on: nil, done_by_id: nil, done_on_device_id: nil} = step(brew)

    call(ctx.p["brewer1"], :post, "/api/production/steps/#{brew.id}/complete", %{
      batch_number: "71"
    })
    |> json_response(200)

    assert %{done_by_id: by, done_on_device_id: nil} = step(brew)
    assert by == ctx.p["brewer1"].id
  end

  test "D7: batch changes with a code: add a step, a transfer, a split, Undo split", ctx do
    batch = plan(ctx, "Galactic", -1)
    brew = named(batch, "Brew day")
    fv6 = tank!("FV6")

    call(ctx.p["brewer1"], :post, "/api/production/steps/#{brew.id}/complete", %{
      done_on: iso(-1),
      batch_number: "81"
    })
    |> json_response(200)

    base = "/api/production/batches/#{batch.id}"

    added =
      call_device(ctx.token, :post, "#{base}/steps", %{
        name: "Dry hop 2",
        due_on: iso(8),
        staff_code: "1111"
      })
      |> json_response(201)

    assert added["recorded_as"] == ctx.p["brewer1"].name
    assert named(batch, "Dry hop 2").due_on == day(8)

    call_device(ctx.token, :post, "#{base}/transfers", %{
      step_type_id: type!("Transfer").id,
      due_on: iso(12),
      tank_id: fv6.id,
      staff_code: "1111"
    })
    |> json_response(201)

    assert named(batch, "Transfer").due_on == day(12)
    assert vessels(batch)[1] == fv6.id

    fv7 = tank!("FV7")

    split =
      call_device(ctx.token, :post, "#{base}/split", %{
        due_on: iso(5),
        parts: [%{stays: true, volume_bbl: 10}, %{tank_id: fv7.id, volume_bbl: 10}],
        staff_code: "1111"
      })
      |> json_response(201)

    assert split["recorded_as"] == ctx.p["brewer1"].name

    parts =
      Repo.all(from(b in Batch, where: b.split_parent_id == ^batch.id, order_by: b.part_number))

    assert length(parts) == 2

    call_device(ctx.token, :delete, "#{base}/split", %{staff_code: "1111"})
    |> json_response(200)

    assert Repo.all(from(b in Batch, where: b.split_parent_id == ^batch.id)) == []
  end

  test "out-of-service periods and CIPs with a code, as the person", ctx do
    outage =
      call_device(ctx.token, :post, "/api/production/tanks/#{ctx.fv4.id}/outages", %{
        starts_on: iso(30),
        ends_on: iso(32),
        reason: "Gasket",
        staff_code: "1111"
      })
      |> json_response(201)

    assert outage["recorded_as"] == ctx.p["brewer1"].name
    assert Repo.get!(Outage, outage["data"]["id"]).created_by_id == ctx.p["brewer1"].id

    cip =
      call_device(ctx.token, :post, "/api/production/cips", %{
        tank_id: ctx.fv4.id,
        due_on: iso(0),
        staff_code: "2222"
      })
      |> json_response(201)

    id = cip["data"]["cip"]["id"]

    call_device(ctx.token, :post, "/api/production/cips/#{id}/complete", %{staff_code: "2222"})
    |> json_response(200)

    done = Repo.get!(Step, id)
    assert {done.done_by_id, done.done_on_device_id} == {ctx.p["brewer2"].id, ctx.device.id}
  end

  describe "D8: the wrong-code lock" do
    test "is shared with the Brewery board", ctx do
      fdh = named(plan(ctx, "Galactic", 2), "FDH")

      for _ <- 1..4,
          do: assert(move(ctx, fdh, "9999") |> json_response(422))

      # The fifth, on the board, locks both.
      assert %{"error" => "staff_code_locked"} =
               call_device(ctx.token, :post, "/api/boards/brewery/tasks", %{
                 title: "Keg wash",
                 staff_code: "9999"
               })
               |> json_response(429)

      assert %{"error" => "staff_code_locked"} = move(ctx, fdh, "1111") |> json_response(429)
      assert step(fdh).due_on == day(9)
    end

    test "a CIP's check-off counts a wrong code once, not twice", ctx do
      cip =
        call(ctx.p["brewer1"], :post, "/api/production/cips", %{
          tank_id: ctx.fv4.id,
          due_on: iso(0)
        })
        |> json_response(201)

      url = "/api/production/cips/#{cip["data"]["cip"]["id"]}/complete"

      for _ <- 1..4 do
        assert %{"error" => "staff_code_invalid"} =
                 call_device(ctx.token, :post, url, %{staff_code: "9999"}) |> json_response(422)
      end

      assert call_device(ctx.token, :post, url, %{staff_code: "9999"}).status == 429
    end
  end

  describe "decision 5: the device's own Show planned batches" do
    test "an owner turns it off in Shared devices; the device's /api/me follows", ctx do
      body =
        call(ctx.p["owner"], :patch, "/api/devices/#{ctx.device.id}", %{
          show_planned_batches: false
        })
        |> json_response(200)

      assert body["data"]["show_planned_batches"] == false
      assert Repo.get!(RockcutApi.Accounts.User, ctx.device.id).show_planned_batches == false

      me = call_device(ctx.token, :get, "/api/me") |> json_response(200)
      assert me["show_planned_batches"] == false

      # No person's setting changed.
      assert Repo.get!(RockcutApi.Accounts.User, ctx.p["brewer1"].id).show_planned_batches
    end

    test "null is refused; a Brewery manager can't change it", ctx do
      assert call(ctx.p["owner"], :patch, "/api/devices/#{ctx.device.id}", %{
               show_planned_batches: nil
             }).status == 422

      refute call(ctx.p["breweryMgr"], :patch, "/api/devices/#{ctx.device.id}", %{
               show_planned_batches: false
             }).status in 200..299

      assert Repo.get!(RockcutApi.Accounts.User, ctx.device.id).show_planned_batches
    end
  end

  describe "§2.7 links on a batch's steps (L2–L4)" do
    defp links_url(s), do: "/api/production/steps/#{s.id}/links"

    defp following(user, s) do
      call(user, :post, "/api/production/steps/move", %{ids: [s.id], days: 1, preview: true})
      |> json_response(200)
      |> get_in(["data", "preview", "following"])
      |> Enum.map(& &1["id"])
    end

    test "L2: add a comes-after, remove another; Undo puts each back", ctx do
      b = ctx.p["breweryMgr"]
      batch = plan(ctx, "Galactic", 2)
      [fdh, set_temp, carb] = Enum.map(["FDH", "Set temp - 58°", "Carb"], &named(batch, &1))
      assert carb.id in following(b, set_temp)

      added =
        call(b, :post, links_url(carb), %{comes_after_id: fdh.id, answer: "move_only"})
        |> json_response(201)

      assert {"FDH", "Carb", "move_only"} in links(batch)

      old = Repo.get_by!(StepLink, from_step_id: set_temp.id, to_step_id: carb.id)
      removed = call(b, :delete, "/api/production/step_links/#{old.id}") |> json_response(200)
      refute {"Set temp - 58°", "Carb", "move_all"} in links(batch)

      # The move prompt follows the links as they are now: Carb no longer
      # follows Set temp (it follows FDH), so neither does Package.
      assert following(b, set_temp) == []
      assert carb.id in following(b, fdh)

      for token <- [removed["undo_token"], added["undo_token"]],
          do: call(b, :post, "/api/production/undo/#{token}") |> json_response(200)

      assert {"Set temp - 58°", "Carb", "move_all"} in links(batch)
      refute {"FDH", "Carb", "move_only"} in links(batch)
    end

    test "leads-to and a changed answer", ctx do
      b = ctx.p["breweryMgr"]
      batch = plan(ctx, "Galactic", 2)
      [brew, carb] = Enum.map(["Brew day", "Carb"], &named(batch, &1))

      call(b, :post, links_url(brew), %{leads_to_id: carb.id}) |> json_response(201)
      link = Repo.get_by!(StepLink, from_step_id: brew.id, to_step_id: carb.id)
      assert link.default_answer == "move_all"

      call(b, :patch, "/api/production/step_links/#{link.id}", %{default_answer: "move_only"})
      |> json_response(200)

      assert Repo.get!(StepLink, link.id).default_answer == "move_only"

      assert call(b, :patch, "/api/production/step_links/#{link.id}", %{default_answer: "x"}).status ==
               422
    end

    test "L3: a loop, a comes-after on a later day, another batch, a duplicate: refused", ctx do
      b = ctx.p["breweryMgr"]
      batch = plan(ctx, "Galactic", 2)
      [fdh, package] = Enum.map(["FDH", "Package"], &named(batch, &1))
      other = named(plan(ctx, "Crusher", 3), "FDH")
      before = links(batch)

      # Unlinked, on day 12 (after FDH's day 9).
      call(b, :post, "/api/production/batches/#{batch.id}/steps", %{
        name: "Loose end",
        due_on: iso(12)
      })
      |> json_response(201)

      loose = named(batch, "Loose end")

      refusals = [
        {links_url(fdh), %{comes_after_id: package.id}, "link_cycle"},
        {links_url(fdh), %{comes_after_id: loose.id}, "link_order"},
        {links_url(fdh), %{leads_to_id: other.id}, "link_other_batch"},
        {links_url(fdh), %{leads_to_id: named(batch, "Set temp - 58°").id}, "link_exists"},
        {links_url(fdh), %{}, "link_pick"},
        {links_url(fdh), %{comes_after_id: package.id, leads_to_id: loose.id}, "link_pick"}
      ]

      for {url, params, code} <- refusals do
        body = call(b, :post, url, params) |> json_response(422)
        assert body["error"] == code, inspect(params)
        assert is_binary(body["message"])
      end

      assert call(b, :post, links_url(fdh), %{comes_after_id: 999_999}).status == 404
      assert links(batch) == before
    end

    test "a split's parts link within their tree", ctx do
      b = ctx.p["breweryMgr"]
      batch = plan(ctx, "Galactic", -1)
      fv7 = tank!("FV7")

      call(b, :post, "/api/production/steps/#{named(batch, "Brew day").id}/complete", %{
        done_on: iso(-1),
        batch_number: "91"
      })
      |> json_response(200)

      call(b, :post, "/api/production/batches/#{batch.id}/split", %{
        due_on: iso(5),
        parts: [%{stays: true, volume_bbl: 10}, %{tank_id: fv7.id, volume_bbl: 10}]
      })
      |> json_response(201)

      [p1, p2] =
        Repo.all(from(x in Batch, where: x.split_parent_id == ^batch.id, order_by: x.part_number))

      # The steps after the split went to the parts: part 2's FDH can lead
      # to part 1's Carb (another batch, the same tree).
      [p2_fdh, p1_carb] = [named(p2, "FDH"), named(p1, "Carb")]

      call(b, :post, links_url(p1_carb), %{comes_after_id: p2_fdh.id}) |> json_response(201)
      assert Repo.get_by(StepLink, from_step_id: p2_fdh.id, to_step_id: p1_carb.id)

      unrelated = named(plan(ctx, "Crusher", 3), "FDH")

      assert %{"error" => "link_other_batch"} =
               call(b, :post, links_url(p2_fdh), %{comes_after_id: unrelated.id})
               |> json_response(422)
    end

    test "L4: on the device with brewer1's code; without one refused", ctx do
      batch = plan(ctx, "Galactic", 2)
      [brew, carb] = Enum.map(["Brew day", "Carb"], &named(batch, &1))

      assert call_device(ctx.token, :post, links_url(carb), %{comes_after_id: brew.id}).status ==
               422

      body =
        call_device(ctx.token, :post, links_url(carb), %{
          comes_after_id: brew.id,
          staff_code: "1111"
        })
        |> json_response(201)

      assert body["recorded_as"] == ctx.p["brewer1"].name
      assert {"Brew day", "Carb", "move_all"} in links(batch)

      record = Repo.get_by!(UndoRecord, token: body["undo_token"])
      assert {record.user_id, record.device_id} == {ctx.p["brewer1"].id, ctx.device.id}
    end

    test "someone outside the Brewery can't link", ctx do
      batch = plan(ctx, "Galactic", 2)
      [brew, carb] = Enum.map(["Brew day", "Carb"], &named(batch, &1))

      assert call(ctx.p["bartender1"], :post, links_url(carb), %{comes_after_id: brew.id}).status ==
               403

      refute {"Brew day", "Carb", "move_all"} in links(batch)
    end
  end
end
