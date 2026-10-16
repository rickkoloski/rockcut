/// <reference types="vite-plugin-pwa/react" />
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Alert, Button, IconButton, Snackbar, Stack } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt'
import { useRegisterSW } from 'virtual:pwa-register/react'
import useAuth from '../hooks/useAuth'
import useActing from '../hooks/useActing'
import { actingExpired } from '../lib/acting'
import { asideDeviceToken } from '../lib/device'
import { TABLET_RECHECK_MS, TABLET_RELOAD_DELAY_MS, UPDATE_CHECK_MS, dialogOpen, tabletMayReload, typing } from '../lib/updatePrompt'

// D45 (spec §3.1): a new build waits (prompt mode) and the app says so.
// Mounted once beside the app (main.tsx), so it also works on the sign-in
// screen and behind the error boundary.

/** Fired on each check, so a dismissed bar comes back. */
const CHECK_EVENT = 'rockcut:update-check'

let registration: ServiceWorkerRegistration | undefined
/** Set when this page asked the new worker to take over (Reload). */
let reloading = false

/** Ask the browser for a new build (Q2): when the page comes back into view, and once a day. */
function check() {
  window.dispatchEvent(new Event(CHECK_EVENT))
  if (!registration || registration.installing || !navigator.onLine) return
  registration.update().catch(() => {
    /* offline or the server is down: the next check tries again */
  })
}

function onRegistered(_url: string, reg: ServiceWorkerRegistration | undefined) {
  if (!reg) return
  registration = reg
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  window.setInterval(check, UPDATE_CHECK_MS)
}

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: onRegistered,
    // The new worker took over. This page reloads only if it asked; when
    // another tab did, the bar stays and Reload (below) just reloads.
    onNeedReload: () => {
      if (reloading) window.location.reload()
    },
  })
  const isDevice = useAuth((s) => s.user?.kind === 'device')
  const { pathname } = useLocation()
  const [dismissed, setDismissed] = useState(false)

  // Dismissed: back on the next check or the next page.
  useEffect(() => setDismissed(false), [pathname])
  useEffect(() => {
    const show = () => setDismissed(false)
    window.addEventListener(CHECK_EVENT, show)
    return () => window.removeEventListener(CHECK_EVENT, show)
  }, [])

  const reload = () => {
    reloading = true
    if (registration?.waiting) {
      void updateServiceWorker(true)
      // If the new worker never says it took over, reload anyway.
      window.setTimeout(() => window.location.reload(), 5000)
    } else {
      window.location.reload()
    }
  }

  // Q1: a shared tablet idle on its shared screen reloads by itself; while
  // someone is using it, it shows the bar and looks again later.
  useEffect(() => {
    if (!needRefresh || !isDevice) return
    let timer = window.setTimeout(function tick() {
      const acting = useActing.getState()
      const idle = tabletMayReload({
        isDevice: useAuth.getState().user?.kind === 'device',
        personalSession: !!asideDeviceToken(),
        acting: !!acting.asking || (!!acting.session && !actingExpired(acting.session, Date.now())),
        dialogOpen: dialogOpen(),
        typing: typing(),
      })
      if (idle) reload()
      else timer = window.setTimeout(tick, TABLET_RECHECK_MS)
    }, TABLET_RELOAD_DELAY_MS)
    return () => window.clearTimeout(timer)
    // reload reads module state only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needRefresh, isDevice])

  return (
    <Snackbar
      open={needRefresh && !dismissed}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      // Above the DEV ribbon (20px) and a phone's bottom edge.
      sx={{ bottom: { xs: `calc(${import.meta.env.VITE_ENV_LABEL ? 28 : 8}px + env(safe-area-inset-bottom))`, sm: import.meta.env.VITE_ENV_LABEL ? 36 : 24 } }}
    >
      <Alert
        data-testid="update-prompt"
        severity="info"
        icon={<SystemUpdateAltIcon />}
        sx={{ width: '100%', alignItems: 'center', boxShadow: 6 }}
        action={
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Button color="inherit" size="small" onClick={reload} data-testid="update-reload">
              Reload
            </Button>
            <IconButton size="small" color="inherit" onClick={() => setDismissed(true)} aria-label="Dismiss">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        }
      >
        New version available
      </Alert>
    </Snackbar>
  )
}
