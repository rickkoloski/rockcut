// D43: the page's title lives in the top bar. The bar holds an empty slot;
// each page renders <PageTitle> and it is portaled into that slot, so a title
// can carry its own controls (the task boards' switcher) without the bar
// knowing about them.
import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Box, Link, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import ChevronLeft from '@mui/icons-material/ChevronLeft'

const SlotContext = createContext<HTMLElement | null>(null)
const SetSlotContext = createContext<(el: HTMLElement | null) => void>(() => {})

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  return (
    <SetSlotContext.Provider value={setSlot}>
      <SlotContext.Provider value={slot}>{children}</SlotContext.Provider>
    </SetSlotContext.Provider>
  )
}

/** The top bar's title area. Empty when the page has no title. */
export function PageTitleSlot() {
  const setSlot = useContext(SetSlotContext)
  return (
    <Box
      ref={setSlot}
      className="page-title-slot"
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, flexShrink: 1, overflow: 'hidden', color: 'text.primary' }}
    />
  )
}

export interface PageTitleBack {
  label: string
  to: string
}

/**
 * Puts the page's title (an h1) in the top bar. `back` adds a "‹ Parent" link
 * for detail pages; `children` replaces the plain title text (e.g. a switcher).
 */
export default function PageTitle({ title, back, children }: { title?: string; back?: PageTitleBack; children?: ReactNode }) {
  const slot = useContext(SlotContext)
  if (!slot) return null
  return createPortal(
    <>
      {back && (
        <Link
          component={RouterLink}
          to={back.to}
          underline="hover"
          color="text.secondary"
          variant="body2"
          data-testid="page-back"
          sx={{ display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', flexShrink: 0, mr: 0.5 }}
        >
          <ChevronLeft fontSize="small" />
          <Box component="span" sx={{ maxWidth: { xs: 90, sm: 220 }, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {back.label}
          </Box>
        </Link>
      )}
      {children ? (
        <Box component="h1" sx={{ m: 0, font: 'inherit', display: 'flex', alignItems: 'center', minWidth: 0 }}>
          {children}
        </Box>
      ) : (
        <Typography component="h1" variant="h6" noWrap sx={{ color: 'text.primary', minWidth: 0 }}>
          {title}
        </Typography>
      )}
    </>,
    slot,
  )
}
