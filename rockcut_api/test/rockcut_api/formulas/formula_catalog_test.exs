defmodule RockcutApi.Formulas.FormulaCatalogTest do
  use RockcutApi.DataCase

  alias RockcutApi.Formulas.FormulaCatalog

  describe "list_exposed/0" do
    test "returns all seven formula functions" do
      functions = FormulaCatalog.list_exposed()

      assert length(functions) == 7

      names = Enum.map(functions, & &1.name)
      assert "inventory_on_hand" in names
      assert "est_ibu" in names
      assert "est_og" in names
      assert "est_fg" in names
      assert "est_abv" in names
      assert "est_srm" in names
      assert "est_calories" in names
    end

    test "each function has required fields" do
      for func <- FormulaCatalog.list_exposed() do
        assert is_binary(func.name)
        assert is_binary(func.description)
        assert is_list(func.params)
        assert func.returns in [:number, :string, :map, :list]
        assert is_function(func.handler)
        assert is_map(func.limits)
        assert is_integer(func.limits.timeout_ms)
        assert func.exposed == true
      end
    end

    test "only returns exposed functions" do
      functions = FormulaCatalog.list_exposed()
      assert Enum.all?(functions, & &1.exposed)
    end
  end

  describe "get/1" do
    test "returns operation by name" do
      op = FormulaCatalog.get("inventory_on_hand")

      assert op != nil
      assert op.name == "inventory_on_hand"
      assert is_function(op.handler)
    end

    test "returns est_ibu by name" do
      op = FormulaCatalog.get("est_ibu")

      assert op != nil
      assert op.name == "est_ibu"
      assert [%{name: "recipe_id", type: :integer, required: true}] = op.params
    end

    test "returns est_og by name" do
      op = FormulaCatalog.get("est_og")

      assert op != nil
      assert op.name == "est_og"
      assert [%{name: "recipe_id", type: :integer, required: true}] = op.params
    end

    test "returns est_fg by name" do
      op = FormulaCatalog.get("est_fg")

      assert op != nil
      assert op.name == "est_fg"
      assert [%{name: "recipe_id", type: :integer, required: true}] = op.params
    end

    test "returns est_abv by name" do
      op = FormulaCatalog.get("est_abv")

      assert op != nil
      assert op.name == "est_abv"
      assert [%{name: "recipe_id", type: :integer, required: true}] = op.params
    end

    test "returns est_srm by name" do
      op = FormulaCatalog.get("est_srm")

      assert op != nil
      assert op.name == "est_srm"
      assert [%{name: "recipe_id", type: :integer, required: true}] = op.params
    end

    test "returns est_calories by name" do
      op = FormulaCatalog.get("est_calories")

      assert op != nil
      assert op.name == "est_calories"
      assert [%{name: "recipe_id", type: :integer, required: true}] = op.params
    end

    test "returns nil for unknown function name" do
      assert FormulaCatalog.get("nonexistent_function") == nil
    end

    test "returns nil for empty string" do
      assert FormulaCatalog.get("") == nil
    end
  end

  describe "param schemas" do
    test "inventory_on_hand requires ingredient_id as integer" do
      op = FormulaCatalog.get("inventory_on_hand")
      assert [%{name: "ingredient_id", type: :integer, required: true}] = op.params
    end

    test "est_ibu requires recipe_id as integer" do
      op = FormulaCatalog.get("est_ibu")
      assert [%{name: "recipe_id", type: :integer, required: true}] = op.params
    end

    test "est_og requires recipe_id as integer" do
      op = FormulaCatalog.get("est_og")
      assert [%{name: "recipe_id", type: :integer, required: true}] = op.params
    end
  end
end
