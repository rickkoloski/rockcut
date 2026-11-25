import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Box, Button, CircularProgress, Paper, Typography } from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import api from '../../lib/api'
import PageHeader from '../../components/PageHeader'
import parseApiError from '../../lib/parseApiError'
import { SETTING_GROUPS, fieldShown, fieldText, lastChanged, type BrewerySettingsReply } from '../../lib/brewerySettings'
import BrewerySettingsDialog from './BrewerySettingsDialog'
import { BREWERY_SETTINGS_KEY } from './brewerySettingsKey'

/**
 * D63 §6.2: Brewery → Settings (`/brewery/settings`). Brewery members and the
 * brewhouse device see every value; Brewery managers and owners
 * (`can_manage`) get Edit.
 */
export default function BrewerySettingsPage() {
  const [editing, setEditing] = useState(false)
  // Read again each time the page opens: a stale form is a 409.
  const { data: reply, error, refetch } = useQuery<BrewerySettingsReply>({
    queryKey: BREWERY_SETTINGS_KEY,
    queryFn: async () => (await api.get<BrewerySettingsReply>('/api/brewery_settings')).data,
    staleTime: 0,
  })
  const settings = reply?.data
  const changed = settings && lastChanged(settings)
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Brewery' }, { label: 'Settings' }]}
        title="Settings"
        toolbar={
          reply?.can_manage ? (
            <Button variant="contained" startIcon={<EditIcon />} onClick={() => setEditing(true)} data-testid="brewery-settings-edit">
              Edit
            </Button>
          ) : undefined
        }
      />
      <Box sx={{ mb: 2 }} data-testid="brewery-settings-notes">
        <Typography sx={{ fontWeight: 600 }}>Used by recipes.</Typography>
        <Typography color="text.secondary">Recipes start using these in an upcoming release.</Typography>
      </Box>
      {!settings ? (
        error ? (
          <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => refetch()}>Retry</Button>}>
            {parseApiError(error)}
          </Alert>
        ) : (
          <CircularProgress />
        )
      ) : (
        <>
          {changed && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }} data-testid="brewery-settings-changed">
              {changed}
            </Typography>
          )}
          <Box sx={{ columnCount: { xs: 1, md: 2 }, columnGap: 2 }}>
            {SETTING_GROUPS.map((g) => (
              <Paper key={g.testId} variant="outlined" sx={{ p: 2, mb: 2, breakInside: 'avoid' }} data-testid={`settings-group-${g.testId}`}>
                <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
                  {g.testId === 'water' ? `${g.title}: ${settings.source_water_name}` : g.title}
                </Typography>
                {g.fields.map((f) => (
                  <Box key={f.key} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.5 }}>
                    <Typography color="text.secondary" sx={{ minWidth: 0 }}>
                      {f.label}
                    </Typography>
                    <Typography sx={{ textAlign: 'right', flexShrink: 0, maxWidth: '55%' }} data-testid={`setting-${f.key}`}>
                      {fieldShown(f, fieldText(f, settings))}
                    </Typography>
                  </Box>
                ))}
              </Paper>
            ))}
          </Box>
        </>
      )}
      {editing && settings && <BrewerySettingsDialog settings={settings} onClose={() => setEditing(false)} />}
    </>
  )
}
