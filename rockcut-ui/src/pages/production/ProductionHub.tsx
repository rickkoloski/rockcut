import { Link as RouterLink } from 'react-router-dom'
import { Box, Card, CardActionArea, CardContent, Typography } from '@mui/material'
import { AccountTree, Propane, Palette } from '@mui/icons-material'
import type { ReactNode } from 'react'
import PageHeader from '../../components/PageHeader'
import { useApiQuery } from '../../hooks/useApiQuery'
import {
  PHASES_KEY,
  STEP_TYPES_KEY,
  TANKS_KEY,
  TEMPLATES_KEY,
  prodPath,
  type Phase,
  type StepType,
  type Tank,
  type TemplateSummary,
} from '../../lib/production'

function HubCard({ to, icon, title, line, testId }: { to: string; icon: ReactNode; title: string; line: string | null; testId: string }) {
  return (
    <Card variant="outlined">
      <CardActionArea component={RouterLink} to={to} data-testid={testId} sx={{ height: '100%' }}>
        <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
          <Box>
            <Typography variant="h6">{title}</Typography>
            <Typography variant="body2" color="text.secondary" data-testid={`${testId}-count`}>
              {line ?? '…'}
            </Typography>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * D46 lead decision 2: Brewery → Production (`/brewery/production`) is a hub
 * for the setup pages until D47 puts the schedule here.
 */
export default function ProductionHub() {
  const tanks = useApiQuery<Tank[]>(TANKS_KEY, prodPath('tanks')).data
  const templates = useApiQuery<TemplateSummary[]>(TEMPLATES_KEY, prodPath('templates')).data
  const phases = useApiQuery<Phase[]>(PHASES_KEY, prodPath('phases')).data
  const types = useApiQuery<StepType[]>(STEP_TYPES_KEY, prodPath('step_types')).data
  const active = <T extends { retired_at: string | null }>(list?: T[]) => list?.filter((x) => !x.retired_at)

  const tankLine = active(tanks) && plural(active(tanks)!.length, 'tank')
  const liveTemplates = active(templates)
  const incomplete = liveTemplates?.filter((t) => t.issues.length).length ?? 0
  const templateLine = liveTemplates && `${plural(liveTemplates.length, 'template')}${incomplete ? ` · ${incomplete} incomplete` : ''}`
  const listLine = active(phases) && active(types) && `${plural(active(phases)!.length, 'phase')} · ${plural(active(types)!.length, 'step type')}`

  return (
    <Box>
      <PageHeader breadcrumbs={[{ label: 'Production' }]} title="Production" />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Set up the tanks, the phases and step types, and the process templates the production schedule is built from.
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }} data-testid="production-hub">
        <HubCard to="/brewery/production/tanks" icon={<Propane fontSize="large" />} title="Tanks" line={tankLine || null} testId="hub-tanks" />
        <HubCard to="/brewery/production/templates" icon={<AccountTree fontSize="large" />} title="Templates" line={templateLine || null} testId="hub-templates" />
        <HubCard to="/brewery/production/lists" icon={<Palette fontSize="large" />} title="Phases & steps" line={listLine || null} testId="hub-lists" />
      </Box>
    </Box>
  )
}
