/**
 * Icon mapping utility for workflow editor nodes.
 *
 * Maps icon name strings (stored in CommandType.ui_metadata.icon) to
 * actual Lucide React icon components.
 *
 * Add new icons here as command types are created.
 */
import {
  Play,
  PlayCircle,
  Sparkles,
  FilePlus,
  PencilLine,
  Clock,
  AlertTriangle,
  Check,
  Calendar,
  MessageCircle,
  Monitor,
  GitBranch,
  Layers,
  Flag,
  Merge,
  type LucideIcon,
} from 'lucide-react'

/**
 * Map of icon name strings to Lucide icon components.
 *
 * Icon names follow kebab-case convention to match common icon naming.
 * Both kebab-case and variants are supported for flexibility.
 */
const iconMap: Record<string, LucideIcon> = {
  // AI operations
  'sparkles': Sparkles,

  // Memory operations
  'document-plus': FilePlus,
  'pencil-square': PencilLine,

  // Test operations
  'clock': Clock,
  'exclamation-triangle': AlertTriangle,

  // Demo operations
  'play': Play,
  'play-circle': PlayCircle,
  'screen': Monitor,
  'check': Check,
  'calendar': Calendar,
  'chat': MessageCircle,

  // Node type defaults
  'git-branch': GitBranch,
  'layers': Layers,
  'flag': Flag,
  'merge': Merge,
}

/**
 * Get a Lucide icon component by name.
 *
 * @param iconName - The icon name from ui_metadata.icon
 * @returns The Lucide icon component, or undefined if not found
 */
export function getIcon(iconName: string | undefined | null): LucideIcon | undefined {
  if (!iconName) return undefined
  return iconMap[iconName]
}

/**
 * Default icon to use when no icon is specified or found.
 */
export const DefaultIcon = Play
