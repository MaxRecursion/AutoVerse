import { AudioLines, BookOpen, Car, ChartNoAxesCombined, FlaskConical, Landmark, Network, type LucideIcon } from 'lucide-react'
import type { NavigationAccent } from '@/lib/navigationAccents'

export interface NavigationItem {
  to: string
  label: string
  accent: NavigationAccent
  icon: LucideIcon
}

/** Signature experience first, followed by the learning journey. */
export const primaryNav = [
  { to: '/sound-lab', label: 'Sound Lab', accent: 'sound', icon: AudioLines },
  { to: '/explore', label: 'Explore the Car', accent: 'explore', icon: Car },
  { to: '/learn', label: 'Learn', accent: 'learn', icon: BookOpen },
  { to: '/labs', label: 'Labs', accent: 'labs', icon: FlaskConical },
  { to: '/pioneers', label: 'Pioneers', accent: 'pioneers', icon: Landmark },
  { to: '/progress', label: 'My Progress', accent: 'progress', icon: ChartNoAxesCombined },
] as const satisfies readonly NavigationItem[]

/** Reachable from Explore, Learn and the home page; listed in the mobile menu and footer. */
export const secondaryNav = [{ to: '/map', label: 'System Map', accent: 'map', icon: Network }] as const satisfies readonly NavigationItem[]
