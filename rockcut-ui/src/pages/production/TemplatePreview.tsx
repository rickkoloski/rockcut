import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Tooltip, Typography, useTheme } from '@mui/material'
import { addDaysKey } from '../../lib/datetime'
import { coloradoToday } from '../../lib/tasks'
import { CIP_COLOR, monthDay, phaseFill, previewBars, vesselLabel, type Mode, type Phase, type Template } from '../../lib/production'

const DAY_PX = 16
const LABEL_W = 116
const FADE = { position: 'absolute', top: 0, bottom: 8, width: 32, pointerEvents: 'none', zIndex: 3 } as const

/**
 * D46 §3.4 Preview: the template as one batch brewed today. A bar per tank,
 * coloured by phase day by day, its CIP day hatched, a dot under each step
 * on the task list. Scrolls sideways when it's wider than the page.
 */
export default function TemplatePreview({ template, phases }: { template: Template; phases: Phase[] }) {
  const mode = useTheme().palette.mode as Mode
  const brewDay = coloradoToday()
  const bars = previewBars(template)
  const days = Math.max(1, ...bars.map((b) => b.end + 1))
  const phaseById = new Map(phases.map((p) => [p.id, p]))
  const usedPhases = [...new Set(bars.flatMap((b) => b.phases))].filter((id): id is number => id != null)
  const cipHatch = mode === 'dark' ? CIP_COLOR.dark : CIP_COLOR.light
  const ticks = Array.from({ length: Math.ceil(days / 7) }, (_, i) => i * 7)

  // Whether there's more timeline to either side (the fades).
  const scroller = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const measure = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const next = { left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 }
    setEdges((e) => (e.left === next.left && e.right === next.right ? e : next))
  }, [])
  useEffect(() => {
    measure()
    const el = scroller.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, days])

  return (
    <Box data-testid="template-preview">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        As one batch brewed today ({monthDay(brewDay)}).
      </Typography>
      <Box sx={{ position: 'relative' }}>
        <Box ref={scroller} onScroll={measure} sx={{ overflowX: 'auto', pb: 1 }} data-testid="preview-scroll">
        <Box sx={{ minWidth: LABEL_W + days * DAY_PX, position: 'relative' }}>
          <Box sx={{ display: 'flex', height: 18, ml: `${LABEL_W}px`, position: 'relative' }}>
            {ticks.map((d) => (
              <Typography
                key={d}
                variant="caption"
                color="text.secondary"
                sx={{ position: 'absolute', left: d * DAY_PX, whiteSpace: 'nowrap' }}
              >
                {monthDay(addDaysKey(brewDay, d))} · day {d}
              </Typography>
            ))}
          </Box>
          {bars.map((bar) => (
            <Box key={bar.vessel} sx={{ display: 'flex', alignItems: 'center', height: 40 }} data-testid={`preview-bar-${bar.vessel}`}>
              {/* Stays put while the timeline scrolls (D46 QA minor 7). */}
              <Typography
                variant="body2"
                noWrap
                data-testid={`preview-label-${bar.vessel}`}
                sx={{
                  width: LABEL_W,
                  flexShrink: 0,
                  pr: 1,
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  alignSelf: 'stretch',
                  display: 'flex',
                  alignItems: 'center',
                  bgcolor: 'background.paper',
                }}
              >
                {vesselLabel(bar.vessel)}
              </Typography>
              <Box sx={{ position: 'relative', height: 40, flex: 1 }}>
                {bar.phases.map((id, i) => {
                  const day = bar.start + i
                  const phase = id != null ? phaseById.get(id) : undefined
                  const fill = phaseFill(phase?.color, mode)
                  const cip = bar.cipDays.includes(day)
                  return (
                    <Tooltip key={day} title={`Day ${day} · ${monthDay(addDaysKey(brewDay, day))}${cip ? ' · CIP & Sanitize' : phase ? ` · ${phase.name}` : ''}`}>
                      <Box
                        data-testid={`preview-day-${bar.vessel}-${day}`}
                        data-phase={cip ? 'cip' : (phase?.name ?? '')}
                        sx={{
                          position: 'absolute',
                          left: day * DAY_PX,
                          width: DAY_PX,
                          top: 4,
                          height: 18,
                          bgcolor: cip ? 'transparent' : phase ? fill.bg : 'action.hover',
                          backgroundImage: cip ? `repeating-linear-gradient(135deg, ${cipHatch} 0 3px, transparent 3px 6px)` : undefined,
                          borderTopLeftRadius: i === 0 ? 6 : 0,
                          borderBottomLeftRadius: i === 0 ? 6 : 0,
                          borderTopRightRadius: day === bar.end ? 6 : 0,
                          borderBottomRightRadius: day === bar.end ? 6 : 0,
                        }}
                      />
                    </Tooltip>
                  )
                })}
                {bar.dots.map((dot, i) => {
                  const sameDay = bar.dots.filter((d) => d.day === dot.day)
                  const k = sameDay.indexOf(dot)
                  return (
                    <Tooltip key={`${dot.day}-${i}`} title={`Day ${dot.day} · ${dot.name}`}>
                      <Box
                        data-testid={`preview-dot-${bar.vessel}-${dot.day}`}
                        sx={{
                          position: 'absolute',
                          left: dot.day * DAY_PX + DAY_PX / 2 - 4 + (k - (sameDay.length - 1) / 2) * 6,
                          top: 26,
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          border: 1.5,
                          borderColor: 'text.primary',
                          bgcolor: 'background.paper',
                        }}
                      />
                    </Tooltip>
                  )
                })}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
        {/* A fade where there's more to scroll to. */}
        {edges.left && (
          <Box
            data-testid="preview-scroll-hint-left"
            sx={{ ...FADE, left: LABEL_W, background: (t) => `linear-gradient(to right, ${t.palette.background.paper}, transparent)` }}
          />
        )}
        {edges.right && (
          <Box
            data-testid="preview-scroll-hint"
            sx={{ ...FADE, right: 0, background: (t) => `linear-gradient(to left, ${t.palette.background.paper}, transparent)` }}
          />
        )}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1 }} data-testid="preview-legend">
        {usedPhases.map((id) => {
          const p = phaseById.get(id)
          if (!p) return null
          return (
            <Box key={id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 14, height: 14, borderRadius: 0.5, bgcolor: phaseFill(p.color, mode).bg }} />
              <Typography variant="caption">{p.name}</Typography>
            </Box>
          )
        })}
        {bars.some((b) => b.cipDays.length) && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 14, height: 14, borderRadius: 0.5, backgroundImage: `repeating-linear-gradient(135deg, ${cipHatch} 0 3px, transparent 3px 6px)` }} />
            <Typography variant="caption">CIP & Sanitize</Typography>
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', border: 1.5, borderColor: 'text.primary' }} />
          <Typography variant="caption">On the task list</Typography>
        </Box>
      </Box>
    </Box>
  )
}
