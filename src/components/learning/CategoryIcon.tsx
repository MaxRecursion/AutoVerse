import {
  BookOpen,
  Car,
  CircleDashed,
  CircleDot,
  Cog,
  Disc3,
  Fan,
  Flame,
  Gauge,
  GitBranch,
  Settings2,
  Thermometer,
  Waves,
  Wind,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/** Static map (tree-shakeable) of the icon names used in src/content/categories.json. */
const ICONS: Record<string, LucideIcon> = {
  BookOpen,
  Car,
  CircleDot,
  Cog,
  Disc3,
  Fan,
  Flame,
  Gauge,
  GitBranch,
  Settings2,
  Thermometer,
  Waves,
  Wind,
  Wrench,
  Zap,
}

/** Resolves a category's `icon` name; unknown names fall back to a neutral glyph. Decorative. */
export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? CircleDashed
  return <Icon aria-hidden className={cn('size-4', className)} />
}
