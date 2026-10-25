/**
 * Car Concept GLB (public/models/vehicle/khronos-carconcept.glb) → explorer
 * component ids. Pure; node names were read from the optimised file (see the
 * manifest's processing notes: all 97 original names survive, and six named
 * parents became groups holding an unnamed mesh child).
 *
 * Model frame: metres, +Y up, front of the car towards +Z, wheels on y = 0.
 * Every procedural module in vehicleLayout.ts uses this same frame.
 */

/** Exact node name → component id. Groups take all their children with them. */
export const CARCONCEPT_NODE_COMPONENT: Readonly<Record<string, string>> = {
  // Structure and fixed panels
  BodyPanelsColor2: 'body-shell',
  BodyRoofPanel: 'body-shell',
  BodyPillars: 'body-shell',
  'License Plate': 'body-shell',
  // Glazing
  BodyWindshield: 'windscreen',
  BodyWindshieldGasket: 'windscreen',
  BodyWindshieldWipers: 'windscreen',
  BodyWindshieldWipersBase: 'windscreen',
  // Opening panels (groups with usable pivots)
  BodyHood: 'front-clamshell',
  BodyRearPanelsColor1: 'rear-clamshell',
  BodyDoorLColor1: 'side-doors',
  BodyDoorRColor1: 'side-doors',
  // Cabin
  InteriorCage: 'cabin-interior',
  InteriorDashMid: 'cabin-interior',
  InteriorDashSides: 'cabin-interior',
  InteriorFloor: 'cabin-interior',
  InteriorFloormats: 'cabin-interior',
  InteriorMid: 'cabin-interior',
  InteriorPillar: 'cabin-interior',
  InteriorSeatsColor1: 'cabin-interior',
  InteriorSeatsColor2: 'cabin-interior',
  InteriorSeatsFrame1: 'cabin-interior',
  InteriorSeatsFrame2: 'cabin-interior',
  InteriorSteeringDash: 'cabin-interior',
  // Controls
  InteriorPedalAccel: 'accelerator-pedal',
  InteriorPedalAccelArm: 'accelerator-pedal',
  InteriorPedalBrake: 'footbrake-pedal',
  InteriorPedalBrakeArm: 'footbrake-pedal',
  InteriorSteeringCylinder: 'steering-wheel',
  InteriorSteeringHandleL: 'steering-wheel',
  InteriorSteeringHandleR: 'steering-wheel',
  InteriorSteeringDashColumn: 'steering-column',
  InteriorSteeringBase: 'steering-column',
  // Engine (one fused placeholder mesh)
  Engine: 'engine-unit',
  // Wheel assemblies (children of the WheelFrontL / … groups)
  WheelFrontLRim: 'road-wheels',
  WheelFrontRRim: 'road-wheels',
  WheelRearLRim: 'road-wheels',
  WheelRearRRim: 'road-wheels',
  WheelFrontLBrakeDisc: 'brake-discs',
  WheelFrontRBrakeDisc: 'brake-discs',
  WheelRearLBrakeDisc: 'brake-discs',
  WheelRearRBrakeDisc: 'brake-discs',
  WheelFrontLBrakePad: 'brake-calipers',
  WheelFrontRBrakePad: 'brake-calipers',
  WheelRearLBrakePad: 'brake-calipers',
  WheelRearRBrakePad: 'brake-calipers',
}

/** The scene root: a group (with the Z-up → Y-up rotation) whose own mesh moved into an unnamed child — the floor pan. */
export const CARCONCEPT_ROOT = 'BodyUnderside'
/** Wheel hub groups: not mapped themselves; their rim, disc, caliper and unnamed tyre child are. */
export const CARCONCEPT_WHEEL_GROUPS = ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR'] as const
/** One fused mesh holding both axles; split at z = 0 into the front (driveshafts) and rear (stub axles) halves. */
export const CARCONCEPT_AXLES = 'Axles'
export const AXLE_SPLIT = { front: 'driveshafts', rear: 'rear-stub-axles' } as const

/**
 * Component for one GLB node, or null when the node is not mapped by name.
 * `parentName` resolves the unnamed children: the tyre inside each wheel
 * group and the floor-pan mesh under the root.
 */
export function classifyCarConceptNode(name: string, parentName: string | null): string | null {
  const direct = CARCONCEPT_NODE_COMPONENT[name]
  if (direct) return direct
  if (!name && parentName && (CARCONCEPT_WHEEL_GROUPS as readonly string[]).includes(parentName)) return 'tyres'
  if (!name && parentName === CARCONCEPT_ROOT) return 'body-shell'
  return null
}

type Vec3 = [number, number, number]

export interface HingeSpec {
  /** Node whose own origin is the hinge (measured, see manifest framing). */
  node: string
  axis: 'x' | 'y'
  /** Opening angle in radians about `axis` (sign chosen so the panel swings away from the body). */
  openAngle: number
}

const DEG = Math.PI / 180

/**
 * Doors hinge at their front edge about Y; the clamshells tilt about X at
 * their outer lower edge. Left (+X) door: a negative Y rotation swings its
 * rear edge outwards; the right door mirrors it.
 */
export const CARCONCEPT_HINGES: readonly HingeSpec[] = [
  { node: 'BodyDoorLColor1', axis: 'y', openAngle: -58 * DEG },
  { node: 'BodyDoorRColor1', axis: 'y', openAngle: 58 * DEG },
  { node: 'BodyHood', axis: 'x', openAngle: 62 * DEG },
  { node: 'BodyRearPanelsColor1', axis: 'x', openAngle: -58 * DEG },
]

/** Hinge pivots as measured in the model (used by tests and the 2D fallback). */
export const CARCONCEPT_PIVOTS: Readonly<Record<string, Vec3>> = {
  BodyDoorLColor1: [1.09, 0.64, 1.0],
  BodyDoorRColor1: [-1.09, 0.64, 1.0],
  BodyHood: [0, 0.18, 2.38],
  BodyRearPanelsColor1: [0, 0.42, -1.93],
}
