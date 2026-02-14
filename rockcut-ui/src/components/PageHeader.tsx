import { Box, Breadcrumbs, Button, Link as MuiLink, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'

interface Crumb {
  label: string
  to?: string
}

interface PageHeaderProps {
  breadcrumbs: Crumb[]
  title: string
  action?: { label: string; onClick: () => void }
  /** Custom toolbar content (icon buttons, etc.) — replaces action when provided */
  toolbar?: React.ReactNode
}

export default function PageHeader({ breadcrumbs, title, action, toolbar }: PageHeaderProps) {
  return (
    <Box sx={{ mb: 3 }}>
      <Breadcrumbs sx={{ mb: 1 }}>
        {breadcrumbs.map((crumb, i) =>
          crumb.to ? (
            <MuiLink key={i} component={Link} to={crumb.to} underline="hover" color="inherit">
              {crumb.label}
            </MuiLink>
          ) : (
            <Typography key={i} color="text.primary">{crumb.label}</Typography>
          )
        )}
      </Breadcrumbs>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h4">{title}</Typography>
        {toolbar ?? (action && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
      </Box>
    </Box>
  )
}
