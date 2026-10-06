import { useState, type ChangeEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { Download, UploadFile } from '@mui/icons-material'
import api from '../../lib/api'
import parseApiError from '../../lib/parseApiError'
import { formatBoardDate } from '../../lib/beerBoard'
import type { ImportGroup, ImportGroupItem, ImportPreview, ImportResolution, ImportResult } from '../../lib/types'

const MAX_NAME = 80

interface Props {
  open: boolean
  onClose: () => void
  /** The import landed; `message` is the result line. */
  onDone: (message: string) => void
  /** Download the board as it is now (Replace's "Export first"). */
  onExport: () => Promise<void>
}

type Mode = 'add' | 'replace'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "Imported N, combined M groups, deleted D, skipped K" / "Replaced: N removed, M imported" (§3.6 step 5). */
function resultMessage(mode: Mode, r: ImportResult): string {
  if (mode === 'replace') return `Replaced: ${r.removed} removed, ${r.imported} imported`
  return `Imported ${r.imported}, combined ${plural(r.combined, 'group')}, deleted ${r.deleted}, skipped ${r.skipped}`
}

/** Is a group's choice complete and valid? Confirm waits for every group (§3.6 step 3). */
function resolved(group: ImportGroup, res: ImportResolution | undefined): boolean {
  if (!res) return false
  if (res.choice === 'combine') {
    const name = res.purchaser_name.trim()
    return group.combinable && name.length > 0 && name.length <= MAX_NAME
  }
  return true
}

/**
 * D37 §3.6: Import CSV (owners and Taproom managers). Upload a file and pick
 * Add (default) or Replace → preview (row errors block; New rows; one card per
 * duplicate group with Allow / Combine / Pick) → confirm. Replace also needs
 * `REPLACE` typed. A board that changed since the preview (409) offers
 * Re-preview. Remount with a `key` to start over.
 */
export default function BeerBoardImportDialog({ open, onClose, onDone, onExport }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<Mode>('add')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [resolutions, setResolutions] = useState<Record<string, ImportResolution>>({})
  const [replaceText, setReplaceText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [loading, setLoading] = useState(false)

  const runPreview = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setStale(false)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('mode', mode)
      const { data } = await api.post<{ data: ImportPreview }>('/api/beer_board/import/preview', form)
      setPreview(data.data)
      setResolutions({})
      setReplaceText('')
    } catch (err) {
      setError(parseApiError(err))
    } finally {
      setLoading(false)
    }
  }

  const confirm = async () => {
    if (!preview) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.post<{ data: ImportResult }>('/api/beer_board/import', {
        mode: preview.mode,
        rows: preview.rows,
        resolutions,
        signature: preview.signature,
        file_name: preview.file_name,
      })
      onDone(resultMessage(preview.mode, data.data))
    } catch (err) {
      const e = err as { response?: { status?: number; data?: { errors?: { message: string }[] } } }
      if (e.response?.status === 409) {
        setStale(true)
      } else if (e.response?.data?.errors?.length) {
        setError(e.response.data.errors.map((x) => x.message).join('; '))
      } else {
        setError(parseApiError(err))
      }
    } finally {
      setLoading(false)
    }
  }

  const setResolution = (key: string, res: ImportResolution) => setResolutions((r) => ({ ...r, [key]: res }))

  const choose = (group: ImportGroup, choice: ImportResolution['choice']) => {
    if (choice === 'allow') setResolution(group.key, { choice })
    if (choice === 'combine') setResolution(group.key, { choice, purchaser_name: group.combined_purchaser })
    if (choice === 'pick') setResolution(group.key, { choice, keep: group.items.map((i) => i.id) })
  }

  const blocked = !!preview && preview.errors.length > 0
  const allResolved = !!preview && preview.groups.every((g) => resolved(g, resolutions[g.key]))
  const replaceOk = preview?.mode !== 'replace' || replaceText === 'REPLACE'
  const canConfirm = !!preview && !blocked && !stale && allResolved && replaceOk && !loading

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="md" fullWidth data-testid="import-dialog">
      <DialogTitle>Import CSV</DialogTitle>
      {/* Children keep their height; the dialog scrolls instead of squeezing the cards. */}
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important', '& > *': { flexShrink: 0 } }}>
        {error && (
          <Alert severity="error" data-testid="import-error">
            {error}
          </Alert>
        )}

        {!preview ? (
          <>
            <Typography variant="body2" color="text.secondary">
              Columns: For, Bought by, Beers, and optionally Moved off board (YYYY-MM-DD). A file you exported
              from this page works as is.
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Button component="label" variant="outlined" startIcon={<UploadFile />}>
                Choose file
                <input
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  data-testid="import-file"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)}
                />
              </Button>
              <Typography data-testid="import-file-name">{file?.name ?? 'No file chosen'}</Typography>
            </Box>
            <RadioGroup value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <FormControlLabel
                value="add"
                control={<Radio slotProps={{ input: { 'data-testid': 'import-mode-add' } as object }} />}
                label="Add to the board"
              />
              <FormControlLabel
                value="replace"
                control={<Radio slotProps={{ input: { 'data-testid': 'import-mode-replace' } as object }} />}
                label="Replace the whole board"
              />
            </RadioGroup>
          </>
        ) : (
          <PreviewBody
            preview={preview}
            resolutions={resolutions}
            choose={choose}
            setResolution={setResolution}
            replaceText={replaceText}
            setReplaceText={setReplaceText}
            onExport={onExport}
          />
        )}

        {stale && (
          <Alert
            severity="warning"
            data-testid="import-stale"
            action={
              <Button color="inherit" size="small" onClick={runPreview} disabled={loading} data-testid="import-repreview">
                Re-preview
              </Button>
            }
          >
            The board changed since your preview. Nothing was imported.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        {preview && (
          <Button
            onClick={() => {
              setPreview(null)
              setStale(false)
              setError(null)
            }}
            disabled={loading}
            data-testid="import-back"
          >
            Back
          </Button>
        )}
        {!preview ? (
          <Button variant="contained" onClick={runPreview} disabled={!file || loading} data-testid="import-preview">
            {loading ? <CircularProgress size={20} /> : 'Preview'}
          </Button>
        ) : (
          <Button
            variant="contained"
            color={preview.mode === 'replace' ? 'error' : 'primary'}
            onClick={confirm}
            disabled={!canConfirm}
            data-testid="import-confirm"
          >
            {loading ? <CircularProgress size={20} /> : preview.mode === 'replace' ? 'Replace the board' : 'Import'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

interface PreviewProps {
  preview: ImportPreview
  resolutions: Record<string, ImportResolution>
  choose: (group: ImportGroup, choice: ImportResolution['choice']) => void
  setResolution: (key: string, res: ImportResolution) => void
  replaceText: string
  setReplaceText: (s: string) => void
  onExport: () => Promise<void>
}

function PreviewBody({ preview, resolutions, choose, setResolution, replaceText, setReplaceText, onExport }: PreviewProps) {
  const [exporting, setExporting] = useState(false)

  if (preview.errors.length > 0) {
    return (
      <Alert severity="error" data-testid="import-errors">
        <Typography fontWeight={600}>
          {preview.file_name} can't be imported. Fix the file and upload it again.
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          {preview.errors.map((e, i) => (
            <li key={i} data-testid="import-error-row">
              {e.row ? `Row ${e.row}: ` : ''}
              {e.message}
            </li>
          ))}
        </Box>
      </Alert>
    )
  }

  return (
    <>
      {preview.mode === 'replace' && (
        <Alert severity="warning" data-testid="import-replace-summary">
          <Typography>
            This deletes all {plural(preview.board.count, 'entry', 'entries')} on the board (total{' '}
            {plural(preview.board.beers, 'beer')}) and imports {preview.rows.length}.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 1.5, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              startIcon={<Download />}
              disabled={exporting}
              onClick={async () => {
                setExporting(true)
                try {
                  await onExport()
                } finally {
                  setExporting(false)
                }
              }}
              data-testid="import-export-first"
            >
              Export first
            </Button>
            <TextField
              size="small"
              label="Type REPLACE to confirm"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              autoComplete="off"
              slotProps={{ htmlInput: { 'data-testid': 'import-replace-text' }, inputLabel: { shrink: true } }}
            />
          </Box>
        </Alert>
      )}

      {preview.new.length > 0 && (
        <Box data-testid="import-new">
          <Typography variant="subtitle1" fontWeight={600}>
            New ({preview.new.length})
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Row</TableCell>
                <TableCell>For</TableCell>
                <TableCell>Bought by</TableCell>
                <TableCell align="right">Beers</TableCell>
                <TableCell>Moved off board</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {preview.new.map((r) => (
                <TableRow key={r.row} data-testid="import-new-row">
                  <TableCell>{r.row}</TableCell>
                  <TableCell>{r.recipient_name}</TableCell>
                  <TableCell>{r.purchaser_name}</TableCell>
                  <TableCell align="right">{r.beers}</TableCell>
                  <TableCell>{r.moved_off_board_at ? formatBoardDate(r.moved_off_board_at) : 'Import date'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {preview.groups.length > 0 && (
        <Typography variant="subtitle1" fontWeight={600}>
          Same For name ({preview.groups.length}): choose for each
        </Typography>
      )}
      {preview.groups.map((g, i) => (
        <GroupCard
          key={g.key}
          index={i}
          group={g}
          resolution={resolutions[g.key]}
          choose={(c) => choose(g, c)}
          setResolution={(r) => setResolution(g.key, r)}
        />
      ))}

      {preview.new.length === 0 && preview.groups.length === 0 && (
        <Typography color="text.secondary">Nothing to import.</Typography>
      )}
    </>
  )
}

interface GroupProps {
  index: number
  group: ImportGroup
  resolution: ImportResolution | undefined
  choose: (choice: ImportResolution['choice']) => void
  setResolution: (r: ImportResolution) => void
}

function GroupCard({ index, group, resolution, choose, setResolution }: GroupProps) {
  const tid = `import-group-${index}`
  const pick = resolution?.choice === 'pick' ? resolution : null
  const combine = resolution?.choice === 'combine' ? resolution : null
  const deletes = pick ? group.items.filter((i) => i.source === 'board' && !pick.keep.includes(i.id)).length : 0
  const combineName = combine?.purchaser_name.trim() ?? ''
  const combineError = combine
    ? combineName === ''
      ? 'Bought by is blank'
      : combineName.length > MAX_NAME
        ? `Up to ${MAX_NAME} characters (${combineName.length})`
        : null
    : null

  const toggle = (item: ImportGroupItem, checked: boolean) => {
    if (!pick) return
    const keep = checked ? [...pick.keep, item.id] : pick.keep.filter((k) => k !== item.id)
    setResolution({ choice: 'pick', keep })
  }

  return (
    <Card variant="outlined" data-testid={tid} sx={{ borderColor: resolution ? 'divider' : 'warning.main' }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography fontWeight={600}>
          {group.name}: {plural(group.items.length, 'item')}, {plural(group.total, 'beer')} in all
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 0, listStyle: 'none' }}>
          {group.items.map((item) => (
            <Box
              component="li"
              key={item.id}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minHeight: 40 }}
              data-testid={`${tid}-item`}
            >
              {pick && (
                <Checkbox
                  size="small"
                  checked={pick.keep.includes(item.id)}
                  onChange={(e) => toggle(item, e.target.checked)}
                  slotProps={{ input: { 'aria-label': `Keep ${item.purchaser_name}`, 'data-testid': `import-item-${item.id}` } as object }}
                />
              )}
              <Chip
                size="small"
                label={item.source === 'board' ? 'On the board' : `From the file, row ${item.row}`}
                color={item.source === 'board' ? 'default' : 'primary'}
                variant="outlined"
              />
              <Typography>
                {item.recipient_name} / {item.purchaser_name} / {plural(item.beers, 'beer')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                moved off {item.moved_off_board_at ? formatBoardDate(item.moved_off_board_at) : 'at import'}
              </Typography>
            </Box>
          ))}
        </Box>

        <RadioGroup row value={resolution?.choice ?? ''} onChange={(e) => choose(e.target.value as ImportResolution['choice'])}>
          <FormControlLabel
            value="allow"
            control={<Radio slotProps={{ input: { 'data-testid': `${tid}-allow` } as object }} />}
            label="Allow duplicates"
          />
          <FormControlLabel
            value="combine"
            disabled={!group.combinable}
            control={<Radio slotProps={{ input: { 'data-testid': `${tid}-combine` } as object }} />}
            label={group.combinable ? 'Combine' : 'Combine (over 99)'}
          />
          <FormControlLabel
            value="pick"
            control={<Radio slotProps={{ input: { 'data-testid': `${tid}-pick` } as object }} />}
            label="Pick which remain"
          />
        </RadioGroup>

        {combine && (
          <TextField
            size="small"
            label="Bought by"
            value={combine.purchaser_name}
            onChange={(e) => setResolution({ choice: 'combine', purchaser_name: e.target.value })}
            error={!!combineError}
            helperText={combineError ?? `One entry of ${plural(group.total, 'beer')}`}
            slotProps={{ htmlInput: { 'data-testid': `${tid}-purchaser` } }}
          />
        )}
        {pick && deletes > 0 && (
          <Alert severity="warning" data-testid={`${tid}-warning`}>
            Deletes {plural(deletes, 'entry', 'entries')} on the board
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
