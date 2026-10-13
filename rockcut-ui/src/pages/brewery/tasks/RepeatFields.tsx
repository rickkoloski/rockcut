import { Box, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material'
import RepeatIcon from '@mui/icons-material/Repeat'
import {
  MAX_REPEAT_COUNT,
  WEEKDAY_SHORT,
  defaultRule,
  ordinal,
  taskRepeatSummary,
  type MonthRule,
  type RepeatEnds,
  type TaskFrequency,
  type TaskRule,
} from '../../../lib/repeat'

const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const FREQUENCIES: { value: TaskFrequency; label: string }[] = [
  { value: 'never', label: 'Never' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
]

interface Props {
  rule: TaskRule
  /** The day the defaults come from (the task's day, or the occurrence's date). */
  day: string
  /** No day (Future): a recurring task needs a start day (S67). */
  disabled: boolean
  /** An occurrence: it already repeats, so Never isn't offered. */
  inSeries: boolean
  onChange: (rule: TaskRule) => void
}

/**
 * D39 spec §3.10 "Creating one": the Repeat field, the chosen rule's options,
 * Ends, and a summary line. Choosing a frequency starts from the day's
 * defaults ("Weekly on Wed", "Monthly on the 14th").
 */
export default function RepeatFields({ rule, day, disabled, inSeries, onChange }: Props) {
  const set = (patch: Partial<TaskRule>) => onChange({ ...rule, ...patch })
  const choose = (frequency: TaskFrequency) =>
    onChange({ ...defaultRule(day, frequency), startDate: rule.startDate, ends: rule.ends, until: rule.until, count: rule.count })
  const repeats = rule.frequency !== 'never' && !disabled

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }} data-testid="task-repeat-section">
      <TextField
        select
        size="small"
        fullWidth
        label="Repeat"
        value={disabled ? 'never' : rule.frequency}
        onChange={(e) => choose(e.target.value as TaskFrequency)}
        disabled={disabled}
        helperText={disabled ? 'Pick a day to repeat' : undefined}
        slotProps={{
          select: { SelectDisplayProps: { 'data-testid': 'task-repeat-select' } as object },
          formHelperText: { 'data-testid': 'task-repeat-hint' } as object,
        }}
      >
        {FREQUENCIES.filter((f) => !(inSeries && f.value === 'never')).map((f) => (
          <MenuItem key={f.value} value={f.value} data-testid={`task-repeat-option-${f.value}`}>
            {f.label}
          </MenuItem>
        ))}
      </TextField>

      {repeats && rule.frequency === 'weekly' && (
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.5} role="group" aria-label="Repeat on">
            {WEEKDAY_SHORT.map((label, i) => {
              const d = i + 1
              const on = rule.weekdays.includes(d)
              return (
                <Chip
                  key={d}
                  label={label}
                  size="small"
                  color={on ? 'primary' : 'default'}
                  variant={on ? 'filled' : 'outlined'}
                  aria-pressed={on}
                  onClick={() => set({ weekdays: on ? rule.weekdays.filter((x) => x !== d) : [...rule.weekdays, d] })}
                  data-testid={`task-repeat-day-${d}`}
                />
              )
            })}
          </Stack>
          <TextField
            select
            size="small"
            label="How often"
            value={rule.interval}
            onChange={(e) => set({ interval: Number(e.target.value) })}
            slotProps={{ select: { SelectDisplayProps: { 'data-testid': 'task-repeat-interval' } as object } }}
          >
            {[1, 2, 3, 4].map((n) => (
              <MenuItem key={n} value={n} data-testid={`task-repeat-interval-${n}`}>
                {n === 1 ? 'Every week' : n === 2 ? 'Every other week' : `Every ${n} weeks`}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      )}

      {repeats && (rule.frequency === 'monthly' || rule.frequency === 'quarterly') && (
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          <TextField
            select
            size="small"
            label="On"
            value={rule.monthRule}
            onChange={(e) => set({ monthRule: e.target.value as MonthRule })}
            slotProps={{ select: { SelectDisplayProps: { 'data-testid': 'task-repeat-month-rule' } as object } }}
          >
            <MenuItem value="day" data-testid="task-repeat-month-rule-day">
              A day of the month (the {ordinal(rule.dayOfMonth)})
            </MenuItem>
            <MenuItem value="weekday" data-testid="task-repeat-month-rule-weekday">
              A weekday (the {ordinal(rule.weekOfMonth)} {WEEKDAY_LONG[rule.weekday - 1]})
            </MenuItem>
          </TextField>
          {rule.monthRule === 'day' ? (
            <TextField
              select
              size="small"
              label="Day of the month"
              value={rule.dayOfMonth}
              onChange={(e) => set({ dayOfMonth: Number(e.target.value) })}
              helperText={rule.dayOfMonth > 28 ? 'In a shorter month, the last day' : undefined}
              slotProps={{ select: { SelectDisplayProps: { 'data-testid': 'task-repeat-day-of-month' } as object } }}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                <MenuItem key={n} value={n} data-testid={`task-repeat-day-of-month-${n}`}>
                  {ordinal(n)}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <Stack direction="row" spacing={1}>
              <TextField
                select
                size="small"
                label="Which"
                value={rule.weekOfMonth}
                onChange={(e) => set({ weekOfMonth: Number(e.target.value) })}
                sx={{ minWidth: 110 }}
                slotProps={{ select: { SelectDisplayProps: { 'data-testid': 'task-repeat-week' } as object } }}
              >
                {[1, 2, 3, 4, -1].map((n) => (
                  <MenuItem key={n} value={n} data-testid={`task-repeat-week-${n}`}>
                    {n === -1 ? 'Last' : ordinal(n)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Weekday"
                value={rule.weekday}
                onChange={(e) => set({ weekday: Number(e.target.value) })}
                fullWidth
                slotProps={{ select: { SelectDisplayProps: { 'data-testid': 'task-repeat-weekday' } as object } }}
              >
                {WEEKDAY_LONG.map((n, i) => (
                  <MenuItem key={n} value={i + 1} data-testid={`task-repeat-weekday-${i + 1}`}>
                    {n}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          )}
        </Stack>
      )}

      {repeats && (
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              select
              size="small"
              label="Ends"
              value={rule.ends}
              onChange={(e) => set({ ends: e.target.value as RepeatEnds })}
              sx={{ minWidth: 160 }}
              slotProps={{ select: { SelectDisplayProps: { 'data-testid': 'task-repeat-ends' } as object } }}
            >
              <MenuItem value="never" data-testid="task-repeat-ends-never">Never</MenuItem>
              <MenuItem value="until" data-testid="task-repeat-ends-until">On a date</MenuItem>
              <MenuItem value="count" data-testid="task-repeat-ends-count">After a number of times</MenuItem>
            </TextField>
            {rule.ends === 'until' && (
              <TextField
                size="small"
                type="date"
                label="Last date"
                value={rule.until}
                onChange={(e) => set({ until: e.target.value })}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: rule.startDate, 'data-testid': 'task-repeat-until' } }}
              />
            )}
            {rule.ends === 'count' && (
              <TextField
                size="small"
                type="number"
                label="Times"
                value={rule.count}
                onChange={(e) => set({ count: e.target.value })}
                slotProps={{ htmlInput: { min: 1, max: MAX_REPEAT_COUNT, 'data-testid': 'task-repeat-count' } }}
              />
            )}
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center" color="text.secondary">
            <RepeatIcon fontSize="small" aria-hidden />
            <Typography variant="body2" data-testid="task-repeat-summary">
              {taskRepeatSummary(rule)}
            </Typography>
          </Stack>
        </Stack>
      )}
    </Box>
  )
}
