defmodule RockcutApiWeb.Router do
  use RockcutApiWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  # Signed-in people only: shared devices get 403 here (D33 gate 1, deny by default).
  # Both people pipelines refuse all but the reset flow while a password reset
  # is required (D42, PasswordResetGate).
  pipeline :authenticated do
    plug RockcutApiWeb.AuthPlug
    plug RockcutApiWeb.PasswordResetGate
    plug RockcutApiWeb.DeviceGate
  end

  # Signed-in people and shared devices. Only the D33 allowlist routes use it;
  # what a device may do on them is decided by Authz.Device (gate 2).
  pipeline :device_allowed do
    plug RockcutApiWeb.AuthPlug
    plug RockcutApiWeb.PasswordResetGate
  end

  pipeline :brewery do
    plug RockcutApiWeb.ModuleAccessPlug, module: :brewery
  end

  # D41: the board's department, from `:dept` (404 unless it's assignable).
  pipeline :task_board do
    plug RockcutApiWeb.Plugs.TaskBoard
  end

  # D37: Taproom pages (members and owners; a Taproom tablet by its home module).
  pipeline :taproom do
    plug RockcutApiWeb.ModuleAccessPlug, module: :bar
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

  # D37 Buy-a-Beer Board: Taproom staff and the Taproom tablet. Writes from a
  # tablet need a staff code (BeerBoardController); see the route matrix test.
  scope "/api", RockcutApiWeb do
    pipe_through [:api, :device_allowed, :taproom]

    get "/beer_board", BeerBoardController, :index
    post "/beer_board", BeerBoardController, :create
    post "/beer_board/:id/redeem", BeerBoardController, :redeem
    patch "/beer_board/:id", BeerBoardController, :update
    delete "/beer_board/:id", BeerBoardController, :delete
  end

  # D37: board history, CSV export and import. People only.
  scope "/api", RockcutApiWeb do
    pipe_through [:api, :authenticated, :taproom]

    get "/beer_board/history", BeerBoardAdminController, :history
    get "/beer_board/history/export.csv", BeerBoardAdminController, :history_csv
    get "/beer_board/export.csv", BeerBoardAdminController, :export_csv
    post "/beer_board/import/preview", BeerBoardAdminController, :import_preview
    post "/beer_board/import", BeerBoardAdminController, :import
  end

  # Authenticated routes (signed-in people; closed to shared devices)
  scope "/api", RockcutApiWeb do
    pipe_through [:api, :authenticated]

    post "/session/password", SessionController, :password
    delete "/sessions/others", SessionController, :delete_others
    # D43: the person's own theme. Not for devices (a manager sets a tablet's
    # on Shared devices); a "Sign in as me" session may set its person's.
    put "/me/color_mode", MeController, :update_color_mode

    # Departments (update) and roster order; reads are in the scope above
    patch "/departments/:id", DepartmentController, :update
    post "/roster/order", RosterController, :order

    # User & role management (authorization enforced per-action in the controllers)
    resources "/users", UserController, only: [:index, :create, :update]
    put "/users/:user_id/memberships", MembershipController, :update
    post "/users/:id/reset_password", UserController, :reset_password
    # Staff codes (D37; every department since D40): the user edit dialog
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

  # D41 §3.6: the All departments view, owners only and read-only. Declared
  # before the boards so it wins over `:dept`; every other `/api/boards/all/...`
  # route reaches the `TaskBoard` plug, which 404s `all` (no writes here).
  scope "/api/boards/all", RockcutApiWeb do
    pipe_through [:api, :authenticated]

    get "/tasks", TaskBoardController, :all
  end

  # D38 task boards, one per assignable department since D41
  # (`/api/boards/:dept`): the department's members and owners. Not tied to a
  # module: each action asks Authz about the board's department.
  #
  # D40: what a department's shared tablet uses on its home board (Authz.Device
  # refuses every other board): the board, a task's series for the dialog,
  # the Daily items list (the board needs it), task writes and Daily ticks.
  # Writes from a tablet need a staff code (StaffCodeActing); see the route
  # matrix test.
  scope "/api/boards/:dept", RockcutApiWeb do
    pipe_through [:api, :device_allowed, :task_board]

    get "/tasks", TaskBoardController, :index
    post "/tasks", TaskBoardController, :create
    post "/tasks/move_overdue_to_today", TaskBoardController, :move_overdue_to_today
    patch "/tasks/:id", TaskBoardController, :update
    delete "/tasks/:id", TaskBoardController, :delete
    post "/tasks/:id/move", TaskBoardController, :move
    post "/tasks/:id/complete", TaskBoardController, :complete
    post "/tasks/:id/uncomplete", TaskBoardController, :uncomplete
    get "/tasks/:id/series", TaskBoardController, :series
    post "/tasks/:id/stop_repeating", TaskBoardController, :stop_repeating

    put "/daily_checks/:on_date/:daily_item_id", DailyController, :tick
    delete "/daily_checks/:on_date/:daily_item_id", DailyController, :untick
    get "/daily_items", DailyController, :items
  end

  # A board's History and its Daily items list changes: people only.
  scope "/api/boards/:dept", RockcutApiWeb do
    pipe_through [:api, :authenticated, :task_board]

    get "/tasks/history", TaskBoardController, :history

    post "/daily_items", DailyController, :create_item
    put "/daily_items/order", DailyController, :order_items
    patch "/daily_items/:id", DailyController, :update_item
    post "/daily_items/:id/restore", DailyController, :restore_item
    delete "/daily_items/:id", DailyController, :delete_item
  end

  # D46 production setup (spec §3.2–§3.4): Brewery members and owners
  # (`Authz` `:production`; each action asks). People only until D49 brings
  # the brewhouse tablet.
  scope "/api/production", RockcutApiWeb do
    pipe_through [:api, :authenticated]

    get "/tanks", ProductionTankController, :index
    post "/tanks", ProductionTankController, :create
    post "/tanks/reorder", ProductionTankController, :reorder
    patch "/tanks/:id", ProductionTankController, :update
    delete "/tanks/:id", ProductionTankController, :retire
    post "/tanks/:id/restore", ProductionTankController, :restore
    post "/tanks/:id/outages", ProductionTankController, :create_outage
    patch "/outages/:id", ProductionTankController, :update_outage
    delete "/outages/:id", ProductionTankController, :delete_outage
    post "/outages/:id/end_today", ProductionTankController, :end_outage_today

    get "/phases", ProductionListController, :phases
    post "/phases", ProductionListController, :create_phase
    post "/phases/reorder", ProductionListController, :reorder_phases
    patch "/phases/:id", ProductionListController, :update_phase
    delete "/phases/:id", ProductionListController, :retire_phase
    post "/phases/:id/restore", ProductionListController, :restore_phase

    get "/step_types", ProductionListController, :step_types
    post "/step_types", ProductionListController, :create_step_type
    post "/step_types/reorder", ProductionListController, :reorder_step_types
    patch "/step_types/:id", ProductionListController, :update_step_type
    delete "/step_types/:id", ProductionListController, :retire_step_type
    post "/step_types/:id/restore", ProductionListController, :restore_step_type

    get "/templates", ProductionTemplateController, :index
    post "/templates", ProductionTemplateController, :create
    post "/templates/reorder", ProductionTemplateController, :reorder
    get "/templates/:id", ProductionTemplateController, :show
    patch "/templates/:id", ProductionTemplateController, :update
    delete "/templates/:id", ProductionTemplateController, :retire
    post "/templates/:id/restore", ProductionTemplateController, :restore
    post "/templates/:id/duplicate", ProductionTemplateController, :duplicate
    post "/templates/:id/steps", ProductionTemplateController, :add_step
    patch "/templates/:id/steps/:step_id", ProductionTemplateController, :update_step
    delete "/templates/:id/steps/:step_id", ProductionTemplateController, :remove_step
    post "/templates/:id/links", ProductionTemplateController, :add_link
    patch "/templates/:id/links/:link_id", ProductionTemplateController, :update_link
    delete "/templates/:id/links/:link_id", ProductionTemplateController, :remove_link
    post "/templates/:id/ramp", ProductionTemplateController, :add_ramp

    # D47: the schedule, batches and their steps.
    get "/schedule", ProductionScheduleController, :show
    post "/batches", ProductionScheduleController, :create_batch
    patch "/batches/:id", ProductionScheduleController, :update_batch
    delete "/batches/:id", ProductionScheduleController, :delete_batch
    post "/batches/:id/shift", ProductionScheduleController, :shift_batch
    patch "/batches/:id/vessels/:index", ProductionScheduleController, :update_vessel
    # D48: changing a batch (§3.11).
    post "/batches/:id/steps", ProductionScheduleController, :add_step
    post "/batches/:id/ramp", ProductionScheduleController, :add_ramp
    post "/batches/:id/transfers", ProductionScheduleController, :add_transfer
    delete "/batches/:id/transfers/:step_id", ProductionScheduleController, :remove_transfer
    post "/steps/move", ProductionScheduleController, :move_steps
    post "/steps/assign", ProductionScheduleController, :assign_steps
    post "/steps/:id/complete", ProductionScheduleController, :complete_step
    post "/steps/:id/uncomplete", ProductionScheduleController, :uncomplete_step
    patch "/steps/:id", ProductionScheduleController, :update_step
    delete "/steps/:id", ProductionScheduleController, :remove_step
    post "/steps/:id/ramp", ProductionScheduleController, :change_ramp
    post "/cips", ProductionScheduleController, :create_cip
    patch "/cips/:id", ProductionScheduleController, :update_cip
    delete "/cips/:id", ProductionScheduleController, :delete_cip
    post "/cips/:id/complete", ProductionScheduleController, :complete_cip
    post "/cips/:id/uncomplete", ProductionScheduleController, :uncomplete_cip
    post "/flags/signoff", ProductionScheduleController, :sign_off
    delete "/flags/signoff/:key", ProductionScheduleController, :remove_signoff
    post "/undo/:token", ProductionScheduleController, :undo
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
