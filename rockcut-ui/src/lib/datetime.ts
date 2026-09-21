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
