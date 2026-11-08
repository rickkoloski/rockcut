// D55 lead decisions 6 (gap 4): on a shared tablet, a channel URL it can't
// open is "Not available on a shared device" only when it could be a real
// channel (D23's keys: `all`, `managers`, `dept:<department key>`); anything
// else is "Page not found". The tablet can't list departments, so any
// well-formed `dept:` key counts as real.
export function isChannelKey(key: string): boolean {
  return key === 'all' || key === 'managers' || /^dept:[a-z0-9_]+$/.test(key)
}
