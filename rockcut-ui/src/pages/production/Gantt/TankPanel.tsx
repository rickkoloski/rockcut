import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItemButton, ListItemText, Typography } from '@mui/material'
import { usePhoneBackCloses } from '../../../hooks/useBackCloses'
import { OUTAGE_GROUPS, type Outage, type Tank } from '../../../lib/production'

/**
 * D47 §3.6 a tank's ⋯ panel: its out-of-service periods (Now / Coming up /
 * Past), each opening its dialog, and Mark out of service.
 */
export default function TankPanel({ tank, onOpen, onClose }: { tank: Tank; onOpen: (o: Outage | null) => void; onClose: () => void }) {
  usePhoneBackCloses(true, onClose)
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth data-testid="tank-panel">
      <DialogTitle>
        {tank.name}
        <Typography variant="body2" color="text.secondary">
          {tank.capacity_bbl} bbl
        </Typography>
      </DialogTitle>
      <DialogContent>
        {!tank.outages.length && (
          <Typography variant="body2" color="text.secondary">
            No out-of-service periods.
          </Typography>
        )}
        {OUTAGE_GROUPS.map(({ state, label }) => {
          const list = tank.outages.filter((o) => o.state === state)
          if (!list.length) return null
          return (
            <Box key={state} data-testid={`tank-panel-${state}`}>
              <Typography variant="caption" color={state === 'now' ? 'error.main' : 'text.secondary'} sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                {label}
              </Typography>
              <List dense disablePadding>
                {list.map((o) => (
                  <ListItemButton key={o.id} onClick={() => onOpen(o)} data-testid={`tank-panel-outage-${o.id}`}>
                    <ListItemText primary={o.label} secondary={o.reason} />
                  </ListItemButton>
                ))}
              </List>
            </Box>
          )
        })}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onOpen(null)} color="error" sx={{ mr: 'auto' }} data-testid="tank-panel-mark-out">
          Mark out of service…
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
