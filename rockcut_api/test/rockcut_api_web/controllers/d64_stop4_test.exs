defmodule RockcutApiWeb.D64Stop4Test do
  @moduledoc """
  D64 Stop 4 item 1 (Stop 3 LEAD note 13): a batch with yeast pitched into
  it (a lot's `used` movement naming it, or a brink's `pitched` entry) or
  harvested from it (a `harvested` entry) isn't deleted, on any path that
  deletes a batch: the production schedule's delete of a planned batch, the
  batches page's delete, Undo split (its parts) and the Undo of a write that
  made the batch (Plan). Each is a 422 "<label> has yeast pitched into it or
  harvested from it. Remove those first." with nothing changed, and each has
  its allowed case.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.ProductionFixtures, except: [batch!: 1]
  import RockcutApi.IngredientFixtures, except: [product!: 2, batch!: 1, batch!: 2]
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Brewing.Batch
  alias RockcutApi.Yeast.{Entry, Harvest}

  setup do
    p = personas(~w(owner brewer1 breweryMgr))
    c = yeast_catalog!()
    us05 = yeast_product!(c.chico, c.fermentis, "US-05")
    stocked_lot!(us05, ~D[2026-11-01], "10", "F1")

    Map.merge(c, %{
      brewer: p["brewer1"],
      owner: p["owner"],
      us05: us05,
      template: ale_template!(),
      fv4: tank!("FV4"),
      tb: brink!("TB1")
    })
  end

  defp day(n), do: Date.add(Tasks.today(), n)
  defp iso(n), do: Date.to_iso8601(day(n))

  defp req(user, verb, path, params \\ %{}) do
    conn = call(user, verb, path, params)
    {conn.status, if(conn.resp_body == "", do: nil, else: Jason.decode!(conn.resp_body))}
  end

  defp plan(c, brand, brew_in) do
    {201, %{"data" => %{"batches" => [%{"id" => id}]}, "undo_token" => token}} =
      req(c.brewer, :post, "/api/production/batches", %{
        brand_id: brand!(brand).id,
        template_id: c.template.id,
        brew_on: iso(brew_in),
        volume_bbl: "20",
        tank_ids: [c.fv4.id]
      })

    {Repo.get!(Batch, id), token}
  end

  defp lot_pitch!(c, batch) do
    {201, _} =
      req(c.brewer, :post, "/api/ingredient_products/#{c.us05.id}/pitch", %{
        batch_id: batch.id,
        quantity: "1",
        occurred_on: iso(0)
      })
  end

  # A brink entry naming the batch (`pitched` or `harvested`), stored directly.
  defp entry!(c, batch, kind) do
    h = Repo.insert!(%Harvest{brink_id: c.tb.id, status: "emptied"})

    Repo.insert!(%Entry{
      harvest_id: h.id,
      kind: kind,
      quantity_lb: Decimal.new(if(kind == "pitched", do: -5, else: 5)),
      occurred_on: day(0),
      batch_id: batch.id,
      product_ids: [c.us05.id],
      generation: 1,
      entered_by_id: c.brewer.id
    })
  end

  defp sentence(label),
    do: "#{label} has yeast pitched into it or harvested from it. Remove those first."

  defp exists?(batch), do: Repo.exists?(from b in Batch, where: b.id == ^batch.id)

  describe "the production schedule's delete (a planned batch)" do
    test "a lot pitch into it: 422 with the batch's label, nothing deleted", c do
      {batch, _} = plan(c, "Oktoberfest", 3)
      lot_pitch!(c, batch)
      label = (batch |> Repo.preload([:brand, :split_parent])).brand.name <> " P1"

      assert {422, %{"error" => "batch_has_yeast", "message" => message}} =
               req(c.brewer, :delete, "/api/production/batches/#{batch.id}")

      assert message == sentence(label)
      assert exists?(batch)
    end

    test "a brink pitch into it: refused too", c do
      {batch, _} = plan(c, "Oktoberfest", 3)
      entry!(c, batch, "pitched")

      assert {422, %{"error" => "batch_has_yeast"}} =
               req(c.brewer, :delete, "/api/production/batches/#{batch.id}")

      assert exists?(batch)
    end

    test "no yeast: deleted", c do
      {batch, _} = plan(c, "Oktoberfest", 3)
      assert {200, _} = req(c.brewer, :delete, "/api/production/batches/#{batch.id}")
      refute exists?(batch)
    end
  end

  describe "the batches page's delete" do
    test "a harvest from it: 422 (errors.base) with the sentence, nothing deleted; no yeast: 204",
         c do
      brand = brand!("Galactic")
      held = Repo.insert!(%Batch{brand_id: brand.id, batch_number: "41", status: "fermenting"})
      entry!(c, held, "harvested")

      assert {422, %{"errors" => %{"base" => [message]}}} =
               req(c.brewer, :delete, "/api/batches/#{held.id}")

      assert message == sentence("Galactic #41")
      assert exists?(held)

      free = Repo.insert!(%Batch{brand_id: brand.id, batch_number: "42", status: "fermenting"})
      assert {204, _} = req(c.brewer, :delete, "/api/batches/#{free.id}")
      refute exists?(free)
    end
  end

  describe "Undo split (its parts are deleted)" do
    setup c do
      {batch, _} = plan(c, "Galactic", -1)

      {200, _} =
        req(c.brewer, :post, "/api/production/steps/#{named(batch, "Brew day").id}/complete", %{
          done_on: iso(-1),
          batch_number: "91"
        })

      fv7 = tank!("FV7")

      {201, _} =
        req(c.brewer, :post, "/api/production/batches/#{batch.id}/split", %{
          due_on: iso(5),
          parts: [%{stays: true, volume_bbl: 10}, %{tank_id: fv7.id, volume_bbl: 10}]
        })

      parts =
        Repo.all(from(x in Batch, where: x.split_parent_id == ^batch.id, order_by: x.part_number))

      Map.merge(c, %{batch: batch, parts: parts})
    end

    test "a pitch into a part: 422 naming the part, the split stays", c do
      [_, p2] = c.parts
      lot_pitch!(c, p2)

      assert {422, %{"error" => "batch_has_yeast", "message" => message}} =
               req(c.brewer, :delete, "/api/production/batches/#{c.batch.id}/split")

      assert message == sentence("Galactic #91.2")
      assert Enum.all?(c.parts, &exists?/1)
    end

    test "no yeast in the parts: undone", c do
      assert {200, _} = req(c.brewer, :delete, "/api/production/batches/#{c.batch.id}/split")
      refute Enum.any?(c.parts, &exists?/1)
    end
  end

  describe "Undo of the Plan that made the batch" do
    test "yeast pitched into it since: 422, the batch stays; without: undone", c do
      {held, token} = plan(c, "Oktoberfest", 3)
      lot_pitch!(c, held)

      assert {422, %{"error" => "batch_has_yeast"}} =
               req(c.brewer, :post, "/api/production/undo/#{token}")

      assert exists?(held)

      {free, token} = plan(c, "Crusher", 4)
      assert {200, _} = req(c.brewer, :post, "/api/production/undo/#{token}")
      refute exists?(free)
    end
  end

  describe "Totals (spec §13): bricks and pitchables in their own subtotals" do
    test "inventory by_unit: 10 bricks and 3 pitchables, apart", c do
      liquid = yeast_product!(c.california, c.white_labs, "WLP001", "Liquid")

      lot =
        Repo.insert!(%RockcutApi.Brewing.IngredientLot{
          ingredient_id: liquid.ingredient_id,
          product_id: liquid.id,
          pack_name: "pitchable",
          pack_size: Decimal.new(1),
          lot_number: "L1",
          received_date: day(-1)
        })

      Repo.insert!(%RockcutApi.Ingredients.Movement{
        lot_id: lot.id,
        kind: "opening",
        quantity: Decimal.new(3),
        occurred_on: day(-1)
      })

      {200, %{"data" => %{"total" => %{"by_unit" => by_unit}}}} =
        req(c.owner, :get, "/api/ingredient_totals/inventory")

      each = for u <- by_unit, u["unit"] == "each", do: {u["unit_label"], u["quantity"]}
      assert each == [{"bricks", "10.00"}, {"pitchables", "3.00"}]
    end
  end
end
