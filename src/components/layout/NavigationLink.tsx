import type { MouseEventHandler } from 'react'
import { Link, useLocation } from 'react-router'
import { isNavigationCurrent } from '@/lib/navigationAccents'
import { cn } from '@/lib/utils'
import type { NavigationItem } from './nav'

/** Colour identifies the destination; text, an underline and aria-current identify location. */
export function NavigationLink({ item, variant = 'desktop', onClick }: {
  item: NavigationItem
  variant?: 'desktop' | 'menu' | 'footer'
  onClick?: MouseEventHandler<HTMLAnchorElement>
}) {
  const { pathname } = useLocation()
  const Icon = item.icon
  return (
    <Link
      to={item.to}
      onClick={onClick}
      aria-current={isNavigationCurrent(item.to, pathname) ? 'page' : undefined}
      data-nav-accent={item.accent}
      data-nav-variant={variant}
      className={cn('navigation-link relative hit-area', variant === 'menu' ? 'navigation-menu' : variant === 'footer' ? 'navigation-footer' : 'navigation-desktop')}
    >
      <span data-nav-marker aria-hidden className="navigation-marker">{variant === 'menu' && <Icon className="size-[18px]" />}</span>
      <span>{item.label}</span>
    </Link>
  )
}
