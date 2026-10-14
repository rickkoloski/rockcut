defmodule RockcutApi.Reminders do
  @moduledoc """
  Shift reminders (D22): find published, assigned shifts starting within the lead
  window and send each assignee a one-time reminder. Idempotent — a small ledger
  (`shift_reminders`) prevents re-sending on the next scan.

  D40: `run_shift_end/1`, the shift-end reminder (D38 spec §3.5): an hour
  before each published Brewery shift ends, its assignee hears what's still
  open on the Brewery board that day. Ledger: `task_reminders`.
  """
  import Ecto.Query
  require Logger
  alias RockcutApi.{Accounts, Repo, Notifications, Tasks}
  alias RockcutApi.Scheduling.Shift
  alias RockcutApi.Reminders.{ShiftReminder, TaskReminder}

  @doc "Minutes before a shift's start to remind (default 60)."
  def offset_minutes, do: Application.get_env(:rockcut_api, :reminder_offset_minutes, 60)

  @doc """
  Send reminders for shifts due as of `now`. Returns the number sent. Safe to call
  repeatedly (each shift is reminded at most once per offset).
  """
  def run(now \\ DateTime.utc_now()) do
    offset = offset_minutes()
    cutoff = DateTime.add(now, offset * 60, :second)

    due =
      Shift
      |> where([s], s.status == "published" and not is_nil(s.assignee_id))
      |> where([s], s.starts_at > ^now and s.starts_at <= ^cutoff)
      |> Repo.all()

    already = reminded_shift_ids(Enum.map(due, & &1.id), offset)

    due
    |> Enum.reject(&MapSet.member?(already, &1.id))
    |> Enum.map(fn shift -> send_reminder(shift, offset) end)
    |> Enum.count(& &1)
  end

  defp reminded_shift_ids([], _offset), do: MapSet.new()

  defp reminded_shift_ids(shift_ids, offset) do
    ShiftReminder
    |> where([r], r.shift_id in ^shift_ids and r.offset_minutes == ^offset)
    |> select([r], r.shift_id)
    |> Repo.all()
    |> MapSet.new()
  end

  # Notify, then record — best-effort. Returns true when a reminder was sent.
  defp send_reminder(%Shift{} = shift, offset) do
    case Repo.insert(
           ShiftReminder.changeset(%ShiftReminder{}, %{
             shift_id: shift.id,
             offset_minutes: offset,
             sent_at: DateTime.utc_now() |> DateTime.truncate(:second)
           })
         ) do
      {:ok, _} ->
        Notifications.shift_reminder(shift)
        true

      {:error, _changeset} ->
        # Lost a race / already recorded — don't double-send.
        false
    end
  end

  ## Shift-end reminder (D40)

  @shift_end_minutes 60
  # A shift is picked up by the first scan less than an hour before its end
  # (55–60 minutes with the 5-minute scanner). The window reaches 10 minutes
  # back so a scan that runs late, or one that's skipped, still finds it; the
  # ledger keeps it to one.
  @shift_end_window_minutes 10

  @doc """
  The shift-end reminders due at `now`: published Brewery shifts with an
  assignee, at least an hour long, ending in the next
  #{@shift_end_minutes} minutes (but not sooner than
  #{@shift_end_minutes - @shift_end_window_minutes}) and not reminded yet.
  Each gets one ledger row, sent or not: nothing open on its Colorado day's
  board → nothing is sent. Returns the number sent. Safe to call repeatedly.
  """
  def run_shift_end(now \\ DateTime.utc_now()) do
    case Accounts.get_department_by_key("brewery") do
      nil -> 0
      brewery -> shift_end(brewery, now)
    end
  end

  defp shift_end(brewery, now) do
    latest = DateTime.add(now, @shift_end_minutes * 60, :second)
    earliest = DateTime.add(now, (@shift_end_minutes - @shift_end_window_minutes) * 60, :second)

    Shift
    |> where([s], s.department_id == ^brewery.id and s.status == "published")
    |> where([s], not is_nil(s.assignee_id))
    |> where([s], s.ends_at > ^earliest and s.ends_at <= ^latest)
    |> where([s], s.id not in subquery(from r in TaskReminder, select: r.shift_id))
    |> preload(:assignee)
    |> Repo.all()
    |> Enum.filter(&(DateTime.diff(&1.ends_at, &1.starts_at) >= @shift_end_minutes * 60))
    |> Enum.count(&shift_end_reminder(&1, brewery, now))
  end

  # Record, then notify (as `send_reminder/2`): losing the insert to another
  # scan means it was already handled. True when a reminder was sent.
  defp shift_end_reminder(%Shift{assignee: assignee} = shift, brewery, now) do
    sent_at = DateTime.truncate(now, :second)

    with %{active: true} <- assignee,
         {:ok, _} <-
           Repo.insert(
             TaskReminder.changeset(%TaskReminder{}, %{shift_id: shift.id, sent_at: sent_at})
           ) do
      day = Tasks.today_at(shift.starts_at)
      work = Tasks.open_work(brewery, assignee, day, Tasks.today_at(now))

      if work.tasks == [] and work.daily.unticked == [] do
        false
      else
        Notifications.task_shift_end(assignee, day, work)
        true
      end
    else
      _ -> false
    end
  end
end
