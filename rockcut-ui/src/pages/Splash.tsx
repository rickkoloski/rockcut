import { Box, Typography, Card, CardContent, Grid } from '@mui/material'
import ScienceIcon from '@mui/icons-material/Science'
import InventoryIcon from '@mui/icons-material/Inventory'
import TimelineIcon from '@mui/icons-material/Timeline'
import ThermostatIcon from '@mui/icons-material/Thermostat'

const features = [
  {
    icon: <ScienceIcon sx={{ fontSize: 40 }} />,
    title: 'Recipe Management',
    description: 'Build and manage recipes with auto-calculated OG, FG, ABV, IBU, and SRM.',
  },
  {
    icon: <TimelineIcon sx={{ fontSize: 40 }} />,
    title: 'Batch Tracking',
    description: 'Log every brew session from grain to glass. Compare planned vs. actual.',
  },
  {
    icon: <InventoryIcon sx={{ fontSize: 40 }} />,
    title: 'Inventory',
    description: 'Track ingredient stock, costs, and suppliers. Auto-deduct on brew day.',
  },
  {
    icon: <ThermostatIcon sx={{ fontSize: 40 }} />,
    title: 'Process Automation',
    description: 'Timers, temperature targets, and step-by-step brew day guidance.',
  },
]

export default function Splash() {
  return (
    <Box>
      <Box sx={{ textAlign: 'center', pt: 2, pb: 4 }}>
        <Typography variant="h5" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto', mb: 1 }}>
          Recipe management and brewing process automation
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 500, mx: 'auto' }}>
          Replace your spreadsheets with a purpose-built tool that thinks the way you brew.
        </Typography>
      </Box>

      <Grid container spacing={3} sx={{ maxWidth: 900, mx: 'auto' }}>
        {features.map((feature) => (
          <Grid key={feature.title} size={{ xs: 12, sm: 6 }}>
            <Card
              elevation={0}
              sx={{
                height: '100%',
                border: '1px solid',
                borderColor: 'divider',
                transition: 'border-color 0.2s',
                '&:hover': { borderColor: 'primary.light' },
              }}
            >
              <CardContent sx={{ textAlign: 'center', py: 4 }}>
                <Box sx={{ color: 'secondary.main', mb: 2 }}>{feature.icon}</Box>
                <Typography variant="h6" gutterBottom>
                  {feature.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {feature.description}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}
