import { Box, Card, CardActionArea, CardContent, Grid, Stack, Typography } from '@mui/material'
import { type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import GridViewIcon from '@mui/icons-material/GridView'
import EventBusyIcon from '@mui/icons-material/EventBusy'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import ForumIcon from '@mui/icons-material/Forum'
import SportsBarIcon from '@mui/icons-material/SportsBar'
import PeopleIcon from '@mui/icons-material/People'
import useAuth from '../hooks/useAuth'

interface QuickLink {
  label: string
  description: string
  path: string
  icon: ReactNode
}

export default function Home() {
  const navigate = useNavigate()
  const { user, capabilities } = useAuth()

  const isOwner = !!user?.is_owner
  const modules = capabilities?.modules ?? []
  const hasBrewery = modules.includes('brewery')
  const canManageSchedule = isOwner || (capabilities?.manages_departments?.length ?? 0) > 0
  const canManageUsers = !!capabilities?.can_manage_users

  const firstName = (user?.name || user?.email || '').split(/[\s@]/)[0]

  const links: QuickLink[] = [
    { label: 'View Schedule', description: 'Your upcoming shifts', path: '/schedule', icon: <CalendarMonthIcon /> },
    ...(canManageSchedule
      ? [{ label: 'Scheduler', description: 'Build & publish the week', path: '/scheduler', icon: <GridViewIcon /> }]
      : []),
    { label: 'Time off', description: 'Request or review time off', path: '/time_off', icon: <EventBusyIcon /> },
    { label: 'Availability', description: 'Set when you can work', path: '/availability', icon: <EventAvailableIcon /> },
    { label: 'Messages', description: 'Team channels', path: '/messages', icon: <ForumIcon /> },
    ...(hasBrewery
      ? [{ label: 'Brewery', description: 'Batches, recipes & brands', path: '/brewery', icon: <SportsBarIcon /> }]
      : []),
    ...(canManageUsers
      ? [{ label: 'Users & Roles', description: 'Manage staff access', path: '/users', icon: <PeopleIcon /> }]
      : []),
  ]

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        {firstName ? `Welcome back, ${firstName}` : 'Welcome to Rockcut'}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        Quick links to get you where you're going. More at-a-glance info is coming to this page soon.
      </Typography>

      <Grid container spacing={2}>
        {links.map((l) => (
          <Grid key={l.path} size={{ xs: 12, sm: 6, md: 4 }}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardActionArea onClick={() => navigate(l.path)} sx={{ height: '100%' }}>
                <CardContent>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{ color: 'primary.main', display: 'flex' }}>{l.icon}</Box>
                    <Box>
                      <Typography sx={{ fontWeight: 600 }}>{l.label}</Typography>
                      <Typography variant="body2" color="text.secondary">{l.description}</Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}
