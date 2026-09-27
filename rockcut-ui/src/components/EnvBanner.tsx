// D30: a fixed ribbon on non-prod builds (VITE_ENV_LABEL, e.g. "DEV") so no human
// or agent mistakes the DEV server for production. Prod builds leave it unset.
const label = import.meta.env.VITE_ENV_LABEL as string | undefined

export default function EnvBanner() {
  if (!label) return null

  return (
    <div
      data-testid="env-banner"
      role="status"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2000,
        pointerEvents: 'none',
        background: '#E65100',
        color: '#fff',
        font: '600 12px/20px Inter, Roboto, Helvetica, Arial, sans-serif',
        textAlign: 'center',
        letterSpacing: '0.04em',
      }}
    >
      {label} — fictional test data only
    </div>
  )
}
