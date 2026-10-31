import { Segmented } from '@/components/ui/segmented'
import type { ExplanationLevel } from '@/lib/schemas'
import { withViewTransition } from '@/lib/viewTransition'
import { usePreferences } from '@/stores/preferences'

/**
 * Beginner / Technical switch. A global preference (persisted locally), so it
 * applies across lessons and labs; lesson pages keep the reader's place when it
 * changes (see useLevelScrollAnchor).
 */
export function LevelToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  const level = usePreferences((p) => p.level)
  const setLevel = usePreferences((p) => p.setLevel)
  return (
    <Segmented<ExplanationLevel>
      value={level}
      // The page's text is rewritten for the new level: cross-fade it rather than swap it abruptly.
      onValueChange={(v) => withViewTransition(() => setLevel(v))}
      aria-label="Explanation level"
      className={className}
      options={[
        { value: 'beginner', label: compact ? 'Basic' : 'Beginner' },
        { value: 'technical', label: compact ? 'Tech' : 'Technical' },
      ]}
    />
  )
}
