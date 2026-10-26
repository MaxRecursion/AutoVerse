import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { ExplanationLevel } from '@/lib/schemas'
import { withViewTransition } from '@/lib/viewTransition'
import { usePreferences } from '@/stores/preferences'

const ITEM = 'h-9 px-3 text-xs data-[state=on]:bg-cyan/15 data-[state=on]:text-cyan'

/**
 * Beginner / Technical switch. A global preference (persisted locally), so it
 * applies across lessons and labs; lesson pages keep the reader's place when it
 * changes (see useLevelScrollAnchor).
 */
export function LevelToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  const level = usePreferences((p) => p.level)
  const setLevel = usePreferences((p) => p.setLevel)
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={level}
      // The page's text is rewritten for the new level: cross-fade it rather than swap it abruptly.
      onValueChange={(v) => v && withViewTransition(() => setLevel(v as ExplanationLevel))}
      aria-label="Explanation level"
      className={className}
    >
      <ToggleGroupItem value="beginner" className={ITEM}>
        {compact ? 'Basic' : 'Beginner'}
      </ToggleGroupItem>
      <ToggleGroupItem value="technical" className={ITEM}>
        {compact ? 'Tech' : 'Technical'}
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
