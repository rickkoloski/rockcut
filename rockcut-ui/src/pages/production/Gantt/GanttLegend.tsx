import { alpha, Box, Typography, useTheme } from '@mui/material'
import { CIP_COLOR, phaseFill, type Mode, type Phase } from '../../../lib/production'

const Swatch = ({ sx }: { sx: object }) => <Box component="span" sx={{ display: 'inline-block', width: 14, height: 10, borderRadius: 0.5, mr: 0.5, flex: 'none', ...sx }} />

/** D47 §3.6 the legend under the grid: phases, CIP, planned, links, transfer arrows, out of service. */
export default function GanttLegend({ phases }: { phases: Phase[] }) {
  const theme = useTheme()
  const mode = theme.palette.mode as Mode
  const cip = mode === 'dark' ? CIP_COLOR.dark : CIP_COLOR.light
  const muted = theme.palette.text.secondary
  const item = (key: string, swatch: React.ReactNode, label: string) => (
    <Typography key={key} variant="caption" color="text.secondary" component="span" sx={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}>
      {swatch}
      {label}
    </Typography>
  )
  const line = (dashed: boolean, color: string) => (
    <Box component="svg" width={22} height={10} sx={{ mr: 0.5, flex: 'none' }} aria-hidden>
      <line x1={1} y1={5} x2={21} y2={5} stroke={color} strokeWidth={1.75} strokeDasharray={dashed ? '4 3' : undefined} />
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center', mt: 1.5 }} data-testid="gantt-legend">
      {phases
        .filter((p) => !p.retired_at)
        .map((p) => item(`p${p.id}`, <Swatch sx={{ bgcolor: phaseFill(p.color, mode).bg }} />, p.name))}
      {item('cip', <Swatch sx={{ background: `repeating-linear-gradient(135deg, ${cip} 0 3px, transparent 3px 6px)`, boxShadow: `0 0 0 1px ${muted} inset` }} />, 'CIP & Sanitize')}
      {item('planned', <Swatch sx={{ opacity: 0.6, outline: `1.5px dashed ${muted}`, outlineOffset: -1.5, bgcolor: alpha(muted, 0.2) }} />, 'Planned')}
      {item('all', line(false, muted), 'Moves with it')}
      {item('only', line(true, muted), 'Stays (move only)')}
      {item('transfer', line(true, theme.palette.primary.main), 'Transfer')}
      {item('split', line(true, theme.palette.secondary.main), 'Split')}
      {item('oos', <Swatch sx={{ background: `repeating-linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.3)} 0 3px, transparent 3px 6px)`, boxShadow: `0 0 0 1px ${theme.palette.error.main} inset` }} />, 'Out of service')}
    </Box>
  )
}
