import { Box, Button } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import PageTitle from './PageTitle'

interface Crumb {
  label: string
  to?: string
}

interface PageHeaderProps {
  breadcrumbs: Crumb[]
  title: string
  action?: { label: string; onClick: () => void; testId?: string }
  /** Custom toolbar content (icon buttons, etc.) — replaces action when provided */
  toolbar?: React.ReactNode
}

// D43: the title goes to the top bar. Breadcrumbs become one "‹ Parent" link,
// shown only on detail pages (a crumb other than Home that links somewhere).
export default function PageHeader({ breadcrumbs, title, action, toolbar }: PageHeaderProps) {
  const parent = breadcrumbs.filter((c) => c.to && c.to !== '/').pop()
  const actions =
    toolbar ??
    (action && (
      <Button variant="contained" startIcon={<AddIcon />} onClick={action.onClick} data-testid={action.testId}>
        {action.label}
      </Button>
    ))
  return (
    <>
      <PageTitle title={title} back={parent?.to ? { label: parent.label, to: parent.to } : undefined} />
      {actions && <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 1 }}>{actions}</Box>}
    </>
  )
}
