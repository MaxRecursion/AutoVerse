/**
 * Gearbox laboratory — 3D scene.
 *
 * MODEL DECISION: no licence-verified manual-gearbox asset with separable
 * gears, synchronisers and clutch parts is listed in public/models/manifest.json,
 * so the teaching model is an ORIGINAL procedural five-speed layshaft gearbox
 * with its clutch, built from gearboxModel.ts / gearGeometry.ts. Tooth counts
 * drive the geometry, so meshing gears visibly match.
 *
 * Animation contract: the scene integrates exactly one gear-train phase (the
 * input-shaft angle) per frame in driveSim; every gear, the layshaft, the
 * idler and the locked mainshaft are derived from it through tooth ratios, so
 * teeth never drift. Collar / idler slides and the clutch pose are pure
 * functions of the store's params (and time since a shift began). State is
 * read inside useFrame via store.getState() — no React re-render per frame.
 *
 * The casing's near half (z > 0) is cut away; moving parts are whole.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, DoubleSide, MeshStandardMaterial, type Group, type Mesh, type MeshStandardMaterialParameters } from 'three'
import { useLabStoreApi } from '@/components/three/LabContext'
import { Part } from '@/components/three/Part'
import type { QualityTier } from '@/hooks/useQualityTier'
import { readParams } from './config'
import type { IndirectGearId } from './gearbox'
import { CLUTCH_X, COLLAR_TRAVEL, DOG_WIDTH, FACE_WIDTH, IDLER, IDLER_CENTRE, LAY_REVERSE, LAY_Y, MAIN_Y, STATION } from './gearboxModel'
import { buildGearboxGeometries, disposeAll } from './gearGeometry'
import { createDriveSim, driveFrame, stepDriveSim, type DriveControls, type DriveSim } from './driveSim'
import { GEAR_HUB, MAIN_GEAR_PART, type HubId, type PathKey } from './powerPath'
import { EXPLODE, LABEL, type TransmissionPartId } from './transmissionParts'

/* ------------------------------------------------------------------ */
/* Materials                                                            */
/* ------------------------------------------------------------------ */

function createMaterials() {
  const std = (color: string, metalness: number, roughness: number, extra: MeshStandardMaterialParameters = {}) =>
    new MeshStandardMaterial({
      color,
      metalness,
      roughness,
      emissive: '#000000',
      ...extra,
    })
  return {
    gear: std('#c9ced5', 0.78, 0.28),
    layGear: std('#aeb5be', 0.78, 0.32),
    reverse: std('#b9b2a6', 0.72, 0.34),
    shaft: std('#9aa1aa', 0.8, 0.3),
    hub: std('#8d949d', 0.75, 0.34),
    collar: std('#dfe3e8', 0.82, 0.22),
    brass: std('#c9a25a', 0.85, 0.3),
    flywheel: std('#6f7680', 0.72, 0.42),
    ring: std('#8a9099', 0.75, 0.36),
    facing: std('#5d4a3a', 0.05, 0.92),
    discSteel: std('#9aa1aa', 0.75, 0.34),
    spring: std('#4f7792', 0.65, 0.38),
    plate: std('#8f969f', 0.72, 0.38),
    cover: std('#3b4149', 0.55, 0.5),
    bolt: std('#c3c8cf', 0.8, 0.28),
    diaphragm: std('#62809a', 0.7, 0.34, { side: DoubleSide }),
    bearing: std('#c0c6cd', 0.8, 0.26),
    fork: std('#b48c45', 0.75, 0.36),
    rail: std('#9aa1aa', 0.8, 0.3),
    casing: std('#8c939c', 0.5, 0.5, { side: DoubleSide }),
    section: std('#8f523d', 0.05, 0.8, {
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  }
}

type Materials = ReturnType<typeof createMaterials>

/* ------------------------------------------------------------------ */
/* Power-path glow                                                      */
/* ------------------------------------------------------------------ */

const AMBER = new Color('#f6a63a')
const BLACK = new Color('#000000')
/** Glow strength with torque fully transmitted; a slipping clutch dims it. */
const GLOW = 0.2

/**
 * Amber emissive on every mesh carrying torque. Part clones materials per
 * mesh and owns hover / selection highlighting, so parts that are hovered or
 * selected are left to Part.
 */
function applyGlow(meshes: Mesh[], path: ReadonlySet<PathKey>, torqueFraction: number, selectedId: string | null, hoveredId: string | null) {
  const strength = GLOW * (0.35 + 0.65 * torqueFraction)
  for (const mesh of meshes) {
    const owner = mesh.userData.componentId as string | undefined
    if (owner && (owner === selectedId || owner === hoveredId)) continue
    const m = mesh.material as MeshStandardMaterial
    if (!m.emissive) continue
    if (path.has(mesh.userData.pathKey as PathKey)) {
      m.emissive.copy(AMBER)
      m.emissiveIntensity = strength
    } else {
      m.emissive.copy(BLACK)
      m.emissiveIntensity = 1
    }
  }
}

/* ------------------------------------------------------------------ */
/* Scene                                                                */
/* ------------------------------------------------------------------ */

const at = (x: number, y = MAIN_Y, z = 0): [number, number, number] => [x, y, z]
const part = (id: TransmissionPartId) => ({
  id,
  explode: EXPLODE[id],
  labelAnchor: LABEL[id],
})

/** Side of the gear its dog ring sits on: towards the synchro hub that locks it. */
const HUB_X: Record<HubId, number> = {
  h34: STATION.hub34,
  h12: STATION.hub12,
  h5: STATION.hub5,
}
const GEAR_X: Record<IndirectGearId, number> = {
  '1': STATION.first,
  '2': STATION.second,
  '3': STATION.third,
  '5': STATION.fifth,
}
const dogOffset = (gearX: number, hubX: number) => Math.sign(hubX - gearX) * (FACE_WIDTH / 2 + DOG_WIDTH / 2)

const HUBS: HubId[] = ['h34', 'h12', 'h5']
const HUB_PART_ID: Record<HubId, TransmissionPartId> = {
  h34: 'synchro-3-4',
  h12: 'synchro-1-2',
  h5: 'synchro-5',
}
const INDIRECT: IndirectGearId[] = ['1', '2', '3', '5']

type AnimKey =
  'flywheel' | 'plateRot' | 'plateSlide' | 'diaphragm' | 'disc' | 'input' | 'pinion' | 'layHead' | 'lay' | 'idlerSlide' | 'idlerRot' | 'bearing' | 'mainshaft'

/** Animated groups, registered through callback refs. */
type Anim = Partial<Record<AnimKey, Group | null>>

export interface TransmissionSceneProps {
  tier: QualityTier
  /** Collars and idler jump to position instead of sliding. */
  reducedMotion?: boolean
}

export function TransmissionScene({ tier, reducedMotion = false }: TransmissionSceneProps) {
  const store = useLabStoreApi()
  const geo = useMemo(() => buildGearboxGeometries(tier), [tier])
  const mats = useMemo(() => createMaterials(), [])
  useEffect(() => () => disposeAll(geo), [geo])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])

  const anim = useRef<Anim>({})
  const mainGears = useRef<Partial<Record<IndirectGearId, Group | null>>>({})
  const hubRot = useRef<Partial<Record<HubId, Group | null>>>({})
  const collars = useRef<Partial<Record<HubId, Group | null>>>({})
  const forks = useRef<Partial<Record<HubId, Group | null>>>({})

  const root = useRef<Group>(null)
  const glowMeshes = useRef<Mesh[]>([])
  // Collect torque-carrying meshes after every Part has cloned its materials (child layout effects run first).
  useLayoutEffect(() => {
    const list: Mesh[] = []
    root.current?.traverse((o) => {
      if ((o as Mesh).isMesh && o.userData.pathKey) list.push(o as Mesh)
    })
    glowMeshes.current = list
  }, [geo])

  const motion = useRef(reducedMotion)
  useEffect(() => {
    motion.current = reducedMotion
  }, [reducedMotion])

  const sim = useRef<DriveSim | null>(null)

  useFrame((_, delta) => {
    const s = store.getState()
    const p = readParams(s.params)
    const controls: DriveControls = {
      gear: p.gear,
      pedal: p.clutch,
      rpm: p.rpm,
      running: p.running,
      instant: motion.current,
    }
    sim.current = stepDriveSim(sim.current ?? createDriveSim(p.gear), Math.min(delta, 0.1), controls)
    const f = driveFrame(sim.current, controls)
    const t = f.train
    const a = anim.current

    // Engine side: flywheel, cover, plate and diaphragm turn together.
    if (a.flywheel) a.flywheel.rotation.x = f.engine
    if (a.plateRot) a.plateRot.rotation.x = f.engine
    if (a.plateSlide) a.plateSlide.position.x = f.clutch.plateRetract
    if (a.diaphragm) a.diaphragm.scale.x = f.clutch.diaphragmScale
    if (a.bearing) a.bearing.position.x = f.clutch.bearingX
    // Gearbox side: everything derives from the one input angle.
    if (a.disc) {
      a.disc.rotation.x = t.input
      a.disc.position.x = f.clutch.discFloat
    }
    if (a.input) a.input.rotation.x = t.input
    if (a.pinion) a.pinion.rotation.x = t.input
    if (a.layHead) a.layHead.rotation.x = t.layshaft
    if (a.lay) a.lay.rotation.x = t.layshaft
    if (a.idlerRot) a.idlerRot.rotation.x = t.idler
    if (a.idlerSlide) a.idlerSlide.position.x = IDLER.disengagedX + (IDLER.engagedX - IDLER.disengagedX) * f.pose.idler
    for (const g of INDIRECT) {
      const grp = mainGears.current[g]
      if (grp) grp.rotation.x = t.main[g]
    }
    if (a.mainshaft) a.mainshaft.rotation.x = f.output
    for (const h of HUBS) {
      const rot = hubRot.current[h]
      if (rot) rot.rotation.x = f.output
      const slide = f.pose[h] * COLLAR_TRAVEL
      const collar = collars.current[h]
      if (collar) collar.position.x = slide
      const fork = forks.current[h]
      if (fork) fork.position.x = HUB_X[h] + slide
    }

    applyGlow(glowMeshes.current, f.path, f.torqueFraction, s.selectedId, s.hoveredId)
  })

  return (
    <group ref={root}>
      <ClutchParts geo={geo} mats={mats} anim={anim} />

      <Part {...part('input-shaft')}>
        <group
          ref={(g) => {
            anim.current.input = g
          }}
          position={at(0)}
        >
          <mesh geometry={geo.shafts.input} material={mats.shaft} userData={{ pathKey: 'input-shaft' }} />
        </group>
      </Part>

      <Part {...part('constant-mesh-gears')}>
        <group
          ref={(g) => {
            anim.current.pinion = g
          }}
          position={at(STATION.head)}
        >
          <mesh geometry={geo.gears.pinion} material={mats.gear} userData={{ pathKey: 'pinion' }} />
          <mesh geometry={geo.gears.dogRing} material={mats.gear} position={[dogOffset(STATION.head, STATION.hub34), 0, 0]} userData={{ pathKey: 'pinion' }} />
        </group>
        <group
          ref={(g) => {
            anim.current.layHead = g
          }}
          position={at(STATION.head, LAY_Y)}
        >
          <mesh geometry={geo.gears.layHead} material={mats.layGear} userData={{ pathKey: 'lay-head' }} />
        </group>
      </Part>

      <Part {...part('layshaft')}>
        <group
          ref={(g) => {
            anim.current.lay = g
          }}
          position={at(0, LAY_Y)}
        >
          <mesh geometry={geo.shafts.lay} material={mats.shaft} userData={{ pathKey: 'layshaft' }} />
          {INDIRECT.map((g) => (
            <mesh key={g} geometry={geo.gears.lay[g]} material={mats.layGear} position={[GEAR_X[g], 0, 0]} userData={{ pathKey: `lay-${g}` }} />
          ))}
          <mesh geometry={geo.gears.layReverse} material={mats.reverse} position={[LAY_REVERSE.x, 0, 0]} userData={{ pathKey: 'lay-reverse' }} />
        </group>
      </Part>

      {INDIRECT.map((g) => (
        <Part key={g} {...part(MAIN_GEAR_PART[g])}>
          <group
            ref={(el) => {
              mainGears.current[g] = el
            }}
            position={at(GEAR_X[g])}
          >
            <mesh geometry={geo.gears.main[g]} material={mats.gear} userData={{ pathKey: `main-${g}` }} />
            <mesh
              geometry={geo.gears.dogRing}
              material={mats.gear}
              position={[dogOffset(GEAR_X[g], HUB_X[GEAR_HUB[g]]), 0, 0]}
              userData={{ pathKey: `main-${g}` }}
            />
          </group>
        </Part>
      ))}

      {HUBS.map((h) => (
        <Part key={h} {...part(HUB_PART_ID[h])}>
          <group
            ref={(el) => {
              hubRot.current[h] = el
            }}
            position={at(HUB_X[h])}
          >
            <mesh geometry={geo.synchro.hub} material={mats.hub} userData={{ pathKey: `sync-${h}` }} />
            <mesh geometry={geo.synchro.baulk} material={mats.brass} userData={{ pathKey: `sync-${h}` }} />
            <group
              ref={(el) => {
                collars.current[h] = el
              }}
            >
              <mesh geometry={geo.synchro.collar} material={mats.collar} userData={{ pathKey: `sync-${h}` }} />
            </group>
          </group>
        </Part>
      ))}

      <Part {...part('reverse-idler')}>
        <mesh geometry={geo.shafts.idler} material={mats.shaft} position={[0, IDLER_CENTRE.y, IDLER_CENTRE.z]} />
        <group
          ref={(g) => {
            anim.current.idlerSlide = g
          }}
          position={[IDLER.disengagedX, IDLER_CENTRE.y, IDLER_CENTRE.z]}
        >
          <group
            ref={(g) => {
              anim.current.idlerRot = g
            }}
          >
            <mesh geometry={geo.gears.idler} material={mats.reverse} userData={{ pathKey: 'idler' }} />
          </group>
        </group>
      </Part>

      <Part {...part('mainshaft')}>
        <group
          ref={(g) => {
            anim.current.mainshaft = g
          }}
          position={at(0)}
        >
          <mesh geometry={geo.shafts.main} material={mats.shaft} userData={{ pathKey: 'mainshaft' }} />
          <mesh geometry={geo.gears.mainReverse} material={mats.reverse} position={[STATION.reverse, 0, 0]} userData={{ pathKey: 'main-reverse' }} />
        </group>
      </Part>

      <Part {...part('selector-forks')}>
        <mesh geometry={geo.forks.rails} material={mats.rail} />
        {HUBS.map((h) => (
          <group
            key={h}
            ref={(el) => {
              forks.current[h] = el
            }}
            position={at(HUB_X[h])}
          >
            <mesh geometry={geo.forks[h]} material={mats.fork} />
          </group>
        ))}
      </Part>

      <Part {...part('gearbox-casing')}>
        <mesh geometry={geo.casing.skin} material={mats.casing} />
        <mesh geometry={geo.casing.walls} material={mats.casing} />
        <mesh geometry={geo.casing.section} material={mats.section} />
      </Part>
    </group>
  )
}

/** Flywheel, clutch disc, pressure plate assembly and release bearing. */
function ClutchParts({ geo, mats, anim }: { geo: ReturnType<typeof buildGearboxGeometries>; mats: Materials; anim: RefObject<Anim> }) {
  const c = geo.clutch
  return (
    <>
      <Part {...part('clutch-flywheel')}>
        <group
          ref={(g) => {
            anim.current.flywheel = g
          }}
          position={at(0)}
        >
          <mesh geometry={c.flywheel} material={mats.flywheel} userData={{ pathKey: 'flywheel' }} />
          <mesh geometry={c.ringGear} material={mats.ring} userData={{ pathKey: 'flywheel' }} />
        </group>
      </Part>

      <Part {...part('clutch-disc')}>
        <group position={at(0)}>
          <group
            ref={(g) => {
              anim.current.disc = g
            }}
          >
            <mesh geometry={c.disc.facing} material={mats.facing} userData={{ pathKey: 'disc' }} />
            <mesh geometry={c.disc.centre} material={mats.discSteel} userData={{ pathKey: 'disc' }} />
            <mesh geometry={c.disc.springs} material={mats.spring} userData={{ pathKey: 'disc' }} />
          </group>
        </group>
      </Part>

      <Part {...part('pressure-plate')}>
        <group
          ref={(g) => {
            anim.current.plateRot = g
          }}
          position={at(0)}
        >
          <group
            ref={(g) => {
              anim.current.plateSlide = g
            }}
          >
            <mesh geometry={c.pressurePlate} material={mats.plate} userData={{ pathKey: 'plate' }} />
          </group>
          <mesh geometry={c.cover} material={mats.cover} userData={{ pathKey: 'plate' }} />
          <mesh geometry={c.coverBolts} material={mats.bolt} userData={{ pathKey: 'plate' }} />
          <group
            ref={(g) => {
              anim.current.diaphragm = g
            }}
            position={[CLUTCH_X.fulcrum, 0, 0]}
          >
            <mesh geometry={c.diaphragm} material={mats.diaphragm} userData={{ pathKey: 'plate' }} />
          </group>
        </group>
      </Part>

      <Part {...part('release-bearing')}>
        <group
          ref={(g) => {
            anim.current.bearing = g
          }}
          position={at(CLUTCH_X.fulcrum)}
        >
          <mesh geometry={c.bearing} material={mats.bearing} />
        </group>
      </Part>
    </>
  )
}
