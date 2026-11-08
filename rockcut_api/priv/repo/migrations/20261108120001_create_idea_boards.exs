defmodule RockcutApi.Repo.Migrations.CreateIdeaBoards do
  use Ecto.Migration

  # D53 Part 2 §4.1: Idea Boards. A board is a key, not a table: a
  # department's key (`brewery`, `bar`, `office`, `sales`) or `company`.
  # `position` is dense (1, 2, 3, …) within a board's lists and within a
  # list's cards, as on the task boards. Archived lists and cards keep their
  # rows (`archived_at`) until a manager deletes them for good, which
  # cascades to the card's assignees, labels, checklist, notes and watches
  # (not to `idea_card_tasks`: the tasks already sent stay).
  #
  # `idea_card_tasks` records Send to task list (§4.7): `task_id` and
  # `task_series_id` are nulled if the task or series is deleted, and
  # `task_title` and `department_id` keep the chip readable ("Removed").
  # `card_id` is nulled if the card is deleted for good, and `card_title`
  # keeps the task's "From idea: <title>" (without a link).
  # `idea_events` is the per-board change log, like `task_events`: `card_id`
  # and `list_id` have no foreign key and `title` is a copy, so a deleted
  # card's history still reads. `idea_watches` and `idea_watch_pending` are
  # Watch (§4.6) and its batched notifications' ledger.
  def change do
    create table(:idea_lists) do
      add :board, :string, null: false
      add :name, :string, null: false
      add :position, :integer, null: false, default: 0
      add :locked_at, :utc_datetime
      add :locked_by_id, references(:users, on_delete: :nilify_all)
      add :archived_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create index(:idea_lists, [:board, :position])

    create table(:idea_cards) do
      add :list_id, references(:idea_lists, on_delete: :delete_all), null: false
      add :title, :string, null: false
      add :description, :text
      add :due_on, :date
      add :position, :integer, null: false, default: 0
      add :locked_at, :utc_datetime
      add :locked_by_id, references(:users, on_delete: :nilify_all)
      add :archived_at, :utc_datetime
      add :created_by_id, references(:users, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create index(:idea_cards, [:list_id, :position])

    create table(:idea_card_assignees, primary_key: false) do
      add :card_id, references(:idea_cards, on_delete: :delete_all), null: false
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :position, :integer, null: false, default: 0
      add :inserted_at, :utc_datetime, null: false
    end

    create unique_index(:idea_card_assignees, [:card_id, :user_id])
    create index(:idea_card_assignees, [:user_id])

    create table(:idea_labels) do
      add :board, :string, null: false
      add :name, :string, null: false
      add :color, :string, null: false
      add :position, :integer, null: false, default: 0

      timestamps(type: :utc_datetime)
    end

    # One label per name on a board, ignoring case ("Equipment" = "equipment").
    create unique_index(:idea_labels, [:board, "lower(name)"],
             name: :idea_labels_board_name_index
           )

    create table(:idea_card_labels, primary_key: false) do
      add :card_id, references(:idea_cards, on_delete: :delete_all), null: false
      add :label_id, references(:idea_labels, on_delete: :delete_all), null: false
    end

    create unique_index(:idea_card_labels, [:card_id, :label_id])
    create index(:idea_card_labels, [:label_id])

    create table(:idea_checklist_items) do
      add :card_id, references(:idea_cards, on_delete: :delete_all), null: false
      add :text, :string, null: false
      add :done_at, :utc_datetime
      add :done_by_id, references(:users, on_delete: :nilify_all)
      add :position, :integer, null: false, default: 0

      timestamps(type: :utc_datetime)
    end

    create index(:idea_checklist_items, [:card_id, :position])

    create table(:idea_notes) do
      add :card_id, references(:idea_cards, on_delete: :delete_all), null: false
      add :author_id, references(:users, on_delete: :nilify_all)
      add :body, :text, null: false
      add :edited_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create index(:idea_notes, [:card_id])

    create table(:idea_card_tasks) do
      add :card_id, references(:idea_cards, on_delete: :nilify_all)
      add :card_title, :string, null: false
      add :task_id, references(:tasks, on_delete: :nilify_all)
      add :task_series_id, references(:task_series, on_delete: :nilify_all)
      add :department_id, references(:departments, on_delete: :restrict), null: false
      add :task_title, :string, null: false
      add :removed_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create index(:idea_card_tasks, [:card_id])
    create index(:idea_card_tasks, [:task_id])
    create index(:idea_card_tasks, [:task_series_id])

    create table(:idea_events) do
      add :board, :string, null: false
      add :card_id, :integer
      add :list_id, :integer
      add :action, :string, null: false
      add :title, :string
      add :actor_id, references(:users, on_delete: :nilify_all)
      add :detail, :map, null: false, default: %{}

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:idea_events, [:board, :inserted_at])
    create index(:idea_events, [:card_id])

    create table(:idea_watches, primary_key: false) do
      add :card_id, references(:idea_cards, on_delete: :delete_all), null: false
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :inserted_at, :utc_datetime, null: false
    end

    create unique_index(:idea_watches, [:card_id, :user_id])
    create index(:idea_watches, [:user_id])

    create table(:idea_watch_pending) do
      add :card_id, references(:idea_cards, on_delete: :delete_all), null: false
      add :watcher_id, references(:users, on_delete: :delete_all), null: false
      add :actor_id, references(:users, on_delete: :nilify_all)
      add :change, :string, null: false
      add :detail, :map, null: false, default: %{}

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:idea_watch_pending, [:card_id, :watcher_id])
    create index(:idea_watch_pending, [:inserted_at])
  end
end
