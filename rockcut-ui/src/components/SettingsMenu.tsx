// D52: one look for a page's top row: its controls on the left, its actions
// and a settings gear on the right, straight on the page background. Used by
// the task boards, View Schedule, the Scheduler, the Gantt, Brands & Recipes,
// the Ingredient Library and the Buy-a-Beer Board.
import { Children, Fragment, isValidElement, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Badge, Box, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Switch, Tooltip } from '@mui/material'
import { Check, ExpandLess, ExpandMore, Settings } from '@mui/icons-material'

/** The page's top row: `children` on the left, `end` (actions, then the gear) on the right. */
export function PageToolbar({ children, end, testid }: { children?: ReactNode; end?: ReactNode; testid?: string }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mb: 2 }} data-testid={testid}>
      {children}
      <Box sx={{ flex: 1 }} />
      {end && <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>{end}</Box>}
    </Box>
  )
}

/**
 * The gear and its menu. `children` gets `close` for items that leave the menu
 * (a dialog, a link); choices and switches keep it open. `dot` marks a filter
 * that's on, since the filters are out of sight.
 */
export function SettingsGear({
  label,
  testid,
  dot,
  minWidth = 240,
  children,
}: {
  label: string
  testid: string
  dot?: boolean
  minWidth?: number
  children: (close: () => void) => ReactNode
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const close = () => setAnchor(null)
  return (
    <>
      <Tooltip title={label}>
        <IconButton aria-label={label} onClick={(e) => setAnchor(e.currentTarget)} data-testid={testid}>
          <Badge variant="dot" color="secondary" invisible={!dot}>
            <Settings />
          </Badge>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth } } }}
      >
        {flatten(children(close))}
      </Menu>
    </>
  )
}

// Menu and MenuList walk their children for focus and refuse fragments; a page
// can still group its items in one.
function flatten(nodes: ReactNode): ReactNode[] {
  return Children.toArray(nodes).flatMap((n) =>
    isValidElement(n) && n.type === Fragment ? flatten((n as ReactElement<{ children?: ReactNode }>).props.children) : [n],
  )
}

export interface Choice<T> {
  value: T
  label: string
}

/** A heading showing the current choice; a click opens the choices below it, and the menu stays open. */
export function SettingsChoices<T extends string | number>(props: {
  label: string
  options: Choice<T>[]
  value: T | null
  onPick: (value: T) => void
  /** Shown when the value isn't one of the options (e.g. a custom range). */
  otherLabel?: string
  testid: string
  /** Set by the menu on its first item (keyboard focus on open); passed to the heading. */
  autoFocus?: boolean
  tabIndex?: number
}) {
  const [open, setOpen] = useState(false)
  const heading = useRef<HTMLLIElement>(null)
  const current = props.options.find((o) => o.value === props.value)
  // The options are plain siblings in the menu (no Collapse wrapper): the menu
  // moves the arrow keys from item to item in the page, so a wrapper hid them.
  return (
    <>
      <MenuItem
        ref={heading}
        autoFocus={props.autoFocus}
        tabIndex={props.tabIndex}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid={props.testid}
      >
        <ListItemText primary={props.label} secondary={current?.label ?? props.otherLabel} />
        {open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
      </MenuItem>
      {open &&
        props.options.map((o) => (
          <MenuItem
            key={o.value}
            selected={o.value === props.value}
            onClick={() => {
              props.onPick(o.value)
              setOpen(false)
              // Focus goes back to the heading, so the keyboard stays in the menu.
              requestAnimationFrame(() => heading.current?.focus())
            }}
            sx={{ pl: 3 }}
            data-testid={`${props.testid}-${o.value === '' ? 'all' : o.value}`}
          >
            <ListItemIcon>{o.value === props.value && <Check fontSize="small" />}</ListItemIcon>
            <ListItemText primary={o.label} />
          </MenuItem>
        ))}
    </>
  )
}

/** A switch row; clicking anywhere on the row flips it. */
export function SettingsToggle(props: {
  label: string
  checked: boolean
  onChange: (on: boolean) => void
  testid: string
  autoFocus?: boolean
  tabIndex?: number
}) {
  return (
    <MenuItem autoFocus={props.autoFocus} tabIndex={props.tabIndex} onClick={() => props.onChange(!props.checked)}>
      <ListItemText primary={props.label} />
      <Switch
        edge="end"
        size="small"
        checked={props.checked}
        tabIndex={-1}
        slotProps={{ input: { 'data-testid': props.testid } as object }}
        sx={{ ml: 2, pointerEvents: 'none' }}
      />
    </MenuItem>
  )
}
