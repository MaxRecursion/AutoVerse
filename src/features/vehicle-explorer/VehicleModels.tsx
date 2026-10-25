/**
 * The vehicle body the explorer draws, in fallback order:
 *   1. Car Concept (CC BY 4.0, Khronos glTF-Sample-Assets, logo-free, modified) — real named panels, wheels, brakes, engine.
 *   2. Kenney Car Kit sedan (CC0) — fused body + four wheels.
 *   3. An original procedural car — always available.
 * A load or parse failure in one model mounts the next; the canvas never breaks.
 */
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useLabStoreApi } from '@/components/three/LabContext'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { P, selectView } from './explorerConfig'
import { approach, easeInOut } from './explorerVisuals'
import { ExplorerPart } from './ExplorerPart'
import { extractCarConcept, extractKenney, type ExtractedVehicle } from './extractModel'
import { MODEL_COMPONENTS, PROCEDURAL_SUBSTITUTES, type ModelKind } from './explorerSystems'
import { CAR_HUBS } from './vehicleLayout'
import { labelAnchor } from './vehicleParts'
import { ProceduralModules } from './ProceduralModules'
import { SUBSTITUTE_SHAPES } from './vehicleParts'

export const CARCONCEPT_URL = `${import.meta.env.BASE_URL}models/vehicle/khronos-carconcept.glb`
export const KENNEY_URL = `${import.meta.env.BASE_URL}models/vehicle/kenney-car-kit.glb`

/** What the Kenney sedan lacks and the procedural set supplies. */
const KENNEY_SUBSTITUTES = PROCEDURAL_SUBSTITUTES.filter((id) => !MODEL_COMPONENTS.kenney.includes(id))

/** Mounts `children`; on any render/load error, mounts `fallback` instead (and stays there). */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode; name: string }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn(`[AutoVerse] vehicle model "${this.props.name}" failed, using the next fallback:`, error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Tells the UI which model actually rendered (for the attribution and the parts list). */
function useReportModel(kind: ModelKind) {
  const store = useLabStoreApi()
  useEffect(() => {
    const s = store.getState()
    if (s.params[P.model] !== kind) s.setParam(P.model, kind)
    if (s.params[P.ready] !== true) s.setParam(P.ready, true)
  }, [store, kind])
}

/** Swing every hinged panel towards open / closed (eased; instant with reduced motion). */
function useHinges(vehicle: ExtractedVehicle) {
  const store = useLabStoreApi()
  const reduced = usePrefersReducedMotion()
  const t = useRef(selectView(store.getState()).open ? 1 : 0)
  useFrame((_, dt) => {
    const target = selectView(store.getState()).open ? 1 : 0
    if (t.current === target && vehicle.hinges.every((h) => h.pivot.userData.applied === target)) return
    t.current = reduced ? target : approach(t.current, target, Math.min(dt, 0.1), 4.5)
    const k = easeInOut(t.current)
    for (const h of vehicle.hinges) {
      h.pivot.rotation.set(0, 0, 0)
      h.pivot.rotation[h.spec.axis] = h.spec.openAngle * k
      h.pivot.userData.applied = t.current
    }
  })
}

function VehicleParts({ vehicle }: { vehicle: ExtractedVehicle }) {
  useEffect(() => vehicle.dispose, [vehicle])
  useHinges(vehicle)
  return (
    <>
      {[...vehicle.parts].map(([id, objects]) => (
        <ExplorerPart key={id} id={id} labelAnchor={labelAnchor(id)}>
          {objects.map((o) => (
            <primitive key={o.uuid} object={o} />
          ))}
        </ExplorerPart>
      ))}
      {vehicle.rest.map((o) => (
        <primitive key={o.uuid} object={o} />
      ))}
    </>
  )
}

function CarConceptModel() {
  const { scene } = useGLTF(CARCONCEPT_URL, false)
  const vehicle = useMemo(() => extractCarConcept(scene), [scene])
  useReportModel('carconcept')
  return <VehicleParts vehicle={vehicle} />
}

function KenneyModel({ detail }: { detail: 'low' | 'high' }) {
  const { scene } = useGLTF(KENNEY_URL, false)
  const vehicle = useMemo(() => extractKenney(scene, CAR_HUBS), [scene])
  useReportModel('kenney')
  return (
    <>
      <VehicleParts vehicle={vehicle} />
      <ProceduralModules source={SUBSTITUTE_SHAPES} only={KENNEY_SUBSTITUTES} detail={detail} />
    </>
  )
}

function ProceduralModel({ detail }: { detail: 'low' | 'high' }) {
  useReportModel('procedural')
  return <ProceduralModules source={SUBSTITUTE_SHAPES} detail={detail} />
}

/** The vehicle body with its fallback chain. */
export function VehicleModel({ forceModel, detail }: { forceModel?: ModelKind; detail: 'low' | 'high' }) {
  const procedural = <ProceduralModel detail={detail} />
  const kenney = (
    <ModelBoundary name="kenney" fallback={procedural}>
      <Suspense fallback={null}>
        <KenneyModel detail={detail} />
      </Suspense>
    </ModelBoundary>
  )
  if (forceModel === 'procedural') return procedural
  if (forceModel === 'kenney') return kenney
  return (
    <ModelBoundary name="carconcept" fallback={kenney}>
      <Suspense fallback={null}>
        <CarConceptModel />
      </Suspense>
    </ModelBoundary>
  )
}
