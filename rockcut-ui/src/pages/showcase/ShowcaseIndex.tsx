import { useNavigate } from 'react-router-dom'
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Typography,
} from '@mui/material'
import ViewTimelineIcon from '@mui/icons-material/ViewTimeline'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import PageHeader from '../../components/PageHeader'

const showcaseItems = [
  {
    title: 'Gantt Chart',
    description:
      'Time-based schedule view with tasks, dependencies, and progress tracking.',
    icon: <ViewTimelineIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
    path: '/showcase/gantt',
  },
  {
    title: 'Workflow',
    description:
      'Flowchart view with decision nodes, execution state, and process branching.',
    icon: <AccountTreeIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
    path: '/showcase/workflow',
  },
]

export default function ShowcaseIndex() {
  const navigate = useNavigate()

  return (
    <Box>
      <PageHeader
        breadcrumbs={[{ label: 'Showcase' }]}
        title="Component Showcase"
      />

      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Explore different UI components for process tracking. Click a card to
        see it in action with brewing process sample data.
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 3,
          maxWidth: 700,
        }}
      >
        {showcaseItems.map((item) => (
          <Card key={item.path} variant="outlined">
            <CardActionArea onClick={() => navigate(item.path)} sx={{ p: 1 }}>
              <CardContent
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: 1.5,
                }}
              >
                {item.icon}
                <Typography variant="h6">{item.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {item.description}
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>
    </Box>
  )
}
