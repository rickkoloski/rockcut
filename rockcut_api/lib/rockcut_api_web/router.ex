defmodule RockcutApiWeb.Router do
  use RockcutApiWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :authenticated do
    plug RockcutApiWeb.AuthPlug
  end

  pipeline :brewery do
    plug RockcutApiWeb.ModuleAccessPlug, module: :brewery
  end

  # Public routes (no auth required)
  scope "/api", RockcutApiWeb do
    pipe_through :api

    get "/health", HealthController, :index
    post "/session", SessionController, :create

    # Public ICS calendar feed (token in the URL is the credential)
    get "/calendar/:token", CalendarController, :feed
  end

  # Authenticated routes (any signed-in user)
  scope "/api", RockcutApiWeb do
    pipe_through [:api, :authenticated]

    get "/session", SessionController, :show
    delete "/session", SessionController, :delete
    post "/session/password", SessionController, :password

    # Current user + departments (drive UI nav)
    get "/me", MeController, :show
    get "/departments", DepartmentController, :index
    patch "/departments/:id", DepartmentController, :update
    get "/roster", RosterController, :index
    post "/roster/order", RosterController, :order

    # User & role management (authorization enforced per-action in the controllers)
    resources "/users", UserController, only: [:index, :create, :update]
    put "/users/:user_id/memberships", MembershipController, :update
    post "/users/:id/reset_password", UserController, :reset_password

    # Owner activity feed (in-app notification of manager actions)
    get "/owner/activity", OwnerActivityController, :index

    # Scheduling (shared module — global read; writes authorized in controllers)
    resources "/positions", PositionController, only: [:index, :create, :update, :delete]
    get "/shifts", ShiftController, :index
    get "/shifts/:id", ShiftController, :show
    post "/shifts", ShiftController, :create
    post "/shifts/publish", ShiftController, :publish_batch
    patch "/shifts/:id", ShiftController, :update
    delete "/shifts/:id", ShiftController, :delete
    post "/shifts/:id/publish", ShiftController, :publish
    post "/shifts/:id/unpublish", ShiftController, :unpublish
    post "/shifts/:id/claim", ShiftController, :claim

    # Scheduling templates (D14)
    resources "/shift_templates", ShiftTemplateController,
      only: [:index, :create, :update, :delete]

    resources "/schedule_templates", ScheduleTemplateController, only: [:index, :create, :delete]

    # Time off (D16)
    get "/time_off", TimeOffController, :index
    post "/time_off", TimeOffController, :create
    post "/time_off/:id/review", TimeOffController, :review
    post "/time_off/:id/cancel", TimeOffController, :cancel

    # Calendar feed management (D17)
    get "/calendar_feeds", CalendarFeedController, :index
    post "/calendar_feeds/rotate", CalendarFeedController, :rotate

    # Notifications (D18)
    get "/notifications", NotificationController, :index
    get "/notifications/unread_count", NotificationController, :unread_count
    post "/notifications/read_all", NotificationController, :read_all
    post "/notifications/:id/read", NotificationController, :read
    get "/notification_preferences", NotificationPreferenceController, :show
    put "/notification_preferences", NotificationPreferenceController, :update

    # Web push (D21)
    get "/push/public_key", PushController, :public_key
    post "/push/subscriptions", PushController, :subscribe
    delete "/push/subscriptions", PushController, :unsubscribe

    # Messaging (D23)
    get "/channels", MessageController, :channels
    get "/channels/:key/messages", MessageController, :index
    post "/channels/:key/messages", MessageController, :create
    post "/channels/:key/read", MessageController, :read
    get "/messages/unread_count", MessageController, :unread_count
  end

  # Brewery module — the existing brewing app (gated by Brewery membership)
  scope "/api", RockcutApiWeb do
    pipe_through [:api, :authenticated, :brewery]

    # Ingredient library
    resources "/ingredient_categories", IngredientCategoryController, except: [:new, :edit]

    resources "/category_field_definitions", CategoryFieldDefinitionController,
      except: [:new, :edit]

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
