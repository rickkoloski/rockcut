import { Chip } from '@mui/material'

const colorMap: Record<string, Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'>> = {
  brand: { active: 'success', seasonal: 'info', retired: 'default' },
  batch: { planned: 'default', brewing: 'info', fermenting: 'warning', conditioning: 'info', completed: 'success', dumped: 'error' },
  recipe: { draft: 'default', active: 'success', archived: 'default' },
  lot: { available: 'success', depleted: 'warning', expired: 'error' },
}

interface StatusChipProps {
  status: string
  domain: 'brand' | 'batch' | 'recipe' | 'lot'
}

// D60: lot statuses read "Available", "Depleted", "Expired" (the API keeps them lowercase).
const capitalized = new Set<StatusChipProps['domain']>(['lot'])

export default function StatusChip({ status, domain }: StatusChipProps) {
  const color = colorMap[domain]?.[status] ?? 'default'
  const label = capitalized.has(domain) ? status.charAt(0).toUpperCase() + status.slice(1) : status
  return <Chip label={label} color={color} size="small" />
}
