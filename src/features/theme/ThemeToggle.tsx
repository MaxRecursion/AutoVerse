import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toggleTheme, useTheme } from './theme'

/** The same keyboard and touch control stays reachable in the header on every page. */
export function ThemeToggle() {
  const theme = useTheme()
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
  return (
    <>
      <Button type="button" variant="ghost" size="icon" onClick={toggleTheme} aria-label={label} title={label} data-testid="theme-toggle" className="text-steel-300 hover:text-paper">
        {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
    </>
  )
}
