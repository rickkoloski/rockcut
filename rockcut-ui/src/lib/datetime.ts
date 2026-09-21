// Time helpers: shifts are stored as UTC ISO strings and displayed in the
// brewery's local time (America/Denver). <input type="datetime-local"> values
// are treated as Denver wall-clock time.

export const TZ = 'America/Denver'

/** Denver-local date key "YYYY-MM-DD" for grouping/sorting. */
export function localDayKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

/** Heading like "Wednesday, Sep 24". */
export function formatDayHeading(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso))
}

/** Time like "4:00 PM". */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso))
}

/** "4:00 PM – 10:00 PM". */
export function formatTimeRange(startIso: string, endIso: string): string {
  return `${formatTime(startIso)} – ${formatTime(endIso)}`
}

function partsMap(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  return map
}

/** ms offset of America/Denver from UTC at the given instant (handles DST). */
function tzOffsetMs(date: Date): number {
  const m = partsMap(date)
  // '24' can appear for midnight in some engines; normalize to 0.
  const hour = m.hour === '24' ? 0 : Number(m.hour)
  const asUTC = Date.UTC(
    Number(m.year),
    Number(m.month) - 1,
    Number(m.day),
    hour,
    Number(m.minute),
    Number(m.second),
  )
  return asUTC - date.getTime()
}

/** UTC ISO → "YYYY-MM-DDTHH:mm" in Denver local time, for datetime-local inputs. */
export function utcToLocalInput(iso: string): string {
  const m = partsMap(new Date(iso))
  const hour = m.hour === '24' ? '00' : m.hour
  return `${m.year}-${m.month}-${m.day}T${hour}:${m.minute}`
}

// ── Week helpers (Monday-start, operating on Denver date keys) ──────

/** Add `n` days to a "YYYY-MM-DD" date key. */
export function addDaysKey(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The Monday (as a Denver date key) of the week containing `dateKey` (default: today). */
export function mondayKeyOf(dateKey?: string): string {
  const key = dateKey ?? localDayKey(new Date().toISOString())
  const dow = new Date(`${key}T12:00:00Z`).getUTCDay() // 0=Sun..6=Sat
  const sinceMonday = (dow + 6) % 7
  return addDaysKey(key, -sinceMonday)
}

/** Seven day keys Monday→Sunday starting at `mondayKey`. */
export function weekDayKeys(mondayKey: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysKey(mondayKey, i))
}

/** Column label like "Mon 22" for a date key. */
export function formatDayColumn(key: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
  }).format(new Date(`${key}T12:00:00Z`))
}

/** Range label like "Sep 22 – 28" for the week starting at `mondayKey`. */
export function formatWeekRange(mondayKey: string): string {
  const start = new Date(`${mondayKey}T12:00:00Z`)
  const end = new Date(`${addDaysKey(mondayKey, 6)}T12:00:00Z`)
  const mo = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' }).format(d)
  const day = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: 'numeric' }).format(d)
  const startLabel = `${mo(start)} ${day(start)}`
  const endLabel = mo(start) === mo(end) ? day(end) : `${mo(end)} ${day(end)}`
  return `${startLabel} – ${endLabel}`
}

// ── Durations ───────────────────────────────────────────────────────

/** Hours between two UTC ISO timestamps (may be fractional). */
export function shiftHours(startIso: string, endIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / 3_600_000
}

/** "8.5 hr" / "36 hr" (trims trailing zeros). */
export function formatHours(hours: number): string {
  const r = Math.round(hours * 100) / 100
  return `${r} hr`
}

/** Compact "8.5h" for tight spaces. */
export function formatHoursShort(hours: number): string {
  const r = Math.round(hours * 100) / 100
  return `${r}h`
}

/** "YYYY-MM-DDTHH:mm" (Denver wall time) → UTC ISO string. */
export function localInputToUtc(local: string): string {
  const [datePart, timePart] = local.split('T')
  const [y, mo, d] = datePart.split('-').map(Number)
  const [h, mi] = timePart.split(':').map(Number)
  // Treat the wall-clock components as if UTC, then correct by the tz offset
  // that applies at that instant.
  const provisional = Date.UTC(y, mo - 1, d, h, mi)
  const offset = tzOffsetMs(new Date(provisional))
  return new Date(provisional - offset).toISOString()
}
