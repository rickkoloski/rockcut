import { useState } from 'react'
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import {
  ArchiveOutlined,
  ArrowDownward,
  ArrowUpward,
  Close,
  DeleteOutline,
  EditOutlined,
  History,
  LockOpenOutlined,
  LockOutlined,
  SendOutlined,
  UnarchiveOutlined,
  Visibility,
  VisibilityOutlined,
} from '@mui/icons-material'
import { useQueryClient } from '@tanstack/react-query'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useBackCloses } from '../../hooks/useBackCloses'
import { useApiQuery } from '../../hooks/useApiQuery'
import useAuth from '../../hooks/useAuth'
import api from '../../lib/api'
import { initials } from '../../lib/tasks'
import {
  IDEA_CARD_KEY,
  LABEL_COLOR_KEYS,
  formatIdeaDate,
  formatIdeaTime,
  ideaError,
  ideaPath,
  labelColor,
  sentChipText,
} from '../../lib/ideas'
import type { IdeaBoardEntry, IdeaCard, IdeaChecklistItem, IdeaLabel, IdeaListData, IdeaNote, IdeaPerson } from '../../lib/types'
import SendDialog from './SendDialog'
import LabelsDialog from './LabelsDialog'
import IdeaHistoryDialog from './IdeaHistoryDialog'

interface Props {
  board: IdeaBoardEntry
  cardId: number
  lists: IdeaListData[]
  labels: IdeaLabel[]
  /** Who can be put on a card here (`GET …/people`). */
  people: IdeaPerson[]
  onClose: () => void
  /** Something on the card changed: the board refetches. */
  onChanged: () => void
  onToast: (message: string) => void
}

const DESCRIPTION_MAX = 10_000
const NOTE_MAX = 2_000

type Created = { inputValue: string; create: true }
type LabelOption = IdeaLabel | Created

/**
 * D53 §4.4 card dialog, at `/boards/<board>/cards/<id>`. Every field saves on
 * its own (title on Enter or leaving it, description with Save, people,
 * due date and labels as they change). Beside them: Watch, Lock (managers),
 * Archive / Restore, Delete for good (managers, archived), Send to task list,
 * the sent tasks' chips, and History. Below: the checklist and the notes
 * timeline, newest first.
 *
 * Read-only for a shared tablet; for a non-manager when the card or its list
 * is locked (notes stay open, decision 14); and for everyone while it's
 * archived (lead decisions 2), apart from Watch and Restore.
 */
export default function IdeaCardDialog({ board, cardId, lists, labels, people, onClose, onChanged, onToast }: Props) {
  const key = board.key
  const theme = useTheme()
  const mode = theme.palette.mode
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const qc = useQueryClient()
  const { user } = useAuth()
  const isDevice = user?.kind === 'device'
  const manage = board.manage && !isDevice
  const queryKey = [IDEA_CARD_KEY, key, cardId]
  const { data: card, isLoading, isError, error } = useApiQuery<IdeaCard>(queryKey, ideaPath(key, 'cards', cardId), undefined, {
    staleTime: 0,
    refetchOnWindowFocus: 'always',
  })

  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [editingLabels, setEditingLabels] = useState(false)
  const [history, setHistory] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Fix cycle 1 gap 2: a description typed but not saved is asked about
  // before the card closes (✕, Escape, the backdrop, back).
  const [descriptionDirty, setDescriptionDirty] = useState(false)
  const [askDiscard, setAskDiscard] = useState(false)
  const requestClose = () => (descriptionDirty ? setAskDiscard(true) : onClose())
  useBackCloses(descriptionDirty && !askDiscard, () => setAskDiscard(true))

  /** A write. A card in the reply replaces the cached one; anything else refetches it. */
  const save = async (write: () => Promise<{ data?: { data?: unknown } } | unknown>, done?: string) => {
    setBusy(true)
    setProblem(null)
    try {
      const res = (await write()) as { data?: { data?: unknown } } | undefined
      const body = res?.data?.data as IdeaCard | undefined
      if (body && typeof body === 'object' && 'checklist_items' in body) qc.setQueryData(queryKey, body)
      else await qc.invalidateQueries({ queryKey })
      onChanged()
      if (done) onToast(done)
      return true
    } catch (err) {
      setProblem(ideaError(err))
      void qc.invalidateQueries({ queryKey })
      return false
    } finally {
      setBusy(false)
    }
  }
  const patch = (body: Record<string, unknown>) => save(() => api.patch(ideaPath(key, 'cards', cardId), body))

  if (!card) {
    return (
      <Dialog open onClose={onClose} fullWidth maxWidth="sm" data-testid="idea-card-dialog">
        <DialogContent>
          {isLoading && <CircularProgress />}
          {isError && <Alert severity="error">{ideaError(error)}</Alert>}
          <Box sx={{ textAlign: 'right', mt: 2 }}>
            <Button onClick={onClose}>Close</Button>
          </Box>
        </DialogContent>
      </Dialog>
    )
  }

  const archived = !!card.archived_at || !!card.list.archived_at
  const locked = card.locked || card.list.locked
  const canWrite = !isDevice
  const canEdit = canWrite && !archived && (!locked || manage)
  const canNote = canWrite && !archived
  const lockedBy = card.locked ? card.locked_by : card.list.locked_by
  const lockedAt = card.locked ? card.locked_at : card.list.locked_at

  return (
    <Dialog open onClose={requestClose} fullWidth maxWidth="md" fullScreen={fullScreen} data-testid="idea-card-dialog" data-card-id={card.id}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pb: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <TitleField key={card.title} title={card.title} disabled={!canEdit || busy} onSave={(title) => patch({ title })} />
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary" data-testid="idea-card-where">
              in {card.list.name}
              {archived && ' · Archived'}
            </Typography>
            <Box sx={{ flex: 1 }} />
            {canWrite && (
              <Tooltip title={card.watching ? 'Stop watching' : 'Watch: hear about every change'}>
                <Button
                  size="small"
                  variant={card.watching ? 'contained' : 'outlined'}
                  startIcon={card.watching ? <Visibility /> : <VisibilityOutlined />}
                  disabled={busy}
                  onClick={() => save(() => (card.watching ? api.delete(ideaPath(key, 'cards', cardId, 'watch')) : api.put(ideaPath(key, 'cards', cardId, 'watch'))))}
                  data-testid="idea-card-watch"
                  aria-pressed={card.watching}
                >
                  {card.watching ? 'Watching' : 'Watch'}
                </Button>
              </Tooltip>
            )}
          </Box>
        </Box>
        <IconButton aria-label="Close" onClick={requestClose} data-testid="idea-card-close" sx={{ mt: -0.5 }}>
          <Close />
        </IconButton>
      </DialogTitle>
      {busy && <LinearProgress sx={{ mx: 3, mt: -0.5 }} />}
      <DialogContent dividers>
        {problem && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setProblem(null)} data-testid="idea-card-error">
            {problem}
          </Alert>
        )}
        {archived && (
          <Alert severity="info" sx={{ mb: 2 }} data-testid="idea-card-archived">
            {card.list.archived_at && !card.archived_at
              ? `Its list, ${card.list.name}, is archived. Restore the list to change this card.`
              : 'This card is archived. Restore it to change it.'}
          </Alert>
        )}
        {locked && !archived && (
          <Alert severity={manage ? 'info' : 'warning'} icon={<LockOutlined />} sx={{ mb: 2 }} data-testid="idea-card-locked">
            {card.locked ? 'Locked' : `Its list is locked`}
            {lockedBy ? ` by ${lockedBy.name}` : ''}
            {lockedAt ? ` · ${formatIdeaDate(lockedAt)}` : ''}.{' '}
            {manage ? 'You can still change it.' : 'Only a manager can change it. Notes stay open.'}
          </Alert>
        )}
        {/* Phone: description, then people, date, labels and actions, then checklist and notes. */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 260px' },
            gridTemplateAreas: { xs: '"desc" "side" "main"', md: '"desc side" "main side"' },
            gridTemplateRows: { md: 'auto 1fr' },
            columnGap: 3,
            rowGap: { xs: 3, md: 0 },
          }}
        >
          <Box sx={{ gridArea: 'desc', minWidth: 0 }}>
            <DescriptionField
              key={card.description ?? ''}
              value={card.description ?? ''}
              disabled={!canEdit || busy}
              onSave={(description) => patch({ description: description || null })}
              onDirty={setDescriptionDirty}
            />
          </Box>
          <Box sx={{ gridArea: 'main', minWidth: 0 }}>
            <Checklist
              items={card.checklist_items}
              disabled={!canEdit || busy}
              onAdd={(text) => save(() => api.post(ideaPath(key, 'cards', cardId, 'checklist'), { text }))}
              onUpdate={(item, body) => save(() => api.patch(ideaPath(key, 'cards', cardId, 'checklist', item.id), body))}
              onRemove={(item) => save(() => api.delete(ideaPath(key, 'cards', cardId, 'checklist', item.id)))}
              onOrder={(ids) => save(() => api.put(ideaPath(key, 'cards', cardId, 'checklist', 'order'), { ids }))}
            />
            <Notes
              notes={card.notes}
              canAdd={canNote && !busy}
              userId={user?.id}
              manage={manage}
              archived={archived}
              readOnly={isDevice}
              onAdd={(body) => save(() => api.post(ideaPath(key, 'cards', cardId, 'notes'), { body }))}
              onEdit={(note, body) => save(() => api.patch(ideaPath(key, 'cards', cardId, 'notes', note.id), { body }))}
              onDelete={(note) => save(() => api.delete(ideaPath(key, 'cards', cardId, 'notes', note.id)))}
            />
          </Box>
          <Box sx={{ gridArea: 'side', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <PeopleField
              card={card}
              people={people}
              disabled={!canEdit || busy}
              onChange={(ids) => patch({ assignee_ids: ids })}
            />
            <TextField
              type="date"
              label="Due date"
              size="small"
              value={card.due_on ?? ''}
              disabled={!canEdit || busy}
              onChange={(e) => patch({ due_on: e.target.value || null })}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'idea-card-due-input' } }}
            />
            <LabelsField
              card={card}
              labels={labels}
              mode={mode}
              disabled={!canEdit || busy}
              onChange={(ids) => patch({ label_ids: ids })}
              onCreate={async (name) => {
                const used = new Set(labels.map((l) => l.color))
                const color = LABEL_COLOR_KEYS.find((c) => !used.has(c)) ?? LABEL_COLOR_KEYS[labels.length % LABEL_COLOR_KEYS.length]
                try {
                  const res = await api.post<{ data: IdeaLabel }>(ideaPath(key, 'labels'), { name, color })
                  await patch({ label_ids: [...card.label_ids, res.data.data.id] })
                } catch (err) {
                  setProblem(ideaError(err))
                }
              }}
              onEdit={manage ? () => setEditingLabels(true) : undefined}
            />
            {card.sent_tasks.length > 0 && (
              <Box data-testid="idea-card-sent">
                <Typography variant="overline" color="text.secondary">
                  Task list
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'flex-start' }}>
                  {card.sent_tasks.map((t) => (
                    <Chip
                      key={t.id}
                      size="small"
                      variant="outlined"
                      color={t.state === 'done' ? 'success' : t.state === 'removed' ? 'default' : 'info'}
                      label={sentChipText(t)}
                      title={t.task_title}
                      sx={{ maxWidth: '100%' }}
                      data-testid={`idea-card-sent-${t.id}`}
                      data-state={t.state}
                    />
                  ))}
                </Box>
              </Box>
            )}
            {canWrite && <Divider />}
            {canWrite && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'stretch' }}>
                {canEdit && (
                  <Button variant="contained" startIcon={<SendOutlined />} onClick={() => setSending(true)} disabled={busy} data-testid="idea-card-send">
                    Send to task list
                  </Button>
                )}
                {manage && !archived && (
                  <Button
                    variant="outlined"
                    startIcon={card.locked ? <LockOpenOutlined /> : <LockOutlined />}
                    disabled={busy}
                    onClick={() => save(() => api.post(ideaPath(key, 'cards', cardId, card.locked ? 'unlock' : 'lock')))}
                    data-testid={card.locked ? 'idea-card-unlock' : 'idea-card-lock'}
                  >
                    {card.locked ? 'Unlock' : 'Lock'}
                  </Button>
                )}
                {!archived && (!locked || manage) && (
                  <Button
                    variant="outlined"
                    startIcon={<ArchiveOutlined />}
                    disabled={busy}
                    onClick={async () => {
                      const ok = await save(() => api.post(ideaPath(key, 'cards', cardId, 'archive')), `Archived "${card.title}"`)
                      if (ok) onClose()
                    }}
                    data-testid="idea-card-archive"
                  >
                    Archive
                  </Button>
                )}
                {card.archived_at && !card.list.archived_at && (!locked || manage) && (
                  <Button
                    variant="outlined"
                    startIcon={<UnarchiveOutlined />}
                    disabled={busy}
                    onClick={() => save(() => api.post(ideaPath(key, 'cards', cardId, 'restore')), `Restored "${card.title}"`)}
                    data-testid="idea-card-restore"
                  >
                    Restore
                  </Button>
                )}
                {manage && card.archived_at && (
                  <Button color="error" variant="outlined" startIcon={<DeleteOutline />} disabled={busy} onClick={() => setConfirmDelete(true)} data-testid="idea-card-delete">
                    Delete for good
                  </Button>
                )}
                {board.history && (
                  <Button startIcon={<History />} onClick={() => setHistory(true)} data-testid="idea-card-history">
                    History
                  </Button>
                )}
              </Box>
            )}
            <Typography variant="caption" color="text.secondary">
              {card.created_by ? `Added by ${card.created_by.name} · ` : ''}
              {formatIdeaDate(card.inserted_at)}
            </Typography>
          </Box>
        </Box>
      </DialogContent>
      {sending && (
        <SendDialog
          board={board}
          card={card}
          lists={lists}
          onClose={() => setSending(false)}
          onSent={(message) => {
            setSending(false)
            void qc.invalidateQueries({ queryKey })
            onChanged()
            onToast(message)
          }}
        />
      )}
      {editingLabels && <LabelsDialog board={board} labels={labels} onClose={() => setEditingLabels(false)} onChanged={() => {
        void qc.invalidateQueries({ queryKey })
        onChanged()
      }} />}
      {history && <IdeaHistoryDialog board={board} card={{ id: card.id, title: card.title }} onClose={() => setHistory(false)} />}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this card for good?"
        message={`"${card.title}" goes, with its checklist, notes and watches. Tasks already sent from it stay on their task lists.`}
        confirmLabel="Delete for good"
        confirmColor="error"
        loading={busy}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          const ok = await save(() => api.delete(ideaPath(key, 'cards', cardId)), `Deleted "${card.title}"`)
          setConfirmDelete(false)
          if (ok) onClose()
        }}
      />
      <ConfirmDialog
        open={askDiscard}
        title="Discard your changes to the description?"
        message="What you typed in the description isn't saved."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onClose={() => setAskDiscard(false)}
        onConfirm={() => {
          setAskDiscard(false)
          setDescriptionDirty(false)
          onClose()
        }}
      />
    </Dialog>
  )
}

function TitleField({ title, disabled, onSave }: { title: string; disabled: boolean; onSave: (title: string) => Promise<boolean> }) {
  const [value, setValue] = useState(title)
  const commit = () => {
    const t = value.trim()
    if (!t) return setValue(title)
    if (t !== title) void onSave(t)
  }
  if (disabled)
    return (
      <Typography variant="h6" component="p" sx={{ overflowWrap: 'anywhere' }} data-testid="idea-card-title">
        {title}
      </Typography>
    )
  return (
    <TextField
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLElement).blur()
        }
        if (e.key === 'Escape') setValue(title)
      }}
      variant="standard"
      fullWidth
      multiline
      slotProps={{
        htmlInput: { maxLength: 200, 'aria-label': 'Title', 'data-testid': 'idea-card-title-input' },
        input: { sx: { fontSize: '1.25rem', fontWeight: 500 } },
      }}
    />
  )
}

function DescriptionField({
  value,
  disabled,
  onSave,
  onDirty,
}: {
  value: string
  disabled: boolean
  onSave: (value: string) => Promise<boolean>
  /** Whether there's typing not saved yet (the dialog asks before closing). */
  onDirty: (dirty: boolean) => void
}) {
  const [draft, setDraft] = useState(value)
  const dirty = draft !== value
  const change = (next: string) => {
    setDraft(next)
    onDirty(next !== value)
  }
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="overline" color="text.secondary" component="h3">
        Description
      </Typography>
      {disabled ? (
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} color={value ? 'text.primary' : 'text.secondary'} data-testid="idea-card-description">
          {value || 'No description.'}
        </Typography>
      ) : (
        <>
          <TextField
            value={draft}
            onChange={(e) => change(e.target.value)}
            placeholder="What's the idea?"
            multiline
            minRows={3}
            fullWidth
            helperText={draft.length > DESCRIPTION_MAX * 0.9 ? `${draft.length}/${DESCRIPTION_MAX}` : undefined}
            slotProps={{ htmlInput: { maxLength: DESCRIPTION_MAX, 'aria-label': 'Description', 'data-testid': 'idea-card-description-input' } }}
          />
          {dirty && (
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Button
                size="small"
                variant="contained"
                onClick={async () => {
                  if (await onSave(draft.trim())) onDirty(false)
                }}
                data-testid="idea-card-description-save"
              >
                Save
              </Button>
              <Button size="small" onClick={() => change(value)}>
                Cancel
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  )
}

function PeopleField({
  card,
  people,
  disabled,
  onChange,
}: {
  card: IdeaCard
  people: IdeaPerson[]
  disabled: boolean
  onChange: (ids: number[]) => void
}) {
  // Someone who left stays on a card that still names them until they're taken off.
  const options = [...people, ...card.assignees.filter((a) => !people.some((p) => p.id === a.id))]
  if (disabled)
    return (
      <Box data-testid="idea-card-people">
        <Typography variant="overline" color="text.secondary">
          People
        </Typography>
        {card.assignees.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No one yet
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {card.assignees.map((p) => (
              <Chip key={p.id} size="small" avatar={<Avatar>{initials(p.name)}</Avatar>} label={p.name} />
            ))}
          </Box>
        )}
      </Box>
    )
  return (
    <Autocomplete
      multiple
      size="small"
      options={options}
      value={card.assignees.map((a) => options.find((o) => o.id === a.id) ?? a)}
      getOptionLabel={(o) => o.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onChange={(_, value) => onChange(value.map((v) => v.id))}
      filterSelectedOptions
      renderInput={(params) => <TextField {...params} label="People" placeholder={card.assignees.length ? '' : 'Add someone'} />}
      data-testid="idea-card-people-input"
    />
  )
}

function LabelsField({
  card,
  labels,
  mode,
  disabled,
  onChange,
  onCreate,
  onEdit,
}: {
  card: IdeaCard
  labels: IdeaLabel[]
  mode: 'light' | 'dark'
  disabled: boolean
  onChange: (ids: number[]) => void
  onCreate: (name: string) => Promise<void>
  onEdit?: () => void
}) {
  const chip = (l: IdeaLabel, props?: Record<string, unknown>) => (
    <Chip
      size="small"
      label={l.name}
      sx={{ bgcolor: labelColor(l.color, mode), color: mode === 'dark' ? '#111' : '#fff', fontWeight: 500 }}
      data-testid={`idea-card-label-${l.id}`}
      {...props}
    />
  )
  const current = card.label_ids.map((id) => labels.find((l) => l.id === id)).filter((l): l is IdeaLabel => !!l)
  return (
    <Box>
      {disabled ? (
        <>
          <Typography variant="overline" color="text.secondary">
            Labels
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {current.length ? current.map((l) => chip(l, { key: l.id })) : <Typography variant="body2" color="text.secondary">None</Typography>}
          </Box>
        </>
      ) : (
        <Autocomplete<LabelOption, true, false, false>
          multiple
          size="small"
          options={labels as LabelOption[]}
          value={current}
          getOptionLabel={(o) => ('create' in o ? `Add the label "${o.inputValue}"` : o.name)}
          isOptionEqualToValue={(a, b) => !('create' in a) && !('create' in b) && a.id === b.id}
          filterSelectedOptions
          // Fix cycle 1 gap 3: Enter takes the highlighted option, "Add the label" included.
          autoHighlight
          filterOptions={(options, state) => {
            const typed = state.inputValue.trim()
            const shown = options.filter((o) => !('create' in o) && o.name.toLowerCase().includes(typed.toLowerCase()))
            const exists = labels.some((l) => l.name.toLowerCase() === typed.toLowerCase())
            return typed && !exists ? [...shown, { inputValue: typed.slice(0, 30), create: true }] : shown
          }}
          onChange={(_, value) => {
            const made = value.find((v): v is Created => 'create' in v)
            if (made) return void onCreate(made.inputValue)
            onChange((value as IdeaLabel[]).map((v) => v.id))
          }}
          renderValue={(value, getItemProps) =>
            value.map((l, index) => {
              const { key, ...rest } = getItemProps({ index })
              return 'create' in l ? null : <span key={key}>{chip(l, rest)}</span>
            })
          }
          renderOption={(props, o) => {
            const { key, ...rest } = props as typeof props & { key: string }
            return (
              <li key={key} {...rest}>
                {'create' in o ? (
                  `Add the label "${o.inputValue}"`
                ) : (
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                    <Box component="span" sx={{ width: 24, height: 10, borderRadius: 5, bgcolor: labelColor(o.color, mode) }} />
                    {o.name}
                  </Box>
                )}
              </li>
            )
          }}
          renderInput={(params) => <TextField {...params} label="Labels" placeholder={current.length ? '' : 'Pick or add one'} />}
          data-testid="idea-card-labels-input"
        />
      )}
      {onEdit && (
        <Button size="small" onClick={onEdit} sx={{ mt: 0.5 }} data-testid="idea-card-edit-labels">
          Edit labels
        </Button>
      )}
    </Box>
  )
}

function Checklist({
  items,
  disabled,
  onAdd,
  onUpdate,
  onRemove,
  onOrder,
}: {
  items: IdeaChecklistItem[]
  disabled: boolean
  onAdd: (text: string) => Promise<boolean>
  onUpdate: (item: IdeaChecklistItem, body: Record<string, unknown>) => Promise<boolean>
  onRemove: (item: IdeaChecklistItem) => Promise<boolean>
  onOrder: (ids: number[]) => Promise<boolean>
}) {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null)
  // A tick shows at once; the saved card replaces it (or a refusal puts it back).
  const [ticking, setTicking] = useState<Record<number, boolean>>({})
  const isDone = (item: IdeaChecklistItem) => ticking[item.id] ?? item.done
  const tick = async (item: IdeaChecklistItem, done: boolean) => {
    setTicking((t) => ({ ...t, [item.id]: done }))
    await onUpdate(item, { done })
    setTicking((t) => {
      const rest = { ...t }
      delete rest[item.id]
      return rest
    })
  }
  const done = items.filter(isDone).length
  const move = (index: number, by: -1 | 1) => {
    const ids = items.map((i) => i.id)
    const [id] = ids.splice(index, 1)
    ids.splice(index + by, 0, id)
    void onOrder(ids)
  }
  const add = async () => {
    const t = text.trim()
    if (!t) return
    if (await onAdd(t)) setText('')
  }
  if (disabled && items.length === 0) return null
  return (
    <Box sx={{ mb: 3 }} data-testid="idea-card-checklist">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="overline" color="text.secondary" component="h3">
          Checklist
        </Typography>
        {items.length > 0 && (
          <Typography variant="caption" color="text.secondary" data-testid="idea-card-checklist-count">
            {done}/{items.length}
          </Typography>
        )}
      </Box>
      {items.length > 0 && <LinearProgress variant="determinate" value={(done / items.length) * 100} sx={{ mb: 1, borderRadius: 1 }} />}
      {items.map((item, index) => (
        <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, '&:hover .item-tools': { opacity: 1 } }} data-testid={`idea-checklist-item-${item.id}`}>
          <Checkbox
            size="small"
            checked={isDone(item)}
            disabled={disabled}
            onChange={(e) => void tick(item, e.target.checked)}
            slotProps={{ input: { 'aria-label': item.text, 'data-testid': `idea-checklist-tick-${item.id}` } as object }}
          />
          {editing?.id === item.id ? (
            <TextField
              size="small"
              autoFocus
              fullWidth
              value={editing.text}
              onChange={(e) => setEditing({ id: item.id, text: e.target.value })}
              onBlur={() => {
                const t = editing.text.trim()
                setEditing(null)
                if (t && t !== item.text) void onUpdate(item, { text: t })
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLElement).blur()
                if (e.key === 'Escape') setEditing(null)
              }}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />
          ) : (
            <Typography
              variant="body2"
              onClick={disabled ? undefined : () => setEditing({ id: item.id, text: item.text })}
              sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', textDecoration: isDone(item) ? 'line-through' : undefined, color: isDone(item) ? 'text.secondary' : undefined, cursor: disabled ? 'default' : 'text' }}
              title={item.done && item.done_by ? `Ticked by ${item.done_by.name}` : undefined}
            >
              {item.text}
            </Typography>
          )}
          {!disabled && (
            <Box className="item-tools" sx={{ display: 'flex', opacity: { xs: 1, md: 0.35 }, flexShrink: 0 }}>
              <IconButton size="small" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUpward fontSize="inherit" />
              </IconButton>
              <IconButton size="small" aria-label="Move down" disabled={index === items.length - 1} onClick={() => move(index, 1)}>
                <ArrowDownward fontSize="inherit" />
              </IconButton>
              <IconButton size="small" aria-label={`Remove ${item.text}`} onClick={() => void onRemove(item)} data-testid={`idea-checklist-remove-${item.id}`}>
                <DeleteOutline fontSize="inherit" />
              </IconButton>
            </Box>
          )}
        </Box>
      ))}
      {!disabled && (
        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Add an item"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void add()
              }
            }}
            slotProps={{ htmlInput: { maxLength: 200, 'aria-label': 'New checklist item', 'data-testid': 'idea-checklist-input' } }}
          />
          <Button variant="outlined" onClick={add} disabled={!text.trim()} data-testid="idea-checklist-add">
            Add
          </Button>
        </Box>
      )}
    </Box>
  )
}

function Notes({
  notes,
  canAdd,
  userId,
  manage,
  archived,
  readOnly,
  onAdd,
  onEdit,
  onDelete,
}: {
  notes: IdeaNote[]
  canAdd: boolean
  userId?: number
  manage: boolean
  archived: boolean
  readOnly: boolean
  onAdd: (body: string) => Promise<boolean>
  onEdit: (note: IdeaNote, body: string) => Promise<boolean>
  onDelete: (note: IdeaNote) => Promise<boolean>
}) {
  const [body, setBody] = useState('')
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(null)
  const [deleting, setDeleting] = useState<IdeaNote | null>(null)
  const add = async () => {
    const t = body.trim()
    if (!t) return
    if (await onAdd(t)) setBody('')
  }
  return (
    <Box data-testid="idea-card-notes">
      <Typography variant="overline" color="text.secondary" component="h3">
        Notes
      </Typography>
      {canAdd && (
        <Box sx={{ mb: 2 }}>
          <TextField
            fullWidth
            multiline
            minRows={2}
            placeholder="Add a note"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            helperText={body.length > NOTE_MAX * 0.9 ? `${body.length}/${NOTE_MAX}` : undefined}
            slotProps={{ htmlInput: { maxLength: NOTE_MAX, 'aria-label': 'New note', 'data-testid': 'idea-note-input' } }}
          />
          <Button size="small" variant="contained" onClick={add} disabled={!body.trim()} sx={{ mt: 1 }} data-testid="idea-note-add">
            Add note
          </Button>
        </Box>
      )}
      {notes.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No notes yet.
        </Typography>
      )}
      {notes.map((n) => {
        const mine = !!userId && n.author_id === userId
        const canEditNote = mine && !archived && !readOnly
        const canDeleteNote = (mine || manage) && !archived && !readOnly
        return (
          <Box key={n.id} sx={{ display: 'flex', gap: 1, mb: 2 }} data-testid={`idea-note-${n.id}`}>
            <Avatar sx={{ width: 28, height: 28, fontSize: 12, mt: 0.25 }}>{initials(n.author?.name ?? '?')}</Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {n.author?.name ?? 'Someone'}
                </Typography>
                <Typography variant="caption" color="text.secondary" data-testid={`idea-note-meta-${n.id}`}>
                  {formatIdeaTime(n.inserted_at)}
                  {n.edited_at ? ' · edited' : ''}
                </Typography>
                <Box sx={{ flex: 1 }} />
                {canEditNote && editing?.id !== n.id && (
                  <IconButton size="small" aria-label="Edit note" onClick={() => setEditing({ id: n.id, body: n.body })} data-testid={`idea-note-edit-${n.id}`}>
                    <EditOutlined fontSize="inherit" />
                  </IconButton>
                )}
                {canDeleteNote && (
                  <IconButton size="small" aria-label="Delete note" onClick={() => setDeleting(n)} data-testid={`idea-note-delete-${n.id}`}>
                    <DeleteOutline fontSize="inherit" />
                  </IconButton>
                )}
              </Box>
              {editing?.id === n.id ? (
                <Box>
                  <TextField
                    fullWidth
                    multiline
                    autoFocus
                    value={editing.body}
                    onChange={(e) => setEditing({ id: n.id, body: e.target.value })}
                    slotProps={{ htmlInput: { maxLength: NOTE_MAX, 'data-testid': `idea-note-edit-input-${n.id}` } }}
                  />
                  <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={!editing.body.trim()}
                      onClick={async () => {
                        if (await onEdit(n, editing.body.trim())) setEditing(null)
                      }}
                      data-testid={`idea-note-save-${n.id}`}
                    >
                      Save
                    </Button>
                    <Button size="small" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </Box>
                </Box>
              ) : (
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} data-testid={`idea-note-body-${n.id}`}>
                  {n.body}
                </Typography>
              )}
            </Box>
          </Box>
        )
      })}
      <ConfirmDialog
        open={!!deleting}
        title="Delete this note?"
        message={deleting ? `"${deleting.body.slice(0, 80)}${deleting.body.length > 80 ? '…' : ''}" by ${deleting.author?.name ?? 'someone'}.` : ''}
        confirmLabel="Delete"
        confirmColor="error"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await onDelete(deleting)
          setDeleting(null)
        }}
      />
    </Box>
  )
}
