import { Html } from '@react-three/drei'
import { getComponent } from '@/lib/content'
import { cn } from '@/lib/utils'
import { useHtmlLayer } from './htmlLayer'
import { useLab, useLabStoreApi } from './LabContext'

interface PartLabelProps {
  id: string
  position: [number, number, number]
  /** Show even when global labels are off (e.g. for the selected part). */
  force?: boolean
  /** Keep the label hidden (still mounted) whatever the lab state. */
  hidden?: boolean
}

/**
 * Floating engineering annotation. Visible when labels are on, or for the selected part.
 *
 * The drei <Html> stays mounted and is hidden with CSS: each <Html> owns a
 * React root, and creating / destroying one every time labels toggle is
 * slow and makes React warn about unmounting a root while rendering.
 */
export function PartLabel({ id, position, force, hidden = false }: PartLabelProps) {
  const store = useLabStoreApi()
  const portal = useHtmlLayer()
  const show = useLab((s) => s.showLabels || s.selectedId === id || !!force)
  const selected = useLab((s) => s.selectedId === id)
  const partHidden = useLab((s) => !!s.hidden[id] || (s.isolatedId !== null && s.isolatedId !== id))
  const visible = show && !partHidden && !hidden
  const name = getComponent(id)?.name ?? id
  return (
    <Html portal={portal} position={position} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none', display: visible ? undefined : 'none' }}>
      <button
        type="button"
        onClick={() => store.getState().select(id)}
        tabIndex={visible ? undefined : -1}
        aria-hidden={visible ? undefined : true}
        className={cn(
          'pointer-events-auto whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider backdrop-blur-sm transition-colors',
          selected
            ? 'border-cyan/70 bg-cyan/15 text-cyan'
            : 'border-white/15 bg-graphite-950/70 text-steel-300 hover:border-cyan/50 hover:text-paper',
        )}
      >
        {name}
      </button>
    </Html>
  )
}
