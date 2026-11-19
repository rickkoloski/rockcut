import { Chip } from '@mui/material'

const colorMap: Record<string, Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'>> = {
  brand: { active: 'success', seasonal: 'info', retired: 'default' },
  batch: { planned: 'default', brewing: 'info', fermenting: 'warning', conditioning: 'info', completed: 'success', dumped: 'error' },
  recipe: { draft: 'default', active: 'success', archived: 'default' },
  lot: { available: 'success', depleted: 'warning', expired: 'error' },
  order: { open: 'info', received: 'success', cancelled: 'default' },
}

interface StatusChipProps {
  status: string
  domain: 'brand' | 'batch' | 'recipe' | 'lot' | 'order'
}

// D60: lot statuses read "Available", "Depleted", "Expired" (the API keeps them lowercase); D61 orders too.
const capitalized = new Set<StatusChipProps['domain']>(['lot', 'order'])

export default function StatusChip({ status, domain }: StatusChipProps) {
  const color = colorMap[domain]?.[status] ?? 'default'
  const label = capitalized.has(domain) ? status.charAt(0).toUpperCase() + status.slice(1) : status
  return <Chip label={label} color={color} size="small" />
}
