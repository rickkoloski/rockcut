import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import FormDialog from '../../components/FormDialog'
import ConfirmDialog from '../../components/ConfirmDialog'
import DecimalInput from '../../components/DecimalInput'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiCreate, useApiDelete, useApiUpdate } from '../../hooks/useApiMutation'
import { usePhoneBackCloses } from '../../hooks/useBackCloses'
import { httpStatus } from '../../lib/notFound'
import parseApiError from '../../lib/parseApiError'
import { parseDecimal } from '../../lib/brewingUnits'
import { FUTURE_DATE } from '../../lib/inventory'
import { WRAP_ITEM, WRAP_SELECT } from '../../lib/ingredientFeatures'
import { coloradoToday } from '../../lib/tasks'
import { BRINK_KEYS, beforeHarvestText, cellsText, emptyWeightText, entryAmountText, lbText, readLb, shortDate, yeastText } from '../../lib/yeast'
import type { YeastBatch, YeastBrink, YeastHistoryRecord } from '../../lib/types'


/** The empty weight beside an lb box, with what's on hand (decision 8: shown, never subtracted). */
const lbHelper = (brink: YeastBrink, extra?: string | null) => [extra, emptyWeightText(brink)].filter(Boolean).join(' · ') || undefined

function DateField({ value, onChange, testId, min, error }: { value: string; onChange: (v: string) => void; testId: string; min?: string | null; error?: string | null }) {
  return (
    <TextField
      label="Date"
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required
      fullWidth
      error={!!error}
      helperText={error ?? undefined}
      slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: min ?? undefined, max: coloradoToday(), 'data-testid': testId } }}
    />
  )
}

/** A stale save (409): the brinks are refetched so a retry sees the change. */
function useBrinkWrite(path: string) {
  const qc = useQueryClient()
  const write = useApiCreate<YeastBrink>(path, { invalidateKeys: BRINK_KEYS })
  const send = async (body: Record<string, unknown>, setError: (e: string) => void, onDone: () => void) => {
    try {
      await write.mutateAsync(body)
      onDone()
    } catch (err) {
      if (httpStatus(err) === 409) await Promise.all(BRINK_KEYS.map((k) => qc.invalidateQueries({ queryKey: k })))
      setError(parseApiError(err))
    }
  }
  return { send, pending: write.isPending }
}

/** D64 §6.4: pitch lb from a brink into an open batch. */
export function PitchBrinkDialog({ brink, onClose }: { brink: YeastBrink; onClose: () => void }) {
  const { data: batches = [], isLoading } = useApiList<YeastBatch>(['yeast_batches'], '/api/yeast/batches')
  const [date, setDate] = useState(coloradoToday())
  const [batchId, setBatchId] = useState<number | ''>('')
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [version] = useState(brink.yeast?.lock_version)
  const { send, pending } = useBrinkWrite(`/api/yeast/brinks/${brink.id}/pitch`)
  const onHand = Number(brink.yeast?.on_hand_lb ?? 0)
  const lb = readLb(text, { max: onHand, brink: brink.name })
  const early = beforeHarvestText(brink, date)
  const open = batches.filter((b) => b.open)

  const submit = async () => {
    if (!batchId) return setError('Pick the batch')
    if (!lb.lb) return setError(lb.error ?? 'Enter the weight in lb')
    if (date > coloradoToday()) return setError(FUTURE_DATE)
    await send({ occurred_on: date, batch_id: batchId, lb: lb.lb, note: note.trim() || null, lock_version: version }, setError, onClose)
  }

  return (
    <FormDialog open phone onClose={onClose} title={`Pitch from ${brink.name}`} onSubmit={submit} loading={pending} error={error} submitLabel="Pitch" submitDisabled={isLoading || !!lb.error || !!early} testId="brink-pitch-dialog">
      {brink.yeast && <Typography variant="body2">{`${lbText(brink.yeast.on_hand_lb)} ${yeastText(brink.yeast)}`}</Typography>}
      <DateField value={date} onChange={setDate} testId="brink-pitch-date" min={brink.yeast?.first_harvested_on} error={early} />
      <FormControl fullWidth required>
        <InputLabel id="brink-pitch-batch-label">Batch</InputLabel>
        <Select labelId="brink-pitch-batch-label" label="Batch" value={open.length ? batchId : ''} onChange={(e) => setBatchId(e.target.value as number)} sx={WRAP_SELECT} data-testid="brink-pitch-batch">
          {open.map((b) => (
            <MenuItem key={b.id} value={b.id} sx={WRAP_ITEM}>
              {b.label}
            </MenuItem>
          ))}
        </Select>
        {!isLoading && open.length === 0 && <FormHelperText>No open batches</FormHelperText>}
      </FormControl>
      <DecimalInput
        decimals={2}
        label="Yeast weight (lb)"
        value={text}
        onChange={setText}
        required
        fullWidth
        error={!!lb.error}
        helperText={lb.error ?? lbHelper(brink, `On hand ${lbText(onHand)}`)}
        slotProps={{ htmlInput: { 'data-testid': 'brink-pitch-lb' } }}
      />
      <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} fullWidth slotProps={{ htmlInput: { 'data-testid': 'brink-pitch-note' } }} />
    </FormDialog>
  )
}

type HistoryCount = YeastHistoryRecord['counts'][number]

/**
 * D64 §4.7: a cell count (ticks the brink's Count task). From History (lead
 * decisions 7, gap 15) it edits `count`, on a record first harvested on `first`.
 */
export function CountBrinkDialog({ brink, count, first, onClose }: { brink: YeastBrink; count?: HistoryCount; first?: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [date, setDate] = useState(count?.counted_on ?? coloradoToday())
  const [cells, setCells] = useState(count ? String(Number(count.viable_millions_per_ml)) : '')
  const [pct, setPct] = useState(count ? String(Number(count.viability_pct)) : '')
  const [note, setNote] = useState(count?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const create = useApiCreate('/api/yeast/counts', { invalidateKeys: BRINK_KEYS })
  const update = useApiUpdate((id) => `/api/yeast/counts/${id}`, { invalidateKeys: BRINK_KEYS })
  const min = count ? first : brink.yeast?.first_harvested_on
  const c = parseDecimal(cells, 1)
  const v = parseDecimal(pct, 1)
  // The API checks a count's day when it's given or changed.
  const early = date === count?.counted_on ? null : beforeHarvestText({ name: brink.name, yeast: min ? { first_harvested_on: min } : null }, date)
  const pctError = v.ok && v.value != null && Number(v.value) > 100 ? 'At most 100%' : null

  const submit = async () => {
    if (!c.ok || !c.value || Number(c.value) <= 0) return setError('Enter the viable cells (more than 0)')
    if (!v.ok || v.value == null) return setError('Enter the viability')
    if (pctError) return setError(pctError)
    if (date > coloradoToday()) return setError(FUTURE_DATE)
    const body = { counted_on: date, viable_millions_per_ml: c.value, viability_pct: v.value, note: note.trim() || null }
    try {
      if (count) await update.mutateAsync({ id: count.id, ...body })
      else await create.mutateAsync({ brink_id: brink.id, ...body })
      onClose()
    } catch (err) {
      // Pitched or deleted since: History shows it as it is now.
      if (count) await qc.invalidateQueries({ queryKey: ['yeast_brink_history'] })
      setError(parseApiError(err))
    }
  }

  return (
    <FormDialog open phone onClose={onClose} title={`${count ? 'Edit' : 'Add'} count · ${brink.name}`} onSubmit={submit} loading={create.isPending || update.isPending} error={error} submitDisabled={!c.ok || !v.ok || !!pctError || !!early} testId="brink-count-dialog">
      <DateField value={date} onChange={setDate} testId="brink-count-date" min={min} error={early} />
      <DecimalInput decimals={1} label="Viable cells (millions per mL)" value={cells} onChange={setCells} required fullWidth slotProps={{ htmlInput: { 'data-testid': 'brink-count-cells' } }} />
      <DecimalInput decimals={1} label="Viability (%)" value={pct} onChange={setPct} required fullWidth error={!!pctError} helperText={pctError ?? undefined} slotProps={{ htmlInput: { 'data-testid': 'brink-count-pct' } }} />
      <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} fullWidth slotProps={{ htmlInput: { 'data-testid': 'brink-count-note' } }} />
    </FormDialog>
  )
}

/** D64 §6.3: Adjust weight: the yeast weight now (0 empties it, as a dump does). */
export function AdjustBrinkDialog({ brink, onClose }: { brink: YeastBrink; onClose: () => void }) {
  const [date, setDate] = useState(coloradoToday())
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [version] = useState(brink.yeast?.lock_version)
  const { send, pending } = useBrinkWrite(`/api/yeast/brinks/${brink.id}/adjust`)
  const lb = readLb(text, { zeroOk: true })
  const early = beforeHarvestText(brink, date)

  const submit = async () => {
    if (lb.lb == null) return setError(lb.error ?? 'Enter the yeast weight now in lb')
    if (date > coloradoToday()) return setError(FUTURE_DATE)
    await send({ occurred_on: date, weight_lb: lb.lb, note: note.trim() || null, lock_version: version }, setError, onClose)
  }

  return (
    <FormDialog open phone onClose={onClose} title={`Adjust weight · ${brink.name}`} onSubmit={submit} loading={pending} error={error} submitDisabled={!!lb.error || !!early} testId="brink-adjust-dialog">
      <DateField value={date} onChange={setDate} testId="brink-adjust-date" min={brink.yeast?.first_harvested_on} error={early} />
      <DecimalInput
        decimals={2}
        label="Yeast weight now (lb)"
        value={text}
        onChange={setText}
        required
        fullWidth
        error={!!lb.error}
        helperText={lb.error ?? lbHelper(brink, `Now ${lbText(brink.yeast?.on_hand_lb)}; 0 empties it`)}
        slotProps={{ htmlInput: { 'data-testid': 'brink-adjust-lb' } }}
      />
      <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} fullWidth slotProps={{ htmlInput: { 'data-testid': 'brink-adjust-note' } }} />
    </FormDialog>
  )
}

/** D64 §6.3: Dump brink (confirm, with a note): it empties, is marked dirty, and "Clean YB2" is added. */
export function DumpBrinkDialog({ brink, onClose }: { brink: YeastBrink; onClose: () => void }) {
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [version] = useState(brink.yeast?.lock_version)
  const { send, pending } = useBrinkWrite(`/api/yeast/brinks/${brink.id}/dump`)
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={() => send({ occurred_on: coloradoToday(), note: note.trim() || null, lock_version: version }, setError, onClose)}
      title={`Dump ${brink.name}`}
      message={`Dump the ${lbText(brink.yeast?.on_hand_lb)} in ${brink.name}? It's marked dirty and "Clean ${brink.name}" goes on the Brewery board.`}
      confirmLabel="Dump"
      loading={pending}
      testId="brink-dump-dialog"
    >
      <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} fullWidth sx={{ mt: 2 }} slotProps={{ htmlInput: { 'data-testid': 'brink-dump-note' } }} />
      {error && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }} role="alert">
          {error}
        </Typography>
      )}
    </ConfirmDialog>
  )
}

/** D64 §6.3: Mark clean (a dirty brink): clears the mark and ticks "Clean YB2". */
export function CleanBrinkDialog({ brink, onClose }: { brink: YeastBrink; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const { send, pending } = useBrinkWrite(`/api/yeast/brinks/${brink.id}/clean`)
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={() => send({}, setError, onClose)}
      title={`Mark ${brink.name} clean`}
      message={`${brink.name} is clean? ${brink.clean_due ? `"Clean ${brink.name}" on the Brewery board is ticked too.` : ''}`}
      confirmLabel="Mark clean"
      confirmColor="primary"
      loading={pending}
      testId="brink-clean-dialog"
    >
      {error && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }} role="alert">
          {error}
        </Typography>
      )}
    </ConfirmDialog>
  )
}

const KIND_LABELS: Record<string, string> = { harvested: 'Harvested', pitched: 'Pitched', dumped: 'Dumped', adjusted: 'Adjusted' }

type HistoryEntry = YeastHistoryRecord['entries'][number]

/** "Remove the pitch of 10 lb into Galactic #44 on 11/22? The 10 lb go back in YB2." */
function removeQuestion(e: HistoryEntry, brink: string): string {
  const lb = lbText(Math.abs(Number(e.quantity_lb)))
  const what = `${e.kind === 'pitched' ? 'pitch' : e.kind === 'dumped' ? 'dump' : 'adjustment'} of ${lb}${e.batch ? ` into ${e.batch}` : ''} on ${shortDate(e.occurred_on)}`
  const after =
    e.kind === 'pitched' ? `The ${lb} go back in ${brink}.` : e.kind === 'dumped' ? `The yeast goes back in ${brink}, and it's no longer marked dirty.` : `${brink}'s weight goes back to what it was.`
  return `Remove the ${what}? ${after}`
}

/**
 * D64 §6.3: a brink's records, newest first, each with its entries and
 * counts. Stop 3 (spec §8, A8): Remove on a mistaken pitch, dump or
 * adjustment (the record's latest, by its maker or a Brewery manager; the
 * API decides and says why not). Edit and Delete on a count the same way (gap 15).
 */
export function BrinkHistoryDialog({ brink, onClose }: { brink: YeastBrink; onClose: () => void }) {
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const { data: records = [], isLoading } = useApiList<YeastHistoryRecord>(['yeast_brink_history', brink.id], `/api/yeast/brinks/${brink.id}/history`)
  const [removing, setRemoving] = useState<HistoryEntry | null>(null)
  const [editing, setEditing] = useState<{ count: HistoryCount; first?: string } | null>(null)
  const [deleting, setDeleting] = useState<HistoryCount | null>(null)
  const qc = useQueryClient()
  const removeCount = useApiDelete((id) => `/api/yeast/counts/${id}`, { invalidateKeys: BRINK_KEYS })
  const [removeError, setRemoveError] = useState<string | null>(null)
  const remove = useApiDelete((id) => `/api/yeast/entries/${id}`, { invalidateKeys: BRINK_KEYS })
  usePhoneBackCloses(true, onClose)
  return (
    <Dialog open onClose={onClose} fullScreen={phone} fullWidth maxWidth="sm" data-testid="brink-history-dialog">
      <DialogTitle>History · {brink.name}</DialogTitle>
      <DialogContent>
        {isLoading && <CircularProgress size={24} />}
        {!isLoading && records.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Nothing yet
          </Typography>
        )}
        {records.map((r) => (
          <Paper key={r.id} variant="outlined" sx={{ p: 1.5, mb: 1.5 }} data-testid={`brink-history-record-${r.id}`}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
              <Chip size="small" label={r.status === 'in_brink' ? 'In the brink' : r.status === 'emptied' ? `Emptied ${shortDate(r.emptied_on)}` : 'Voided'} />
              <Typography variant="body2">gen {r.generation}{r.coferment ? ' · co-ferment' : ''}</Typography>
            </Box>
            {r.entries.map((e) => (
              <Box key={e.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }} data-testid={`brink-history-entry-${e.id}`}>
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere', flex: 1 }}>
                  {[
                    shortDate(e.occurred_on),
                    entryAmountText(e, r.entries, KIND_LABELS[e.kind]),
                    e.batch ? (e.kind === 'harvested' ? `from ${e.batch}` : `into ${e.batch}`) : null,
                    e.kind === 'harvested' && e.strains.length ? `${e.strains.join(' + ')} gen ${e.generation}` : null,
                    e.note,
                    e.entered_by ? `${e.entered_by.name}${e.device ? ` · on ${e.device}` : ''}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography>
                {e.can_remove && (
                  <Button
                    size="small"
                    color="error"
                    sx={{ flexShrink: 0, minWidth: 0, py: 0 }}
                    onClick={() => {
                      setRemoveError(null)
                      setRemoving(e)
                    }}
                    data-testid={`brink-history-remove-${e.id}`}
                  >
                    Remove
                  </Button>
                )}
              </Box>
            ))}
            {r.counts.map((c) => (
              <Box key={`c${c.id}`} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }} data-testid={`brink-history-count-${c.id}`}>
                <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere', flex: 1 }}>
                  {`${shortDate(c.counted_on)} · Count ${cellsText(c)}${c.note ? ` · ${c.note}` : ''}${c.entered_by ? ` · ${c.entered_by.name}` : ''}`}
                </Typography>
                {c.can_change && (
                  <>
                    <Button
                      size="small"
                      sx={{ flexShrink: 0, minWidth: 0, py: 0 }}
                      onClick={() => setEditing({ count: c, first: r.entries.filter((e) => e.kind === 'harvested').map((e) => e.occurred_on).sort()[0] })}
                      data-testid={`brink-history-count-edit-${c.id}`}
                    >
                      Edit
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      sx={{ flexShrink: 0, minWidth: 0, py: 0 }}
                      onClick={() => {
                        setRemoveError(null)
                        setDeleting(c)
                      }}
                      data-testid={`brink-history-count-delete-${c.id}`}
                    >
                      Delete
                    </Button>
                  </>
                )}
              </Box>
            ))}
          </Paper>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
      {editing && <CountBrinkDialog brink={brink} {...editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          open
          title="Delete count"
          message={`Delete the ${shortDate(deleting.counted_on)} count (${cellsText(deleting)})? If no other count follows the latest harvest, "Count ${brink.name}" is due again.`}
          confirmLabel="Delete"
          testId="brink-history-count-confirm"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await removeCount.mutateAsync(deleting.id)
              setDeleting(null)
            } catch (err) {
              await qc.invalidateQueries({ queryKey: ['yeast_brink_history'] })
              setRemoveError(parseApiError(err))
            }
          }}
        >
          {removeError && (
            <Typography color="error" variant="body2" sx={{ mt: 1 }} role="alert" data-testid="brink-history-count-error">
              {removeError}
            </Typography>
          )}
        </ConfirmDialog>
      )}
      {removing && (
        <ConfirmDialog
          open
          title="Remove entry"
          message={removeQuestion(removing, brink.name)}
          confirmLabel="Remove"
          testId="brink-history-remove-confirm"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await remove.mutateAsync(removing.id)
              setRemoving(null)
            } catch (err) {
              setRemoveError(parseApiError(err))
            }
          }}
        >
          {removeError && (
            <Typography color="error" variant="body2" sx={{ mt: 1 }} role="alert" data-testid="brink-history-remove-error">
              {removeError}
            </Typography>
          )}
        </ConfirmDialog>
      )}
    </Dialog>
  )
}
