import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Tab, Tabs } from '@mui/material'

const TABS = [
  { label: 'Orders', to: '/ingredients/orders' },
  { label: 'Contracts', to: '/ingredients/contracts' },
  { label: 'To order', to: '/ingredients/to-order' },
  { label: 'Totals', to: '/ingredients/totals' },
]

/** D61 §4: the Purchasing area's tabs (Orders · Contracts · To order · Totals); they scroll on phones. */
export default function PurchasingTabs() {
  const { pathname } = useLocation()
  const current = TABS.find((t) => pathname.startsWith(t.to))?.to ?? false
  return (
    <Tabs value={current} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }} data-testid="purchasing-tabs">
      {TABS.map((t) => (
        <Tab key={t.to} label={t.label} value={t.to} component={RouterLink} to={t.to} data-testid={`purchasing-tab-${t.to.split('/').pop()}`} />
      ))}
    </Tabs>
  )
}
