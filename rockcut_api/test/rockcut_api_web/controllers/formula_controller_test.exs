defmodule RockcutApiWeb.FormulaControllerTest do
  use RockcutApiWeb.ConnCase

  alias RockcutApi.Brewing

  # ── Auth helpers ───────────────────────────────────────────────────

  defp auth_conn(conn) do
    token = Phoenix.Token.sign(RockcutApiWeb.Endpoint, "user auth", "test@example.com")
    put_req_header(conn, "authorization", "Bearer #{token}")
  end

  # ── Test data helpers ──────────────────────────────────────────────

  defp create_test_data(_context) do
    # Create ingredient categories
    {:ok, hop_cat} = Brewing.create_ingredient_category(%{name: "Hop"})
    {:ok, grain_cat} = Brewing.create_ingredient_category(%{name: "Grain"})

    # Create ingredients
    {:ok, cascade} = Brewing.create_ingredient(%{name: "Cascade", category_id: hop_cat.id})
    {:ok, pale_malt} = Brewing.create_ingredient(%{name: "Pale Malt", category_id: grain_cat.id})

    # Create lots
    {:ok, hop_lot} =
      Brewing.create_ingredient_lot(%{
        ingredient_id: cascade.id,
        lot_number: "HOP-001",
        status: "available",
        alpha_acid: Decimal.new("5.5")
      })

    {:ok, grain_lot} =
      Brewing.create_ingredient_lot(%{
        ingredient_id: pale_malt.id,
        lot_number: "GRAIN-001",
        status: "available",
        potential_gravity: Decimal.new("1.037")
      })

    # Create brand and recipe
    {:ok, brand} = Brewing.create_brand(%{name: "Test IPA"})

    {:ok, recipe} =
      Brewing.create_recipe(%{
        brand_id: brand.id,
        batch_size: Decimal.new("5.0"),
        batch_size_unit: "gallons",
        boil_time: 60
      })

    # Add recipe ingredients
    {:ok, _hop_ri} =
      Brewing.create_recipe_ingredient(%{
        recipe_id: recipe.id,
        lot_id: hop_lot.id,
        amount: Decimal.new("2.0"),
        unit: "oz",
        use: "boil",
        time_minutes: 60
      })

    {:ok, _grain_ri} =
      Brewing.create_recipe_ingredient(%{
        recipe_id: recipe.id,
        lot_id: grain_lot.id,
        amount: Decimal.new("10.0"),
        unit: "lb",
        use: "mash"
      })

    %{
      ingredient: cascade,
      recipe: recipe,
      hop_lot: hop_lot,
      grain_lot: grain_lot
    }
  end

  # ── GET /api/formulas/catalog ──────────────────────────────────────

  describe "GET /api/formulas/catalog" do
    test "returns 401 without auth token", %{conn: conn} do
      conn = get(conn, ~p"/api/formulas/catalog")
      assert json_response(conn, 401)
    end

    test "returns 200 with list of functions", %{conn: conn} do
      conn =
        conn
        |> auth_conn()
        |> get(~p"/api/formulas/catalog")

      assert %{"functions" => functions} = json_response(conn, 200)
      assert is_list(functions)
      assert length(functions) == 3
    end

    test "each function has name, description, params, and returns", %{conn: conn} do
      conn =
        conn
        |> auth_conn()
        |> get(~p"/api/formulas/catalog")

      %{"functions" => functions} = json_response(conn, 200)

      for func <- functions do
        assert Map.has_key?(func, "name")
        assert Map.has_key?(func, "description")
        assert Map.has_key?(func, "params")
        assert Map.has_key?(func, "returns")
        assert is_binary(func["name"])
        assert is_binary(func["description"])
        assert is_list(func["params"])
        assert is_binary(func["returns"])
      end
    end

    test "includes inventory_on_hand, est_ibu, and est_og", %{conn: conn} do
      conn =
        conn
        |> auth_conn()
        |> get(~p"/api/formulas/catalog")

      %{"functions" => functions} = json_response(conn, 200)
      names = Enum.map(functions, & &1["name"])

      assert "inventory_on_hand" in names
      assert "est_ibu" in names
      assert "est_og" in names
    end

    test "does not expose handler or limits in the response", %{conn: conn} do
      conn =
        conn
        |> auth_conn()
        |> get(~p"/api/formulas/catalog")

      %{"functions" => functions} = json_response(conn, 200)

      for func <- functions do
        refute Map.has_key?(func, "handler")
        refute Map.has_key?(func, "limits")
      end
    end
  end

  # ── POST /api/formulas/execute ─────────────────────────────────────

  describe "POST /api/formulas/execute" do
    setup :create_test_data

    test "returns 401 without auth token", %{conn: conn, ingredient: ingredient} do
      conn =
        post(conn, ~p"/api/formulas/execute", %{
          "calls" => [%{"function" => "inventory_on_hand", "args" => %{"ingredient_id" => ingredient.id}}]
        })

      assert json_response(conn, 401)
    end

    test "executes a single valid call and returns result", %{conn: conn, ingredient: ingredient} do
      conn =
        conn
        |> auth_conn()
        |> post(~p"/api/formulas/execute", %{
          "calls" => [
            %{"function" => "inventory_on_hand", "args" => %{"ingredient_id" => ingredient.id}}
          ]
        })

      assert %{"results" => [result]} = json_response(conn, 200)
      assert result["status"] == "ok"
      assert Map.has_key?(result, "value")
      assert Map.has_key?(result, "duration_ms")
      assert is_integer(result["duration_ms"])
    end

    test "executes batch of valid calls", %{conn: conn, ingredient: ingredient, recipe: recipe} do
      conn =
        conn
        |> auth_conn()
        |> post(~p"/api/formulas/execute", %{
          "calls" => [
            %{"function" => "inventory_on_hand", "args" => %{"ingredient_id" => ingredient.id}},
            %{"function" => "est_ibu", "args" => %{"recipe_id" => recipe.id}},
            %{"function" => "est_og", "args" => %{"recipe_id" => recipe.id}}
          ]
        })

      assert %{"results" => results} = json_response(conn, 200)
      assert length(results) == 3

      for result <- results do
        assert result["status"] == "ok"
        assert Map.has_key?(result, "value")
        assert Map.has_key?(result, "duration_ms")
      end
    end

    test "handles unknown function without failing the batch", %{conn: conn, recipe: recipe} do
      conn =
        conn
        |> auth_conn()
        |> post(~p"/api/formulas/execute", %{
          "calls" => [
            %{"function" => "nonexistent_func", "args" => %{}},
            %{"function" => "est_ibu", "args" => %{"recipe_id" => recipe.id}}
          ]
        })

      assert %{"results" => [error_result, ok_result]} = json_response(conn, 200)

      # First call should be an error
      assert error_result["status"] == "error"
      assert error_result["error"] == "not_found"
      assert is_binary(error_result["message"])

      # Second call should succeed despite the first failing
      assert ok_result["status"] == "ok"
      assert Map.has_key?(ok_result, "value")
    end

    test "results are positionally matched to calls", %{conn: conn, ingredient: ingredient, recipe: recipe} do
      conn =
        conn
        |> auth_conn()
        |> post(~p"/api/formulas/execute", %{
          "calls" => [
            %{"function" => "est_og", "args" => %{"recipe_id" => recipe.id}},
            %{"function" => "inventory_on_hand", "args" => %{"ingredient_id" => ingredient.id}}
          ]
        })

      assert %{"results" => [og_result, inv_result]} = json_response(conn, 200)

      # OG should be in 1.0XX range
      assert og_result["status"] == "ok"
      og_value = og_result["value"]
      assert og_value >= 1.0 and og_value < 1.200

      # Inventory should be a number
      assert inv_result["status"] == "ok"
    end

    test "returns empty results for empty calls array", %{conn: conn} do
      conn =
        conn
        |> auth_conn()
        |> post(~p"/api/formulas/execute", %{"calls" => []})

      assert %{"results" => []} = json_response(conn, 200)
    end
  end
end
