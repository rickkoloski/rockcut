import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import IosShareIcon from '@mui/icons-material/IosShare'
import AddBoxOutlinedIcon from '@mui/icons-material/AddBoxOutlined'

// The browser's install event isn't in the standard DOM lib types.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'rockcut:pwa:install-dismissed'

function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    )
  } catch {
    return false
  }
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

function dismissedBefore(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * One-time, dismissible hint to install the app to the home screen.
 * Android/desktop Chrome: wires the native `beforeinstallprompt`.
 * iOS Safari (no such event): shows manual "Add to Home Screen" steps.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = useState(false)
  const [iosOpen, setIosOpen] = useState(false)

  useEffect(() => {
    if (isStandalone() || dismissedBefore()) return

    const onBeforeInstall = (e: Event) => {
      e.preventDefault() // keep our own affordance instead of the mini-infobar
      setDeferred(e as BeforeInstallPromptEvent)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)

    // iOS never fires beforeinstallprompt — surface the manual hint after a beat.
    let timer: number | undefined
    if (isIOS()) {
      timer = window.setTimeout(() => setShow(true), 1500)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  const dismiss = () => {
    setShow(false)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  const install = async () => {
    if (deferred) {
      await deferred.prompt()
      await deferred.userChoice
      setDeferred(null)
      dismiss()
    } else if (isIOS()) {
      setIosOpen(true)
    }
  }

  return (
    <>
      <Snackbar
        open={show}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: { xs: 1, sm: 0 } }}
      >
        <Alert
          severity="info"
          icon={<AddBoxOutlinedIcon />}
          sx={{ width: '100%', alignItems: 'center' }}
          action={
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Button color="inherit" size="small" onClick={install}>
                {deferred ? 'Install' : 'How to'}
              </Button>
              <IconButton size="small" color="inherit" onClick={dismiss} aria-label="Dismiss">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          }
        >
          Install Rockcut on your device
        </Alert>
      </Snackbar>

      <Dialog open={iosOpen} onClose={() => setIosOpen(false)}>
        <DialogTitle>Add Rockcut to your Home Screen</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>In Safari:</Typography>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IosShareIcon color="primary" />
              <Typography>
                1. Tap the <strong>Share</strong> button.
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AddBoxOutlinedIcon color="primary" />
              <Typography>
                2. Choose <strong>Add to Home Screen</strong>.
              </Typography>
            </Box>
            <Typography>
              3. Tap <strong>Add</strong> — Rockcut opens like an app from your home screen.
            </Typography>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  )
}
