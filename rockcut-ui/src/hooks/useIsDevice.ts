import useAuth from './useAuth'

/** True on a shared device (D33): the brewhouse device's schedule asks for staff codes and its setup pages are read-only (D50). */
export default function useIsDevice(): boolean {
  return useAuth((s) => s.user?.kind === 'device')
}
