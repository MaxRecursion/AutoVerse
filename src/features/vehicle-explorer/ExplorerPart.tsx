import { useCallback, useRef, type ReactNode } from 'react'
import { Color } from 'three'
import { useLab } from '@/components/three/LabContext'
import { Part, type PartLook } from '@/components/three/Part'
import type { LabState } from '@/lib/simulation/labStore'
import { getComponent } from '@/lib/content'
import { P, selectView } from './explorerConfig'
import { GLOW_INTENSITY, partLook } from './explorerVisuals'
import { systemOfComponent } from './explorerSystems'
import { useExplorerSceneOptions } from './sceneOptions'

type Vec3 = [number, number, number]

const SYSTEM_GLOW = new Color('#38d7f2')

/**
 * The shared <Part> (click-select, hover, labels) with the explorer's own
 * appearance rules passed as its `look`: a whole system glows at once and the
 * view mode / body fade set each part's opacity (the default Part rules only
 * know one selected id and one isolated id).
 */
export function ExplorerPart({ id, labelAnchor, children }: { id: string; labelAnchor?: Vec3; children: ReactNode }) {
  // Part names only for the focused system (the whole car would be a wall of labels; hotspots cover that view),
  // and on phones only for the selected part. Hidden labels stay mounted (no React root churn).
  const { compact } = useExplorerSceneOptions()
  const named = useLab((s) => s.params[P.system] === systemOfComponent(id) && (!compact || s.selectedId === id))
  const highlight = useRef(new Color(getComponent(id)?.highlight.color ?? '#38d7f2'))
  const systemId = systemOfComponent(id)

  const look = useCallback(
    (s: LabState): PartLook => {
      if (!systemId) return { glow: null, opacity: 1 }
      const l = partLook({ componentId: id, systemId, view: selectView(s), selectedId: s.selectedId, hoveredId: s.hoveredId })
      return {
        glow: l.glow ? (l.glow === 'system' ? SYSTEM_GLOW : highlight.current) : null,
        glowIntensity: l.glow ? GLOW_INTENSITY[l.glow] : undefined,
        opacity: l.opacity,
      }
    },
    [id, systemId],
  )

  return (
    // A part outside every explorer system keeps the default Part look rules.
    <Part id={id} labelAnchor={labelAnchor} labelHidden={!named} look={systemId ? look : undefined}>
      {children}
    </Part>
  )
}
