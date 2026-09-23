defmodule RockcutApi.Reminders do
  @moduledoc """
  Shift reminders (D22): find published, assigned shifts starting within the lead
  window and send each assignee a one-time reminder. Idempotent — a small ledger
  (`shift_reminders`) prevents re-sending on the next scan.
  """
  import Ecto.Query
  require Logger
  alias RockcutApi.{Repo, Notifications}
  alias RockcutApi.Scheduling.Shift
  alias RockcutApi.Reminders.ShiftReminder

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
end
