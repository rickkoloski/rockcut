import { useState } from 'react'
import {
  Alert,
  Autocomplete,
  Box,
  Checkbox,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material'
import FormDialog from '../../components/FormDialog'
import { useApiQuery } from '../../hooks/useApiQuery'
import { usePhoneBackCloses } from '../../hooks/useBackCloses'
import api from '../../lib/api'
import { coloradoToday } from '../../lib/tasks'
import { defaultRule, ruleProblem, taskRepeatParams, type TaskRule } from '../../lib/repeat'
import { ideaError, ideaPath } from '../../lib/ideas'
import type { IdeaBoardEntry, IdeaCard, IdeaListData, IdeaSendOptions, RosterEntry } from '../../lib/types'
import RepeatFields from '../tasks/RepeatFields'

interface Props {
  board: IdeaBoardEntry
  card: IdeaCard
  lists: IdeaListData[]
  onClose: () => void
  /** Sent: what the toast says. */
  onSent: (message: string) => void
}

type Then = 'stay' | 'move' | 'archive'

/**
 * D53 §4.7 Send to task list. The task board (a department card's own; a
 * Company card picks from the person's boards), the people (the card's who
 * belong there; the others "left off"), the day (the card's due date, Today
 * when it's past, else Future), Repeat (one task only), how the checklist
 * goes, and what happens to the card. Warns when the card is already on a
 * task list.
 */
export default function SendDialog({ board, card, lists, onClose, onSent }: Props) {
  usePhoneBackCloses(true, onClose)
  const { data: options, isError, error } = useApiQuery<IdeaSendOptions>(
    ['idea-send-options', board.key, card.id],
    ideaPath(board.key, 'cards', card.id, 'send_to_tasks'),
    undefined,
    { staleTime: 0, gcTime: 0 },
  )
  const { data: roster = [] } = useApiQuery<RosterEntry[]>(['roster'], '/api/roster')

  if (!options)
    return (
      <FormDialog open onClose={onClose} title="Send to task list" onSubmit={() => {}} loading={!isError} error={isError ? ideaError(error) : null} testId="idea-send-dialog">
        {!isError && <CircularProgress />}
      </FormDialog>
    )
  return <SendForm board={board} card={card} lists={lists} options={options} roster={roster} onClose={onClose} onSent={onSent} />
}

function SendForm({ board, card, lists, options, roster, onClose, onSent }: Props & { options: IdeaSendOptions; roster: RosterEntry[] }) {
  const today = coloradoToday()
  const [dept, setDept] = useState(options.departments[0]?.key ?? '')
  const current = options.departments.find((d) => d.key === dept)
  const [assignees, setAssignees] = useState<number[]>(current?.assignee_ids ?? [])
  const [noDay, setNoDay] = useState(options.due_on === null)
  const [day, setDay] = useState(options.due_on ?? today)
  const [checklist, setChecklist] = useState<'notes' | 'per_item'>('notes')
  const [rule, setRule] = useState<TaskRule>(() => defaultRule(options.due_on ?? today))
  const [then, setThen] = useState<Then>('stay')
  const [thenList, setThenList] = useState<number | ''>(lists.find((l) => l.name === 'Done' && l.id !== card.list.id)?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const members = roster.filter((r) => r.departments.includes(dept))
  const people = [...members, ...roster.filter((r) => assignees.includes(r.id) && !members.some((m) => m.id === r.id))]
  const nameOf = (id: number) => roster.find((r) => r.id === id)?.name ?? 'Someone'
  const perItem = checklist === 'per_item'
  const repeats = !perItem && !noDay && rule.frequency !== 'never'
  const otherLists = lists.filter((l) => l.id !== card.list.id && (board.manage || !l.locked))

  const pickDept = (key: string) => {
    setDept(key)
    setAssignees(options.departments.find((d) => d.key === key)?.assignee_ids ?? [])
  }

  const submit = async () => {
    if (!dept) return setProblem('Choose a task board')
    if (!noDay && !day) return setProblem('Pick a day, or No day (Future)')
    if (repeats) {
      const why = ruleProblem(rule)
      if (why) return setProblem(why)
    }
    if (then === 'move' && thenList === '') return setProblem('Choose the list to move it to')
    setSaving(true)
    setProblem(null)
    try {
      const res = await api.post<{ tasks: unknown[] }>(ideaPath(board.key, 'cards', card.id, 'send_to_tasks'), {
        department: dept,
        assignee_ids: assignees,
        due_on: noDay ? null : day,
        checklist,
        then,
        ...(then === 'move' ? { then_list_id: thenList } : {}),
        ...(repeats ? taskRepeatParams(rule) : {}),
      })
      const n = res.data.tasks.length
      const name = options.departments.find((d) => d.key === dept)?.name ?? ''
      onSent(n === 1 ? `Sent to the ${name} task list` : `Sent ${n} tasks to the ${name} task list`)
    } catch (err) {
      setProblem(ideaError(err))
    } finally {
      setSaving(false)
    }
  }

  if (options.departments.length === 0)
    return (
      <FormDialog open onClose={onClose} title="Send to task list" onSubmit={onClose} testId="idea-send-dialog" submitLabel="OK">
        <Alert severity="info">You aren't on a department's task board, so there's nowhere to send this card.</Alert>
      </FormDialog>
    )

  const leftOff = current?.left_off ?? []

  return (
    <FormDialog open onClose={onClose} title="Send to task list" onSubmit={submit} loading={saving} error={problem} testId="idea-send-dialog" submitLabel="Send">
      {options.already_sent && (
        <Alert severity="warning" sx={{ py: 0 }} data-testid="idea-send-already">
          Already on the task list. Sending makes another task.
        </Alert>
      )}
      <TextField
        select
        label="Task board"
        value={dept}
        onChange={(e) => pickDept(e.target.value)}
        disabled={options.departments.length === 1}
        slotProps={{ select: { SelectDisplayProps: { 'data-testid': 'idea-send-board' } as object } }}
      >
        {options.departments.map((d) => (
          <MenuItem key={d.key} value={d.key} data-testid={`idea-send-board-${d.key}`}>
            {d.name}
          </MenuItem>
        ))}
      </TextField>
      <Box>
        <Autocomplete
          multiple
          options={people.map((p) => p.id)}
          value={assignees}
          getOptionLabel={(id) => nameOf(id)}
          onChange={(_, v) => setAssignees(v)}
          filterSelectedOptions
          renderInput={(params) => <TextField {...params} label="Assigned to" placeholder={assignees.length ? '' : 'Anyone'} />}
          data-testid="idea-send-people"
        />
        {leftOff.length > 0 && (
          <Typography variant="caption" color="text.secondary" data-testid="idea-send-left-off">
            {leftOff.map((p) => p.name).join(', ')}: not in {current?.name}, left off
          </Typography>
        )}
      </Box>
      <Box>
        <TextField
          type="date"
          label="Day"
          value={noDay ? '' : day}
          onChange={(e) => setDay(e.target.value)}
          disabled={noDay}
          fullWidth
          helperText={options.due_on && card.due_on && card.due_on < today && !noDay ? 'The card was due before today' : undefined}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'idea-send-day' } }}
        />
        <FormControlLabel
          control={<Checkbox checked={noDay} onChange={(e) => setNoDay(e.target.checked)} slotProps={{ input: { 'data-testid': 'idea-send-no-day' } as object }} />}
          label="No day (Future)"
        />
      </Box>
      {options.checklist.total > 0 && (
        <FormControl>
          <FormLabel>Checklist ({options.checklist.open} open)</FormLabel>
          <RadioGroup value={checklist} onChange={(e) => setChecklist(e.target.value as 'notes' | 'per_item')}>
            <FormControlLabel value="notes" control={<Radio data-testid="idea-send-checklist-notes" />} label="One task; the checklist goes in its notes" />
            <FormControlLabel
              value="per_item"
              disabled={options.checklist.open === 0}
              control={<Radio data-testid="idea-send-checklist-per-item" />}
              label={`One task per open item (${options.checklist.open})`}
            />
          </RadioGroup>
        </FormControl>
      )}
      {!perItem ? (
        <RepeatFields rule={rule} day={noDay ? today : day} disabled={noDay} inSeries={false} onChange={setRule} />
      ) : (
        <Typography variant="caption" color="text.secondary">
          Repeat works with one task only.
        </Typography>
      )}
      <FormControl>
        <FormLabel>Then</FormLabel>
        <RadioGroup value={then} onChange={(e) => setThen(e.target.value as Then)}>
          <FormControlLabel value="stay" control={<Radio data-testid="idea-send-then-stay" />} label="Leave the card where it is" />
          {otherLists.length > 0 && (
            <FormControlLabel value="move" control={<Radio data-testid="idea-send-then-move" />} label="Move the card to a list" />
          )}
          {then === 'move' && (
            <TextField
              select
              size="small"
              label="List"
              value={thenList}
              onChange={(e) => setThenList(Number(e.target.value))}
              sx={{ ml: 4, mb: 1, maxWidth: 280 }}
              slotProps={{ select: { SelectDisplayProps: { 'data-testid': 'idea-send-then-list' } as object } }}
            >
              {otherLists.map((l) => (
                <MenuItem key={l.id} value={l.id}>
                  {l.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          <FormControlLabel value="archive" control={<Radio data-testid="idea-send-then-archive" />} label="Archive the card" />
        </RadioGroup>
      </FormControl>
    </FormDialog>
  )
}
