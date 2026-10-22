defmodule RockcutApiWeb.ProductionBatchChangesControllerTest do
  @moduledoc """
  D48 §3.11 (task 1) over HTTP: add step / ramp / transfer, remove step and
  transfer, Change ramp…, template and brand; their messages, Undo, and who
  may use them.
  """
  use RockcutApiWeb.ConnCase

  import RockcutApi.PersonaFixtures
  import RockcutApi.ProductionFixtures

  alias RockcutApi.Repo
  alias RockcutApi.Production.Step

  setup do
    people = personas(~w(brewer1 brewer2 owner office1))
    template = ale_template!()

    batch =
      plan!(brand!("Galactic"), template, ~D[2026-11-02], %{"tank_ids" => [tank!("FV2").id]})

    Map.merge(people, %{template: template, batch: batch})
  end

  defp body(conn), do: Jason.decode!(conn.resp_body)
  defp undo(user, conn), do: call(user, :post, "/api/production/undo/#{body(conn)["undo_token"]}")
  defp names(batch), do: Enum.map(steps_of(batch), &RockcutApi.Production.Steps.name/1)

  test "add a step: 201 with the batch and the new step; Undo takes it out", ctx do
    b = ctx["brewer1"]
    path = "/api/production/batches/#{ctx.batch.id}/steps"

    added =
      call(b, :post, path, %{
        step_type_id: type!("Addition").id,
        detail: "raspberry puree",
        due_on: "2026-11-10",
        comes_after_id: named(ctx.batch, "FDH").id
      })

    assert added.status == 201
    assert %{"batches" => [batch], "step_ids" => [id]} = body(added)["data"]
    step = Enum.find(batch["steps"], &(&1["id"] == id))
    assert %{"name" => "Addition - raspberry puree", "added" => true, "marker" => false} = step

    assert undo(b, added).status == 200
    refute Repo.get(Step, id)

    empty = call(b, :post, path, %{name: "", due_on: "2026-11-10"})
    assert empty.status == 422
    assert body(empty) == %{"error" => "name_required", "message" => "Give the step a name."}
  end

  test "ramps: add one, change it, its steps carry the group", ctx do
    b = ctx["brewer1"]

    ramp =
      call(b, :post, "/api/production/batches/#{ctx.batch.id}/ramp", %{
        start: 60,
        target: 40,
        change_per_day: 10,
        first_on: "2026-11-13"
      })

    assert ramp.status == 201
    [first | _] = body(ramp)["data"]["step_ids"]
    [batch] = body(ramp)["data"]["batches"]
    group = Enum.find(batch["steps"], &(&1["id"] == first))["ramp_group"]
    assert is_binary(group)

    changed = call(b, :post, "/api/production/steps/#{first}/ramp", %{target: 50})
    assert changed.status == 200
    assert "Set temp - 50°" in names(ctx.batch)
    refute "Set temp - 40°" in names(ctx.batch)

    flat =
      call(b, :post, "/api/production/steps/#{named(ctx.batch, "FDH").id}/ramp", %{target: 50})

    assert body(flat)["error"] == "not_ramp"
  end

  test "transfers: add, refused after a done step, remove by either route; Undo", ctx do
    b = ctx["brewer1"]
    s1 = tank!("Serving 1")
    path = "/api/production/batches/#{ctx.batch.id}/transfers"

    added =
      call(b, :post, path, %{
        step_type_id: type!("Filter").id,
        due_on: "2026-11-14",
        tank_id: s1.id
      })

    assert added.status == 201
    assert body(added)["data"]["moved"] == 3
    [batch] = body(added)["data"]["batches"]

    assert batch["vessels"] == [
             %{"vessel_index" => 0, "tank_id" => vessels(ctx.batch)[0]},
             %{"vessel_index" => 1, "tank_id" => s1.id}
           ]

    filter = named(ctx.batch, "Filter")
    other = plan!(brand!("Enos"), ctx.template, ~D[2026-11-02])

    assert call(b, :delete, "/api/production/batches/#{other.id}/transfers/#{filter.id}").status ==
             404

    assert call(
             b,
             :delete,
             "/api/production/batches/#{ctx.batch.id}/transfers/#{named(ctx.batch, "FDH").id}"
           ).status == 404

    removed = call(b, :delete, "/api/production/batches/#{ctx.batch.id}/transfers/#{filter.id}")
    assert removed.status == 200
    assert map_size(vessels(ctx.batch)) == 1
    assert undo(b, removed).status == 200
    assert map_size(vessels(ctx.batch)) == 2

    gone = call(b, :delete, "/api/production/steps/#{named(ctx.batch, "Filter").id}")
    assert gone.status == 200
    assert map_size(vessels(ctx.batch)) == 1

    done!(named(ctx.batch, "Carb"))
    late = call(b, :post, path, %{due_on: "2026-11-14"})
    assert late.status == 422

    assert body(late) == %{
             "error" => "step_done_after",
             "message" => "Some steps after that date are already done. Pick a later date."
           }
  end

  test "remove a step; Brew day is refused", ctx do
    b = ctx["brewer1"]
    removed = call(b, :delete, "/api/production/steps/#{named(ctx.batch, "Carb").id}")
    assert removed.status == 200
    refute "Carb" in names(ctx.batch)
    assert undo(b, removed).status == 200
    assert "Carb" in names(ctx.batch)

    brew = call(b, :delete, "/api/production/steps/#{named(ctx.batch, "Brew day").id}")
    assert brew.status == 422
    assert body(brew)["error"] == "brew_day"
  end

  test "change template and brand by PATCH; Undo puts the old steps back", ctx do
    b = ctx["brewer1"]
    lager = lager_template!()
    before = names(ctx.batch)
    path = "/api/production/batches/#{ctx.batch.id}"

    changed = call(b, :patch, path, %{template_id: lager.id})
    assert changed.status == 200
    assert body(changed)["data"]["message"] == "Standard ale → Lager with transfer."
    [batch] = body(changed)["data"]["batches"]
    assert batch["template_name"] == "Lager with transfer"
    assert length(batch["vessels"]) == 2

    assert undo(b, changed).status == 200
    assert names(ctx.batch) == before
    assert map_size(vessels(ctx.batch)) == 1

    enos = brand!("Enos")
    rebranded = call(b, :patch, path, %{brand_id: enos.id})
    assert [%{"label" => "Enos P1", "brand_id" => id}] = body(rebranded)["data"]["batches"]
    assert id == enos.id
  end

  test "Brewery members and owners only; others get 403", ctx do
    s = named(ctx.batch, "Carb")

    requests = [
      {:post, "/api/production/batches/#{ctx.batch.id}/steps",
       %{name: "x", due_on: "2026-11-10"}},
      {:post, "/api/production/batches/#{ctx.batch.id}/ramp",
       %{start: 60, target: 40, change_per_day: 10, first_on: "2026-11-13"}},
      {:post, "/api/production/batches/#{ctx.batch.id}/transfers", %{due_on: "2026-11-14"}},
      {:delete, "/api/production/batches/#{ctx.batch.id}/transfers/#{s.id}", %{}},
      {:delete, "/api/production/steps/#{s.id}", %{}},
      {:post, "/api/production/steps/#{s.id}/ramp", %{target: 40}}
    ]

    for {method, path, params} <- requests do
      assert call(ctx["office1"], method, path, params).status == 403, path
    end

    assert call(ctx["owner"], :post, "/api/production/batches/#{ctx.batch.id}/steps", %{
             name: "x",
             due_on: "2026-11-10"
           }).status == 201
  end
end
