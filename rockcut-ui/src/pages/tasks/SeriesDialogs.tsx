import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { removeLaterWording } from '../../lib/repeat'
import { usePhoneBackCloses } from '../../hooks/useBackCloses'

export type SeriesScope = 'this' | 'following'
export type Changed = 'keep' | 'remove'

interface ScopeProps {
  /** What's being applied: a save or a delete. */
  action: 'save' | 'delete'
  loading?: boolean
  onChoose: (scope: SeriesScope) => void
  onCancel: () => void
}

/**
 * D39 (spec "Changing one", S69): which occurrences a save or delete of a
 * recurring task's occurrence applies to, as D32's events ask.
 */
export function ScopeDialog({ action, loading, onChoose, onCancel }: ScopeProps) {
  usePhoneBackCloses(true, onCancel)
  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth data-testid="series-scope-dialog">
      <DialogTitle>{action === 'delete' ? 'Delete recurring task' : 'Save recurring task'}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          {action === 'delete'
            ? 'Delete just this one, or this one and every later open one? Earlier and finished ones are kept.'
            : 'Change just this one, or this one and every later open one that wasn’t changed on its own? Earlier and finished ones stay as they are.'}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1, px: 3, pb: 2 }}>
        <Button variant="outlined" disabled={loading} onClick={() => onChoose('this')} data-testid="series-scope-this">
          Just this one
        </Button>
        <Button
          variant="contained"
          color={action === 'delete' ? 'error' : 'primary'}
          disabled={loading}
          onClick={() => onChoose('following')}
          data-testid="series-scope-following"
        >
          This and all following
        </Button>
        <Button onClick={onCancel} disabled={loading} data-testid="series-scope-cancel">
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  )
}

interface RemoveProps {
  title: string
  laterOpen: number
  laterChanged: number
  loading?: boolean
  onConfirm: (changed: Changed) => void
  onCancel: () => void
}

/**
 * Decision 2 (Matt, 2026-10-12): before later occurrences are removed (Stop
 * repeating, Delete "This and all following", a rule change). With some
 * changed on their own, the person chooses whether those go too.
 */
export function RemoveLaterDialog({ title, laterOpen, laterChanged, loading, onConfirm, onCancel }: RemoveProps) {
  usePhoneBackCloses(true, onCancel)
  const w = removeLaterWording(laterOpen, laterChanged)
  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth data-testid="remove-later-dialog">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" data-testid="remove-later-message">
          {w.message}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1, px: 3, pb: 2 }}>
        {w.keep && (
          <Button variant="outlined" color="error" disabled={loading} onClick={() => onConfirm('keep')} data-testid="remove-later-keep">
            {w.keep}
          </Button>
        )}
        <Button
          variant="contained"
          color="error"
          disabled={loading}
          onClick={() => onConfirm('remove')}
          data-testid="remove-later-confirm"
        >
          {loading ? <CircularProgress size={20} /> : w.removeAll}
        </Button>
        <Button onClick={onCancel} disabled={loading} data-testid="remove-later-cancel">
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  )
}

interface ExtendProps {
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** D42 §2.6: an Ends-only change that removes nothing: it extends the series. */
export function ExtendDialog({ loading, onConfirm, onCancel }: ExtendProps) {
  usePhoneBackCloses(true, onCancel)
  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth data-testid="extend-series-dialog">
      <DialogTitle>Change when it ends</DialogTitle>
      <DialogContent>
        <Typography variant="body2" data-testid="extend-series-message">
          Extends the series.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading} data-testid="extend-series-cancel">
          Cancel
        </Button>
        <Button variant="contained" disabled={loading} onClick={onConfirm} data-testid="extend-series-confirm">
          {loading ? <CircularProgress size={20} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
