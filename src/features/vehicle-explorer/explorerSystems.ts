/**
 * Vehicle explorer — systems, components and deep-link resolution (pure; no
 * three.js, no React). Every component id listed here is documented in
 * src/content/components/vehicle.json.
 *
 * Component ids are plural / vehicle-specific (`brake-discs`, `coil-springs`,
 * `side-doors`) on purpose: they name *all four* instances in the car, and
 * they stay distinct from the single close-up parts in the labs. Deep links
 * with the lab-style singular ids (`?component=brake-disc`) resolve through
 * COMPONENT_ALIASES.
 */

export const EXPLORER_SYSTEM_IDS = [
  'body',
  'engine',
  'drivetrain',
  'braking',
  'suspension',
  'steering',
  'electrical',
  'cooling',
  'exhaust',
] as const

export type ExplorerSystemId = (typeof EXPLORER_SYSTEM_IDS)[number]

type Vec3 = [number, number, number]

export interface ExplorerSystem {
  id: ExplorerSystemId
  /** Panel heading, e.g. "Transmission & drivetrain". */
  name: string
  /** Hotspot / chip label, e.g. "Drivetrain". */
  short: string
  /** Beginner explanation: what the system does. */
  summary: string
  /** Technical explanation. */
  technical: string
  /** Where it sits in this car (used by the text alternative). */
  location: string
  /** Component ids in display order. */
  componentIds: readonly string[]
  /** Lesson topics, most relevant first. The first one that exists is the primary lesson. */
  topicIds: readonly string[]
  /** Laboratory id (features/labs registry) that explores this system in depth. */
  labId?: string
  /** Direction the camera looks from when the system is framed (from target towards camera). */
  view: Vec3
}

export const EXPLORER_SYSTEMS: readonly ExplorerSystem[] = [
  {
    id: 'body',
    name: 'Body & exterior',
    short: 'Body',
    summary:
      'The body is the car’s protective shell. It carries the loads fed in by the wheels, keeps the occupants safe in a crash and shapes the air flowing past.',
    technical:
      'Most modern cars use a monocoque: pressed steel or aluminium panels joined into one stiff structure, with no separate chassis frame. Opening panels — here two doors and the concept car’s front and rear clamshells — hang on hinges and carry little structural load. The outer skin and glazing set the drag coefficient and frontal area.',
    location: 'Everything you see from outside: roof, pillars, sills, floor, glazing, two doors and front and rear clamshells that tilt open.',
    componentIds: ['body-shell', 'front-clamshell', 'rear-clamshell', 'side-doors', 'windscreen', 'cabin-interior'],
    topicIds: ['chassis-construction', 'aerodynamics'],
    view: [1, 0.45, 1.15],
  },
  {
    id: 'engine',
    name: 'Engine & fuel',
    short: 'Engine',
    summary:
      'The engine turns the chemical energy in fuel into a turning force at the crankshaft. The fuel tank stores the fuel, and the accelerator pedal tells the engine how much power you want.',
    technical:
      'Here the engine sits across the car (transversely) ahead of the front axle, so its crankshaft runs side to side and lines up with the transaxle. The accelerator pedal is an input to the engine management, which meters air and fuel together. The tank sits low between the axles, ahead of the rear wheels, where it is best protected in a collision.',
    location: 'Under the front clamshell, ahead of the front wheels. The fuel tank sits low, just ahead of the rear axle, and the accelerator pedal is in the footwell.',
    componentIds: ['engine-unit', 'accelerator-pedal', 'fuel-tank'],
    topicIds: ['four-stroke-cycle', 'engine-layouts', 'fuel-injection'],
    labId: 'engine',
    view: [0.85, 0.95, 1],
  },
  {
    id: 'drivetrain',
    name: 'Transmission & drivetrain',
    short: 'Drivetrain',
    summary:
      'The drivetrain carries the engine’s turning force to the driven wheels. Gears trade speed for torque, and a differential lets the two wheels turn at different speeds in a corner.',
    technical:
      'This explorer assumes front-wheel drive with a transverse engine. A clutch in the bellhousing couples the engine to a transaxle, which houses the gearbox, final drive and differential in one casing. Two driveshafts of unequal length, each with a constant-velocity joint at both ends, carry drive to the front hubs while the wheels steer and ride over bumps.',
    location: 'Bolted to the left-hand end of the engine, with the final drive on the front axle line and driveshafts running out to both front wheels.',
    componentIds: ['clutch-bellhousing', 'transaxle', 'final-drive', 'driveshafts'],
    topicIds: ['drivetrain-layouts', 'manual-gearbox', 'differential', 'driveshafts-and-cv-joints'],
    labId: 'transmission',
    view: [1, 0.6, 0.55],
  },
  {
    id: 'braking',
    name: 'Brakes',
    short: 'Brakes',
    summary:
      'The brakes turn the car’s movement energy into heat. Pressing the pedal pushes fluid through the pipes to the calipers, which squeeze pads against a disc spinning with each wheel.',
    technical:
      'A servo multiplies the driver’s pedal force before it reaches the master cylinder, which converts it into hydraulic pressure. Steel pipes and short flexible hoses carry that pressure to a caliper at every wheel. Brake fluid hardly compresses, so the pressure is the same throughout the circuit, and the caliper pistons’ larger area turns it into a much larger clamping force.',
    location: 'A disc and caliper inside each wheel, the pedal in the footwell and the servo and master cylinder on the bulkhead in front of it.',
    componentIds: ['brake-discs', 'brake-calipers', 'footbrake-pedal', 'servo-and-master-cylinder', 'brake-pipes'],
    topicIds: ['brake-hydraulics', 'disc-brakes', 'anti-lock-braking'],
    labId: 'braking',
    view: [1, 0.4, 0.45],
  },
  {
    id: 'suspension',
    name: 'Suspension & wheels',
    short: 'Suspension',
    summary:
      'The suspension lets each wheel rise and fall over bumps while keeping the tyre pressed onto the road, so the car stays comfortable and keeps its grip.',
    technical:
      'Each corner is drawn as a coil spring around a damper (a strut at the front, a coil-over at the rear) plus a lower control arm. The spring carries the car’s weight and stores the energy of a bump; the damper turns that energy into heat so the body stops bouncing; the arms fix the wheel’s path and pass braking and cornering forces into the body.',
    location: 'At all four corners, just inboard of each wheel.',
    componentIds: ['road-wheels', 'tyres', 'coil-springs', 'dampers', 'control-arms', 'rear-stub-axles'],
    topicIds: ['suspension-basics', 'springs-and-dampers', 'tyres-and-grip'],
    labId: 'suspension',
    view: [1, 0.38, 0.12],
  },
  {
    id: 'steering',
    name: 'Steering',
    short: 'Steering',
    summary:
      'Turning the steering wheel spins a small pinion gear that slides a toothed rack sideways. Tie rods at each end of the rack swivel the front wheels.',
    technical:
      'The column and an intermediate shaft carry the driver’s input down to the rack-and-pinion steering gear, mounted across the car. Rack travel per turn of the wheel sets the steering ratio. The tie rods join steering arms on each front hub, and their geometry decides how far each wheel turns — the inside wheel turns further in a corner.',
    location: 'Steering wheel and column in the centre of the cabin; the rack runs across the car just behind the front axle line and links to both front hubs.',
    componentIds: ['steering-wheel', 'steering-column', 'steering-gear', 'tie-rods'],
    topicIds: ['steering-systems'],
    view: [0.55, 1.1, 0.75],
  },
  {
    id: 'electrical',
    name: 'Electrical system',
    short: 'Electrical',
    summary:
      'A 12-volt battery starts the engine and powers the car while it is parked. Once the engine runs, a belt-driven alternator supplies the electrical loads and recharges the battery.',
    technical:
      'The starter motor draws hundreds of amps for a few seconds, so it is fed by short, heavy cables straight from the battery. The alternator makes alternating current that is rectified to direct current and regulated to about 14 volts. Everything else — lights, sensors and control units — is fed through fused circuits in the wiring harness, which is not drawn here.',
    location: 'Battery in the front right-hand corner of the engine bay; alternator and starter motor mounted on the engine.',
    componentIds: ['battery', 'alternator', 'starter-motor', 'battery-cables'],
    topicIds: ['battery-and-starter', 'alternator-and-charging'],
    view: [-0.8, 0.95, 1],
  },
  {
    id: 'cooling',
    name: 'Cooling system',
    short: 'Cooling',
    summary:
      'The cooling system carries surplus heat away from the engine. Coolant flows through passages around the cylinders, then through the radiator at the front, where passing air takes the heat away.',
    technical:
      'A pump circulates a water–glycol coolant, and a thermostat keeps it out of the radiator until the engine is warm. Hoses join the engine to the radiator, whose thin tubes and fins expose a large area to air rammed in through the grille — or pulled through by the electric fan when the car moves slowly.',
    location: 'Radiator and fan at the very front, ahead of the engine, joined to it by hoses.',
    componentIds: ['radiator', 'radiator-fan', 'coolant-hoses'],
    topicIds: ['cooling-system'],
    view: [0.45, 0.55, 1],
  },
  {
    id: 'exhaust',
    name: 'Exhaust system',
    short: 'Exhaust',
    summary:
      'The exhaust collects the hot gas leaving the engine, cleans it in a catalytic converter, quietens it and releases it behind the car.',
    technical:
      'The manifold gathers gas from the exhaust ports. The catalytic converter sits close to the engine so it heats up quickly; it oxidises carbon monoxide and unburnt hydrocarbons and reduces nitrogen oxides. Pipes carry the gas along the floor to the silencer, whose chambers and perforated tubes cancel pressure pulses before the tailpipe.',
    location: 'From the back of the engine, down and along the centre of the floor, past the fuel tank to a silencer behind the rear axle.',
    componentIds: ['exhaust-manifold', 'catalytic-converter', 'exhaust-pipework', 'rear-silencer'],
    topicIds: ['four-stroke-cycle', 'fuel-injection', 'diagnosing-warning-signs'],
    view: [-0.85, 0.3, -0.9],
  },
]

const systemById = new Map(EXPLORER_SYSTEMS.map((s) => [s.id, s]))
const systemByComponent = new Map(EXPLORER_SYSTEMS.flatMap((s) => s.componentIds.map((c) => [c, s.id] as const)))

/** Every component the explorer can show, in system order. */
export const EXPLORER_COMPONENT_IDS: readonly string[] = EXPLORER_SYSTEMS.flatMap((s) => s.componentIds)

export const isExplorerSystemId = (v: unknown): v is ExplorerSystemId =>
  typeof v === 'string' && (EXPLORER_SYSTEM_IDS as readonly string[]).includes(v)

export const getExplorerSystem = (id: ExplorerSystemId): ExplorerSystem => systemById.get(id)!

/** The explorer system a component belongs to, or null if it is not an explorer component. */
export const systemOfComponent = (componentId: string): ExplorerSystemId | null => systemByComponent.get(componentId) ?? null

export const componentsOfSystem = (systemId: ExplorerSystemId): readonly string[] => getExplorerSystem(systemId).componentIds

/** Lab-style and research-naming ids (see public/models/manifest.json componentMap) → explorer ids. */
export const COMPONENT_ALIASES: Readonly<Record<string, string>> = {
  body: 'body-shell',
  bonnet: 'front-clamshell',
  hood: 'front-clamshell',
  'boot-lid': 'rear-clamshell',
  door: 'side-doors',
  doors: 'side-doors',
  windshield: 'windscreen',
  engine: 'engine-unit',
  'engine-block': 'engine-unit',
  'brake-disc': 'brake-discs',
  'brake-rotor': 'brake-discs',
  'brake-caliper': 'brake-calipers',
  'brake-pedal': 'footbrake-pedal',
  'master-cylinder': 'servo-and-master-cylinder',
  'brake-servo': 'servo-and-master-cylinder',
  'brake-line': 'brake-pipes',
  'brake-lines': 'brake-pipes',
  wheel: 'road-wheels',
  wheels: 'road-wheels',
  tyre: 'tyres',
  tire: 'tyres',
  'coil-spring': 'coil-springs',
  spring: 'coil-springs',
  damper: 'dampers',
  'shock-absorber': 'dampers',
  'control-arm': 'control-arms',
  'lower-control-arm': 'control-arms',
  'steering-rack': 'steering-gear',
  'rack-and-pinion': 'steering-gear',
  'tie-rod': 'tie-rods',
  clutch: 'clutch-bellhousing',
  gearbox: 'transaxle',
  differential: 'final-drive',
  driveshaft: 'driveshafts',
  'starter': 'starter-motor',
  fan: 'radiator-fan',
  'cooling-fan': 'radiator-fan',
  muffler: 'rear-silencer',
  silencer: 'rear-silencer',
  'catalytic-converter-unit': 'catalytic-converter',
}

/**
 * Content `systemId`s used by other component files (labs) → explorer system.
 * Lets a deep link to any documented component land on the right system even
 * when the explorer does not model that exact part.
 */
export const CONTENT_SYSTEM_TO_EXPLORER: Readonly<Record<string, ExplorerSystemId>> = {
  body: 'body',
  vehicle: 'body',
  engine: 'engine',
  fuel: 'engine',
  transmission: 'drivetrain',
  drivetrain: 'drivetrain',
  braking: 'braking',
  brakes: 'braking',
  suspension: 'suspension',
  wheels: 'suspension',
  steering: 'steering',
  electrical: 'electrical',
  cooling: 'cooling',
  exhaust: 'exhaust',
}

export interface ExplorerTarget {
  systemId: ExplorerSystemId | null
  componentId: string | null
}

/**
 * Resolve `?system=` / `?component=` into an explorer target. A component wins
 * over a system. Unknown values resolve to nothing (whole-vehicle view).
 * `contentSystemOf` looks up a documented component's content systemId, so a
 * lab component id still focuses the matching explorer system.
 */
export function resolveExplorerTarget(
  query: { system?: string | null; component?: string | null },
  contentSystemOf: (componentId: string) => string | undefined = () => undefined,
): ExplorerTarget {
  const raw = query.component?.trim().toLowerCase()
  if (raw) {
    const id = systemOfComponent(raw) ? raw : COMPONENT_ALIASES[raw]
    if (id && systemOfComponent(id)) return { systemId: systemOfComponent(id), componentId: id }
    const contentSystem = contentSystemOf(raw)
    const mapped = contentSystem ? CONTENT_SYSTEM_TO_EXPLORER[contentSystem] : undefined
    if (mapped) return { systemId: mapped, componentId: null }
  }
  const system = query.system?.trim().toLowerCase()
  return { systemId: isExplorerSystemId(system) ? system : null, componentId: null }
}

/** URL of the explorer focused on a system or component. */
export function explorerHref(target: Partial<ExplorerTarget>): string {
  if (target.componentId) return `/explore?component=${encodeURIComponent(target.componentId)}`
  if (target.systemId) return `/explore?system=${encodeURIComponent(target.systemId)}`
  return '/explore'
}

/* ------------------------------------------------------------------------ */
/* Which model supplies which component                                      */
/* ------------------------------------------------------------------------ */

/** The vehicle body actually rendered: the CC BY Car Concept GLB, the CC0 Kenney sedan, or the original procedural car. */
export type ModelKind = 'carconcept' | 'kenney' | 'procedural'

/** Components drawn from the loaded model's own geometry. */
export const MODEL_COMPONENTS: Readonly<Record<ModelKind, readonly string[]>> = {
  carconcept: [
    'body-shell',
    'front-clamshell',
    'rear-clamshell',
    'side-doors',
    'windscreen',
    'cabin-interior',
    'engine-unit',
    'accelerator-pedal',
    'footbrake-pedal',
    'road-wheels',
    'tyres',
    'brake-discs',
    'brake-calipers',
    'steering-wheel',
    'steering-column',
    'driveshafts',
    'rear-stub-axles',
  ],
  kenney: ['body-shell', 'road-wheels'],
  procedural: ['body-shell', 'windscreen', 'road-wheels', 'tyres'],
}

/** Original procedural parts drawn for every model (the Car Concept has no internals beyond a placeholder engine). */
export const PROCEDURAL_ALWAYS: readonly string[] = [
  'fuel-tank',
  'clutch-bellhousing',
  'transaxle',
  'final-drive',
  'driveshafts',
  'servo-and-master-cylinder',
  'brake-pipes',
  'coil-springs',
  'dampers',
  'control-arms',
  'steering-column',
  'steering-gear',
  'tie-rods',
  'battery',
  'alternator',
  'starter-motor',
  'battery-cables',
  'radiator',
  'radiator-fan',
  'coolant-hoses',
  'exhaust-manifold',
  'catalytic-converter',
  'exhaust-pipework',
  'rear-silencer',
]

/** Procedural stand-ins drawn only when the model lacks the part. */
export const PROCEDURAL_SUBSTITUTES: readonly string[] = ['engine-unit', 'brake-discs', 'brake-calipers', 'steering-wheel', 'rear-stub-axles']

export interface ComponentSource {
  model: boolean
  procedural: boolean
}

/** Where a component's geometry comes from for a given model (null: not shown with that model). */
export function componentSource(componentId: string, kind: ModelKind): ComponentSource | null {
  const model = MODEL_COMPONENTS[kind].includes(componentId)
  const procedural = PROCEDURAL_ALWAYS.includes(componentId) || (!model && PROCEDURAL_SUBSTITUTES.includes(componentId))
  return model || procedural ? { model, procedural } : null
}

/** Component ids rendered with a given model. */
export function availableComponents(kind: ModelKind): Set<string> {
  return new Set(EXPLORER_COMPONENT_IDS.filter((id) => componentSource(id, kind)))
}

export const MODEL_LABEL: Readonly<Record<ModelKind, string>> = {
  carconcept: 'Car Concept model',
  kenney: 'Kenney sedan (fallback)',
  procedural: 'Simplified AutoVerse car (fallback)',
}
