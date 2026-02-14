defmodule RockcutApiWeb.Router do
  use RockcutApiWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :authenticated do
    plug RockcutApiWeb.AuthPlug
  end

  # Public routes (no auth required)
  scope "/api", RockcutApiWeb do
    pipe_through :api

    get "/health", HealthController, :index
    post "/session", SessionController, :create
  end

  # Protected routes (auth required)
  scope "/api", RockcutApiWeb do
    pipe_through [:api, :authenticated]

    get "/session", SessionController, :show
    delete "/session", SessionController, :delete

    # Ingredient library
    resources "/ingredient_categories", IngredientCategoryController, except: [:new, :edit]
    resources "/category_field_definitions", CategoryFieldDefinitionController, except: [:new, :edit]
    resources "/ingredients", IngredientController, except: [:new, :edit]
    resources "/ingredient_lots", IngredientLotController, except: [:new, :edit]

    # Recipe management
    resources "/brands", BrandController, except: [:new, :edit]
    resources "/recipes", RecipeController, except: [:new, :edit]
    resources "/recipe_ingredients", RecipeIngredientController, except: [:new, :edit]
    resources "/mash_steps", MashStepController, except: [:new, :edit]
    resources "/recipe_process_steps", RecipeProcessStepController, except: [:new, :edit]
    resources "/water_profiles", WaterProfileController, except: [:new, :edit]

    # Batch tracking
    resources "/batches", BatchController, except: [:new, :edit]
    resources "/brew_turns", BrewTurnController, except: [:new, :edit]
    resources "/batch_log_entries", BatchLogEntryController, except: [:new, :edit]

    # Formula execution
    get "/formulas/catalog", FormulaController, :catalog
    post "/formulas/execute", FormulaController, :execute
  end

  # Enable LiveDashboard and Swoosh mailbox preview in development
  if Application.compile_env(:rockcut_api, :dev_routes) do
    # If you want to use the LiveDashboard in production, you should put
    # it behind authentication and allow only admins to access it.
    # If your application does not have an admins-only section yet,
    # you can use Plug.BasicAuth to set up some basic authentication
    # as long as you are also using SSL (which you should anyway).
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through [:fetch_session, :protect_from_forgery]

      live_dashboard "/dashboard", metrics: RockcutApiWeb.Telemetry
      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end
end
