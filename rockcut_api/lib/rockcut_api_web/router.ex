defmodule RockcutApiWeb.Router do
  use RockcutApiWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  # Signed-in people only: shared devices get 403 here (D33 gate 1, deny by default).
  pipeline :authenticated do
    plug RockcutApiWeb.AuthPlug
    plug RockcutApiWeb.DeviceGate
  end

  # Signed-in people and shared devices. Only the D33 allowlist routes use it;
  # what a device may do on them is decided by Authz.Device (gate 2).
  pipeline :device_allowed do
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

    # A tablet exchanges a pairing code for its token (D33; rate-limited per IP)
    post "/device_tokens", DeviceTokenController, :create

    # Public ICS calendar feed (token in the URL is the credential)
    get "/calendar/:token", CalendarController, :feed
  end

  # Routes a shared device may use as well as people (D33 §3.3 allowlist).
  # Each path+verb here is in no other scope. Adding a route here opens it to
  # devices: add its Authz.Device entry and classify it in
  # device_route_matrix_test.exs.
  scope "/api", RockcutApiWeb do
    pipe_through [:api, :device_allowed]

    get "/session", SessionController, :show
    delete "/session", SessionController, :delete
    get "/me", MeController, :show
    get "/departments", DepartmentController, :index
    get "/positions", PositionController, :index
    get "/roster", RosterController, :index
    get "/shifts", ShiftController, :index
    get "/shifts/:id", ShiftController, :show
    get "/schedule_events", ScheduleEventController, :index
    get "/channels", MessageController, :channels
    get "/channels/:key/messages", MessageController, :index
    post "/channels/:key/read", MessageController, :read
    get "/messages/unread_count", MessageController, :unread_count
  end

  # Authenticated routes (signed-in people; closed to shared devices)
  scope "/api", RockcutApiWeb do
    pipe_through [:api, :authenticated]

    post "/session/password", SessionController, :password
    delete "/sessions/others", SessionController, :delete_others

    # Departments (update) and roster order; reads are in the scope above
    patch "/departments/:id", DepartmentController, :update
    post "/roster/order", RosterController, :order

    # User & role management (authorization enforced per-action in the controllers)
    resources "/users", UserController, only: [:index, :create, :update]
    put "/users/:user_id/memberships", MembershipController, :update
    post "/users/:id/reset_password", UserController, :reset_password
    # D37: staff codes (owners + Taproom managers; the user edit dialog)
    get "/users/:id/staff_code", StaffCodeController, :show
    put "/users/:id/staff_code", StaffCodeController, :update
    delete "/users/:id/staff_code", StaffCodeController, :delete
    get "/staff_codes/suggest", StaffCodeController, :suggest

    # Shared devices (D33): owners + managers of a device's home department
    get "/devices", DeviceController, :index
    post "/devices", DeviceController, :create
    patch "/devices/:id", DeviceController, :update
    delete "/devices/:id", DeviceController, :delete
    post "/devices/:id/pairing_code", DeviceController, :pairing_code
    delete "/device_tokens/:id", DeviceTokenController, :delete

    # Owner activity feed (in-app notification of manager actions)
    get "/owner/activity", OwnerActivityController, :index
    post "/owner/activity/seen", OwnerActivityController, :seen

    # Scheduling (shared module — global read; writes authorized in controllers)
    resources "/positions", PositionController, only: [:create, :update, :delete]
    post "/shifts", ShiftController, :create
    post "/shifts/publish", ShiftController, :publish_batch
    patch "/shifts/:id", ShiftController, :update
    delete "/shifts/:id", ShiftController, :delete
    post "/shifts/:id/publish", ShiftController, :publish
    post "/shifts/:id/unpublish", ShiftController, :unpublish
    post "/shifts/:id/claim", ShiftController, :claim

    # Scheduling templates (D14)
    post "/schedule_events", ScheduleEventController, :create
    post "/schedule_events/publish", ScheduleEventController, :publish_batch
    get "/schedule_events/:id", ScheduleEventController, :show
    patch "/schedule_events/:id", ScheduleEventController, :update
    delete "/schedule_events/:id", ScheduleEventController, :delete
    post "/schedule_events/:id/publish", ScheduleEventController, :publish
    post "/schedule_events/:id/unpublish", ScheduleEventController, :unpublish
    post "/schedule_event_series/:id/extend", ScheduleEventController, :extend_series

    resources "/shift_templates", ShiftTemplateController,
      only: [:index, :create, :update, :delete]

    resources "/schedule_templates", ScheduleTemplateController, only: [:index, :create, :delete]

    # Time off (D16)
    get "/time_off", TimeOffController, :index
    post "/time_off", TimeOffController, :create
    post "/time_off/:id/review", TimeOffController, :review
    post "/time_off/:id/cancel", TimeOffController, :cancel

    # Availability (D25) — recurring weekly, self-declared
    get "/availability", AvailabilityController, :index
    post "/availability", AvailabilityController, :create
    delete "/availability/:id", AvailabilityController, :delete

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
    post "/channels/:key/messages", MessageController, :create
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
