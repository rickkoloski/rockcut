import { useEffect, useState } from 'react'
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'
import api from '../../lib/api'
import { addDaysKey } from '../../lib/datetime'
import { daysBetween } from '../../lib/gantt'
import { MAX_REPEAT_COUNT, ruleFromTaskSeries, taskRepeatParams, type TaskRule } from '../../lib/repeat'
import { boardPath, formatTaskDay, taskSaveError } from '../../lib/tasks'
import type { TaskBoardEntry, TaskCardData, TaskSeriesData } from '../../lib/types'
import { usePhoneBackCloses } from '../../hooks/useBackCloses'

interface Props {
  board: TaskBoardEntry
  /** The series' last occurrence (`series_last`), done or not. */
  card: TaskCardData
  /** True right after it was checked off: "That was the last …". */
  justDone?: boolean
  onClose: () => void
  /** "Pick a new end…": Edit series, where Ends takes a date, a count or Never. */
  onPickEnd: (card: TaskCardData) => void
  onExtended: (message: string) => void
}

/**
 * D52: the last occurrence of a series that ends (on a date or after N times)
 * offers to extend it, after it's checked off or from its menu. "Same again"
 * runs it as long again: twice the count, or the end moved by the span from
 * its start to its end. It's an Ends-only change (D42 §2.6), so it adds the
 * new dates and removes nothing.
 */
export default function ExtendSeriesDialog({ board, card, justDone, onClose, onPickEnd, onExtended }: Props) {
  usePhoneBackCloses(true, onClose)
  const [series, setSeries] = useState<TaskSeriesData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let live = true
    api
      .get<{ data: TaskSeriesData }>(boardPath(board.key, 'tasks', card.id, 'series'))
      .then(({ data }) => live && setSeries(data.data))
      .catch((err) => live && setError(taskSaveError(err, board)))
    return () => {
      live = false
    }
  }, [board, card.id])

  const rule = series ? ruleFromTaskSeries(series) : null
  const again = rule ? sameAgain(rule) : null
  const ended = !rule ? '' : rule.ends === 'count' ? `after ${rule.count} times` : rule.ends === 'until' ? `on ${formatTaskDay(rule.until)}` : ''

  const extend = async () => {
    if (!again) return
    setSaving(true)
    setError(null)
    try {
      await api.patch(boardPath(board.key, 'tasks', card.id), { ...taskRepeatParams(again.rule), scope: 'following' })
      onExtended(`${card.title}: extended, ${again.label}.`)
    } catch (err) {
      setError(taskSaveError(err, board))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth data-testid="extend-series-dialog">
      <DialogTitle>Extend the series?</DialogTitle>
      <DialogContent>
        {!series && !error && <CircularProgress size={24} />}
        {series && (
          <DialogContentText data-testid="extend-series-text">
            {justDone ? 'That was' : 'This is'} the last “{card.title}” in its series{ended && ` (it ends ${ended})`}.
          </DialogContentText>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose} data-testid="extend-series-not-now">
          Not now
        </Button>
        <Button onClick={() => onPickEnd(card)} disabled={!series} data-testid="extend-series-pick">
          Pick a new end…
        </Button>
        <Button variant="contained" onClick={extend} disabled={!again || saving} data-testid="extend-series-again">
          {again ? `Same again: ${again.label}` : 'Same again'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** As long again: "another 12 times" (capped at the count limit), or "to Mon 4/27". */
function sameAgain(rule: TaskRule): { rule: TaskRule; label: string } | null {
  if (rule.ends === 'count') {
    const n = Number(rule.count)
    const total = Math.min(n * 2, MAX_REPEAT_COUNT)
    if (!(total > n)) return null
    return { rule: { ...rule, count: String(total) }, label: `another ${total - n} times` }
  }
  if (rule.ends === 'until' && rule.until >= rule.startDate) {
    const until = addDaysKey(rule.until, Math.max(daysBetween(rule.startDate, rule.until), 1))
    return { rule: { ...rule, until }, label: `to ${formatTaskDay(until)}` }
  }
  return null
}
