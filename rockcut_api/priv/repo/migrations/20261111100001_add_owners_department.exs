defmodule RockcutApi.Repo.Migrations.AddOwnersDepartment do
  use Ecto.Migration

  # D59 §4.1: two department flags and the Owners department. `scheduling`
  # false keeps a department off the schedule; `owners_only` true means only
  # owners add or remove its members. Owners is made here, not by the seed,
  # so the deploy creates it on prod; a row with key `owners` is left alone.
  # It gets the four starter Idea Board lists every board started with (D53).
  #
  # `down` removes Owners only while nothing uses it (its starter lists still
  # empty and under their starting names don't count), otherwise it raises:
  # the rollback is then the image only (spec §6).

  @starter_lists ~w(Ideas Planned Doing Done)

  # Everything that can point at a department, as {label, what `?` is bound
  # to (the department's `:id` or `:key`), SQL counting the rows}.
  @references [
    {"memberships", :id, "SELECT COUNT(*) FROM memberships WHERE department_id = ?"},
    {"devices", :id, "SELECT COUNT(*) FROM users WHERE home_department_id = ?"},
    {"positions", :id, "SELECT COUNT(*) FROM positions WHERE department_id = ?"},
    {"shifts", :id, "SELECT COUNT(*) FROM shifts WHERE department_id = ?"},
    {"schedule events", :id, "SELECT COUNT(*) FROM schedule_events WHERE department_id = ?"},
    {"event series", :id, "SELECT COUNT(*) FROM schedule_event_series WHERE department_id = ?"},
    {"tasks", :id, "SELECT COUNT(*) FROM tasks WHERE department_id = ?"},
    {"task series", :id, "SELECT COUNT(*) FROM task_series WHERE department_id = ?"},
    {"task history", :id, "SELECT COUNT(*) FROM task_events WHERE department_id = ?"},
    {"Daily items", :id, "SELECT COUNT(*) FROM daily_items WHERE department_id = ?"},
    {"Daily checks", :id, "SELECT COUNT(*) FROM daily_checks WHERE department_id = ?"},
    {"calendar feeds", :id,
     "SELECT COUNT(*) FROM calendar_feeds WHERE subject_type = 'department' AND subject_id = ?"},
    {"Idea Board lists", :key,
     """
     SELECT COUNT(*) FROM idea_lists l
     WHERE l.board = ?
       AND (l.name NOT IN ('Ideas', 'Planned', 'Doing', 'Done') OR l.archived_at IS NOT NULL
            OR EXISTS (SELECT 1 FROM idea_cards c WHERE c.list_id = l.id))
     """},
    {"Idea Board labels", :key, "SELECT COUNT(*) FROM idea_labels WHERE board = ?"},
    {"Idea Board history", :key, "SELECT COUNT(*) FROM idea_events WHERE board = ?"},
    {"Idea Board tasks", :id, "SELECT COUNT(*) FROM idea_card_tasks WHERE department_id = ?"},
    {"messages", :key, "SELECT COUNT(*) FROM messages WHERE channel_key = 'dept:' || ?"},
    {"channel reads", :key, "SELECT COUNT(*) FROM channel_reads WHERE channel_key = 'dept:' || ?"}
  ]

  def up do
    alter table(:departments) do
      add :scheduling, :boolean, default: true, null: false
      add :owners_only, :boolean, default: false, null: false
    end

    execute fn ->
      %{rows: [[count]]} =
        repo().query!("SELECT COUNT(*) FROM departments WHERE key = 'owners'")

      if count == 0 do
        repo().query!("""
        INSERT INTO departments
          (name, key, color, assignable, scheduling, owners_only, inserted_at, updated_at)
        VALUES ('Owners', 'owners', '#37474F', 1, 0, 1,
                strftime('%Y-%m-%dT%H:%M:%S', 'now'), strftime('%Y-%m-%dT%H:%M:%S', 'now'))
        """)
      end

      %{rows: [[lists]]} =
        repo().query!("SELECT COUNT(*) FROM idea_lists WHERE board = 'owners'")

      if lists == 0 do
        @starter_lists
        |> Enum.with_index(1)
        |> Enum.each(fn {name, position} ->
          repo().query!(
            """
            INSERT INTO idea_lists (board, name, position, inserted_at, updated_at)
            VALUES ('owners', ?, ?, strftime('%Y-%m-%dT%H:%M:%S', 'now'),
                    strftime('%Y-%m-%dT%H:%M:%S', 'now'))
            """,
            [name, position]
          )
        end)
      end
    end
  end

  def down do
    execute fn ->
      case repo().query!("SELECT id FROM departments WHERE key = 'owners'") do
        %{rows: [[id]]} -> remove_owners(id)
        %{rows: []} -> :ok
      end
    end

    alter table(:departments) do
      remove :scheduling
      remove :owners_only
    end
  end

  defp remove_owners(id) do
    in_use =
      for {label, bind, sql} <- @references,
          %{rows: [[count]]} = repo().query!(sql, [if(bind == :id, do: id, else: "owners")]),
          count > 0,
          do: "#{label} (#{count})"

    if in_use != [] do
      raise "D59 rollback: the Owners department is in use (#{Enum.join(in_use, ", ")}). " <>
              "Leave the migration in place and roll back the image only (D59 spec §6)."
    end

    repo().query!("DELETE FROM idea_lists WHERE board = 'owners'")
    repo().query!("DELETE FROM departments WHERE id = ?", [id])
  end
end
