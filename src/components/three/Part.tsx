import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Color, type Group, type Material, type Mesh, type MeshStandardMaterial } from 'three'
import { getComponent } from '@/lib/content'
import type { LabState } from '@/lib/simulation/labStore'
import { useLabStoreApi } from './LabContext'
import { PartLabel } from './PartLabel'

type Vec3 = [number, number, number]

/**
 * A caller-defined look for a Part (see `look`): an emissive glow and an
 * opacity factor, applied on top of each material's own base look.
 */
export interface PartLook {
  /** Emissive glow colour; null keeps each material's own emissive. */
  glow: Color | null
  /** Emissive intensity used with `glow`. */
  glowIntensity?: number
  /** Multiplies each material's own opacity (1 = unchanged; below 1 the part is drawn see-through). */
  opacity: number
}

interface PartProps {
  /** Stable component id — matches src/content/components/*.json and topic componentIds. */
  id: string
  /** Offset applied (smoothly) in exploded view, in parent space. */
  explode?: Vec3
  /** Local position of the floating label; omit to disable the label. */
  labelAnchor?: Vec3
  selectable?: boolean
  position?: Vec3
  rotation?: Vec3
  /**
   * Replace the default look rules (select / hover glow, isolate ghosting)
   * with the caller's own, computed from lab state — e.g. a whole system
   * glowing at once, or a view-mode opacity. Re-applied whenever lab state
   * changes and the result differs. Keep the function stable (useCallback).
   */
  look?: (s: LabState) => PartLook
  /** Hide the label (with CSS, without unmounting it) while keeping `labelAnchor`. */
  labelHidden?: boolean
  children: ReactNode
}

interface MatSlot {
  mat: MeshStandardMaterial
  emissive: Color
  emissiveIntensity: number
  opacity: number
  transparent: boolean
  depthWrite: boolean
}

const GHOST_OPACITY = 0.12
const HOVER_INTENSITY = 0.22
const SELECT_INTENSITY = 0.55

/**
 * Wraps the geometry of one educational component and connects it to the lab
 * store: click-to-select, hover, highlight, hide / isolate (ghosting) and
 * exploded-view offset. Animation transforms belong on groups *inside* the
 * Part so they compose with the explode offset.
 *
 * Works for procedural meshes and for GLB nodes (<primitive object={node} />).
 * Materials are cloned once per Part so highlighting never leaks into shared
 * materials.
 */
export function Part({ id, explode, labelAnchor, selectable = true, position, rotation, look, labelHidden, children }: PartProps) {
  const store = useLabStoreApi()
  const outer = useRef<Group>(null)
  const slots = useRef<MatSlot[]>([])
  const k = useRef(0)
  const highlightColor = useRef(new Color(getComponent(id)?.highlight.color ?? '#38d7f2'))

  useLayoutEffect(() => {
    const group = outer.current
    if (!group) return
    const collected: MatSlot[] = []
    const cloned: Material[] = []
    group.traverse((obj) => {
      const mesh = obj as Mesh
      if (!mesh.isMesh) return
      mesh.userData.componentId ??= id
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const next = list.map((m) => {
        const c = m.clone() as MeshStandardMaterial
        cloned.push(c)
        if (c.emissive) {
          collected.push({
            mat: c,
            emissive: c.emissive.clone(),
            emissiveIntensity: c.emissiveIntensity ?? 1,
            opacity: c.opacity,
            transparent: c.transparent,
            depthWrite: c.depthWrite,
          })
        }
        return c
      })
      mesh.material = Array.isArray(mesh.material) ? next : next[0]
    })
    slots.current = collected
    return () => cloned.forEach((m) => m.dispose())
  }, [id])

  useEffect(() => {
    /** The look for this state: the caller's rules, or the default select / hover / isolate rules. */
    const lookFor = (s: LabState): PartLook & { absoluteOpacity?: boolean } => {
      if (look) return look(s)
      const selected = s.selectedId === id
      const hovered = s.hoveredId === id
      const ghost = s.isolatedId !== null && s.isolatedId !== id
      return {
        glow: selected || hovered ? highlightColor.current : null,
        glowIntensity: selected ? SELECT_INTENSITY : HOVER_INTENSITY,
        // The default ghost is an absolute opacity, whatever the material's own.
        opacity: ghost ? GHOST_OPACITY : 1,
        absoluteOpacity: true,
      }
    }
    let last = ''
    // The layout effect above (same `id`) has already filled the slots.
    const parts = slots.current
    const apply = (s: LabState) => {
      const group = outer.current
      if (!group) return
      const l = lookFor(s)
      const key = `${!s.hidden[id]}|${l.glow?.getHex() ?? '-'}|${l.glowIntensity ?? ''}|${l.opacity}`
      if (key === last) return
      last = key
      group.visible = !s.hidden[id]
      const ghost = l.opacity < 0.999
      for (const slot of parts) {
        const m = slot.mat
        if (l.glow) {
          m.emissive.copy(l.glow)
          m.emissiveIntensity = l.glowIntensity ?? SELECT_INTENSITY
        } else {
          m.emissive.copy(slot.emissive)
          m.emissiveIntensity = slot.emissiveIntensity
        }
        const transparent = ghost || slot.transparent
        // three.js bakes "opaque" into the shader program, so flipping transparency needs a recompile.
        if (m.transparent !== transparent) {
          m.transparent = transparent
          m.needsUpdate = true
        }
        m.opacity = !ghost ? slot.opacity : l.absoluteOpacity ? l.opacity : slot.opacity * l.opacity
        m.depthWrite = ghost ? false : slot.depthWrite
      }
    }
    apply(store.getState())
    const unsubscribe = store.subscribe((s, prev) => {
      if (
        look ||
        s.selectedId !== prev.selectedId ||
        s.hoveredId !== prev.hoveredId ||
        s.hidden !== prev.hidden ||
        s.isolatedId !== prev.isolatedId
      )
        apply(s)
    })
    return () => {
      unsubscribe()
      // Leave the materials in their base look, so a re-run (StrictMode, a new `look`) never records a glow as the base.
      for (const slot of parts) {
        const m = slot.mat
        m.emissive.copy(slot.emissive)
        m.emissiveIntensity = slot.emissiveIntensity
        if (m.transparent !== slot.transparent) {
          m.transparent = slot.transparent
          m.needsUpdate = true
        }
        m.opacity = slot.opacity
        m.depthWrite = slot.depthWrite
      }
    }
  }, [store, id, look])

  useFrame((_, dt) => {
    const group = outer.current
    if (!group || !explode) return
    const target = store.getState().exploded ? 1 : 0
    if (Math.abs(target - k.current) < 1e-4 && k.current === target) return
    k.current += (target - k.current) * (1 - Math.exp(-dt * 7))
    if (Math.abs(target - k.current) < 1e-4) k.current = target
    const base = position ?? [0, 0, 0]
    group.position.set(base[0] + explode[0] * k.current, base[1] + explode[1] * k.current, base[2] + explode[2] * k.current)
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!selectable) return
    e.stopPropagation()
    const s = store.getState()
    s.select(s.selectedId === id ? null : id)
  }
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    if (!selectable) return
    e.stopPropagation()
    store.getState().hover(id)
    document.body.style.cursor = 'pointer'
  }
  const onOut = () => {
    if (store.getState().hoveredId === id) store.getState().hover(null)
    document.body.style.cursor = ''
  }

  return (
    <group
      ref={outer}
      name={id}
      position={position}
      rotation={rotation}
      userData={{ componentId: id }}
      onClick={onClick}
      onPointerOver={onOver}
      onPointerOut={onOut}
    >
      {children}
      {labelAnchor && <PartLabel id={id} position={labelAnchor} hidden={labelHidden} />}
    </group>
  )
}
