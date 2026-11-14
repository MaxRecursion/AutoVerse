/**
 * Production engines the Engine Sound Lab can play, from three cylinders to
 * ten. Every layout, bank angle and firing order here was used in a car you
 * could buy; firing orders are in the maker's own cylinder numbering. Where we
 * could not confirm a maker's firing order, `order` is null and the lab labels
 * firings by bank instead of inventing numbers.
 *
 * `voice` is not measured data: it tunes the synthesiser (exhaust length,
 * brightness, roughness) so each engine sits in a believable place. The
 * rhythm — when each cylinder fires and into which exhaust — is the part that
 * comes from the engine itself.
 */
import { evenIntervals, pairedVIntervals, type Bank } from './firing'

export type Layout = 'inline' | 'flat' | 'v'

export interface EngineVoice {
  /** Effective exhaust length (m); sets the pipe's resonant pitch. */
  pipeLength: number
  /** Pipe reflection, −1…1. Negative is an open pipe end (odd harmonics), positive is a closed, boomy one. */
  reflection: number
  /** Low-pass corner at full throttle (Hz): how bright the engine sounds. */
  brightness: number
  /** Body/muffler resonance (Hz) and its sharpness. */
  bodyHz: number
  bodyQ: number
  /** Distortion drive, 0…1: rasp. */
  grit: number
  /** Width of each exhaust pulse, in crank degrees. */
  pulseDeg: number
  /** Extra delay (ms) before a cylinder's pulse reaches the collector (unequal-length headers). */
  headerDelayMs?: Partial<Record<number, number>>
  /**
   * Illustrative runner spread (ms): cylinders further from the collector reach
   * it later and a little weaker, so each cylinder has its own path and the
   * firing order becomes audible. 0 means perfectly equal-length headers.
   */
  runnerSpreadMs?: number
}

/** Paired-crankpin V geometry, used to compute gaps and to drive the bank-angle experiment. */
export interface PairedV {
  bankAngle: number
  split: number
  startWithPair: boolean
}

export interface EngineSpec {
  id: string
  /** Short name used on chips, e.g. "Cross-plane V8". */
  name: string
  cylinders: 3 | 4 | 5 | 6 | 8 | 10
  layout: Layout
  /** Angle between the banks; 0 for inline, 180 for flat. */
  bankAngle: number
  /** The engine whose rhythm this preset plays. */
  engine: string
  /** Cars it was sold in, with the year it arrived. */
  cars: string[]
  /** Maker's firing order, or null when not verified. */
  order: number[] | null
  /** Cylinders on each bank (maker numbering). Inline engines leave both empty. */
  bankA: number[]
  bankB: number[]
  /** Gaps between firings in crank degrees, summing to 720. */
  intervals: number[]
  /** Set for paired-crankpin V engines, which the bank-angle experiment can reshape. */
  pairedV?: PairedV
  /** Each bank has its own exhaust (heard as left and right). */
  separateBanks: boolean
  idleRpm: number
  redlineRpm: number
  /** One or two sentences: why it sounds the way it does. */
  character: string
  voice: EngineVoice
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
const odd = (n: number) => range(1, n).filter((c) => c % 2 === 1)
const even = (n: number) => range(1, n).filter((c) => c % 2 === 0)

function pairedV(n: number, v: PairedV) {
  return { intervals: pairedVIntervals(n, v.bankAngle, v.split, v.startWithPair), pairedV: v }
}

export const engines: EngineSpec[] = [
  {
    id: 'inline-3',
    name: 'Inline-3',
    cylinders: 3,
    layout: 'inline',
    bankAngle: 0,
    engine: 'Ford 1.0 EcoBoost / Toyota G16E-GTS',
    cars: ['Ford Fiesta and Focus 1.0 EcoBoost (2012)', 'Toyota GR Yaris (2020)'],
    order: [1, 2, 3],
    bankA: [],
    bankB: [],
    intervals: evenIntervals(3),
    separateBanks: false,
    idleRpm: 850,
    redlineRpm: 7000,
    character: 'Three firings per two turns, 240° apart: the slow, off-beat thrum sits between a four and a five, which is why triples sound like half a six.',
    voice: { pipeLength: 1.6, reflection: -0.55, brightness: 2600, bodyHz: 140, bodyQ: 2.2, grit: 0.35, pulseDeg: 150 },
  },
  {
    id: 'inline-4',
    name: 'Inline-4',
    cylinders: 4,
    layout: 'inline',
    bankAngle: 0,
    engine: 'Honda K20A',
    cars: ['Honda Integra Type R DC5 (2001)', 'Honda Civic Type R EP3 (2001)'],
    order: [1, 3, 4, 2],
    bankA: [],
    bankB: [],
    intervals: evenIntervals(4),
    separateBanks: false,
    idleRpm: 800,
    redlineRpm: 8400,
    character: 'A flat-plane crank fires every 180°, so the four-cylinder note is a clean buzz at twice engine speed that turns to a howl near the top.',
    voice: { pipeLength: 1.4, reflection: -0.5, brightness: 3800, bodyHz: 220, bodyQ: 1.6, grit: 0.4, pulseDeg: 140 },
  },
  {
    id: 'flat-4',
    name: 'Flat-4 boxer',
    cylinders: 4,
    layout: 'flat',
    bankAngle: 180,
    engine: 'Subaru EJ257 (unequal-length headers)',
    cars: ['Subaru Impreza WRX STI (2004)'],
    order: [1, 3, 2, 4],
    bankA: [1, 3],
    bankB: [2, 4],
    intervals: evenIntervals(4),
    separateBanks: false,
    idleRpm: 750,
    redlineRpm: 7000,
    character: 'The engine fires evenly, but the headers from each side are different lengths, so pulses reach the shared pipe out of step: the famous boxer burble.',
    voice: { pipeLength: 2.0, reflection: -0.35, brightness: 2200, bodyHz: 110, bodyQ: 2.5, grit: 0.45, pulseDeg: 160, headerDelayMs: { 2: 2.6, 4: 2.6 } },
  },
  {
    id: 'inline-5',
    name: 'Inline-5',
    cylinders: 5,
    layout: 'inline',
    bankAngle: 0,
    engine: 'Audi 2.5 TFSI (EA855)',
    cars: ['Audi TT RS (2009)', 'Audi RS 3 (2011)'],
    order: [1, 2, 4, 5, 3],
    bankA: [],
    bankB: [],
    intervals: evenIntervals(5),
    separateBanks: false,
    idleRpm: 800,
    redlineRpm: 7000,
    character: 'Five firings every 144°, but each cylinder reaches the shared exhaust along a different path, so successive pulses arrive slightly different in time and strength: the pattern repeats once per 720°, and that slow repeat is the warble.',
    voice: { pipeLength: 1.7, reflection: -0.45, brightness: 3000, bodyHz: 160, bodyQ: 2.0, grit: 0.4, pulseDeg: 135, runnerSpreadMs: 1.4 },
  },
  {
    id: 'inline-6',
    name: 'Inline-6',
    cylinders: 6,
    layout: 'inline',
    bankAngle: 0,
    engine: 'Toyota 2JZ-GTE / BMW S58',
    cars: ['Toyota Supra A80 (1993)', 'BMW M3 G80 (2020)'],
    order: [1, 5, 3, 6, 2, 4],
    bankA: [],
    bankB: [],
    intervals: evenIntervals(6),
    separateBanks: false,
    idleRpm: 700,
    redlineRpm: 7200,
    character: 'Perfect primary and secondary balance and a firing every 120°: the smooth, silky rip a straight six is known for.',
    voice: { pipeLength: 1.8, reflection: -0.5, brightness: 3400, bodyHz: 180, bodyQ: 1.7, grit: 0.25, pulseDeg: 120 },
  },
  {
    id: 'flat-6',
    name: 'Flat-6',
    cylinders: 6,
    layout: 'flat',
    bankAngle: 180,
    engine: 'Porsche 4.0 flat-six',
    cars: ['Porsche 911 GT3 991 (2017)'],
    order: [1, 6, 2, 4, 3, 5],
    bankA: [1, 2, 3],
    bankB: [4, 5, 6],
    intervals: evenIntervals(6),
    separateBanks: true,
    idleRpm: 850,
    redlineRpm: 9000,
    character: 'Even 120° firings that alternate between banks, each bank breathing through its own side: a hard-edged metallic scream at 9,000 rpm.',
    voice: { pipeLength: 1.3, reflection: -0.55, brightness: 4800, bodyHz: 260, bodyQ: 1.4, grit: 0.45, pulseDeg: 115 },
  },
  {
    id: 'v6-60',
    name: '60° V6',
    cylinders: 6,
    layout: 'v',
    bankAngle: 60,
    engine: 'Nissan VQ35DE',
    cars: ['Nissan 350Z (2002)', 'Infiniti G35 (2002)'],
    order: [1, 2, 3, 4, 5, 6],
    bankA: odd(6),
    bankB: even(6),
    // Six separate crankpins, 60° apart, give even 120° firing despite the narrow vee.
    intervals: evenIntervals(6),
    separateBanks: true,
    idleRpm: 700,
    redlineRpm: 6600,
    character: 'A six-throw crank fires every 120°, alternating banks: smooth, with the slightly hollow, trumpeting top end of the VQ.',
    voice: { pipeLength: 1.7, reflection: -0.4, brightness: 3000, bodyHz: 170, bodyQ: 1.8, grit: 0.35, pulseDeg: 125 },
  },
  {
    id: 'v6-90-odd',
    name: '90° V6 odd-fire',
    cylinders: 6,
    layout: 'v',
    bankAngle: 90,
    engine: 'Buick odd-fire V6 (225 / 231)',
    cars: ['Jeep CJ-5 Dauntless V6 (1966)', 'Buick Century 3.8 (1975)'],
    order: [1, 6, 5, 4, 3, 2],
    bankA: odd(6),
    bankB: even(6),
    ...pairedV(6, { bankAngle: 90, split: 0, startWithPair: false }),
    separateBanks: false,
    idleRpm: 650,
    redlineRpm: 4500,
    character: 'Built on V8 tooling with shared crankpins, it fires 90° then 150° apart: a lumpy, galloping idle. Buick split the pins by 30° in 1977 to make it even.',
    voice: { pipeLength: 2.2, reflection: -0.3, brightness: 1800, bodyHz: 100, bodyQ: 2.6, grit: 0.3, pulseDeg: 160 },
  },
  {
    id: 'v8-cross',
    name: 'Cross-plane V8',
    cylinders: 8,
    layout: 'v',
    bankAngle: 90,
    engine: 'GM LS1',
    cars: ['Chevrolet Corvette C5 (1997)', 'Pontiac Firebird Trans Am (1998)'],
    order: [1, 8, 7, 2, 6, 5, 4, 3],
    bankA: odd(8),
    bankB: even(8),
    intervals: evenIntervals(8),
    separateBanks: true,
    idleRpm: 650,
    redlineRpm: 6000,
    character: 'Even 90° firing overall, but each bank fires unevenly (twice in a row on one side), so each exhaust pipe hears an irregular beat: the muscle-car burble.',
    voice: { pipeLength: 2.4, reflection: -0.25, brightness: 2000, bodyHz: 95, bodyQ: 2.4, grit: 0.4, pulseDeg: 150 },
  },
  {
    id: 'v8-flat',
    name: 'Flat-plane V8',
    cylinders: 8,
    layout: 'v',
    bankAngle: 90,
    engine: 'Ferrari F136 (4.5)',
    cars: ['Ferrari 458 Italia (2009)'],
    order: [1, 5, 3, 7, 4, 8, 2, 6],
    bankA: [1, 2, 3, 4],
    bankB: [5, 6, 7, 8],
    intervals: evenIntervals(8),
    separateBanks: true,
    idleRpm: 1000,
    redlineRpm: 9000,
    character: 'A flat crank alternates banks perfectly, so each side breathes like a high-revving four: no burble, just a shrieking wail.',
    voice: { pipeLength: 1.4, reflection: -0.55, brightness: 5200, bodyHz: 280, bodyQ: 1.3, grit: 0.5, pulseDeg: 110 },
  },
  {
    id: 'v10-viper',
    name: '90° V10 odd-fire',
    cylinders: 10,
    layout: 'v',
    bankAngle: 90,
    engine: 'Dodge Viper 8.0 V10',
    cars: ['Dodge Viper RT/10 (1992)'],
    order: [1, 10, 9, 4, 3, 6, 5, 8, 7, 2],
    bankA: odd(10),
    bankB: even(10),
    ...pairedV(10, { bankAngle: 90, split: 0, startWithPair: false }),
    separateBanks: true,
    idleRpm: 700,
    redlineRpm: 6000,
    character: 'A 90° block with five shared crankpins 72° apart fires at 54° and 90°: a deep, uneven, truck-like bark. No balance shaft needed.',
    voice: { pipeLength: 2.3, reflection: -0.3, brightness: 2100, bodyHz: 100, bodyQ: 2.2, grit: 0.45, pulseDeg: 140 },
  },
  {
    id: 'v10-s85',
    name: '90° V10 high-rev',
    cylinders: 10,
    layout: 'v',
    bankAngle: 90,
    engine: 'BMW S85',
    cars: ['BMW M5 E60 (2005)', 'BMW M6 E63 (2005)'],
    order: [1, 6, 5, 10, 2, 7, 3, 8, 4, 9],
    bankA: range(1, 5),
    bankB: range(6, 10),
    ...pairedV(10, { bankAngle: 90, split: 0, startWithPair: true }),
    separateBanks: true,
    idleRpm: 800,
    redlineRpm: 8250,
    character: 'The same 54°/90° rhythm as the Viper, but with short, light internals and an 8,250 rpm limit, so it climbs from a rasp to a Formula 1-style shriek.',
    voice: { pipeLength: 1.5, reflection: -0.5, brightness: 4600, bodyHz: 230, bodyQ: 1.5, grit: 0.5, pulseDeg: 115 },
  },
  {
    id: 'v10-gallardo-even',
    name: '90° V10 split-pin',
    cylinders: 10,
    layout: 'v',
    bankAngle: 90,
    engine: 'Lamborghini 5.0 V10',
    cars: ['Lamborghini Gallardo (2003)'],
    order: [1, 6, 5, 10, 2, 7, 3, 8, 4, 9],
    bankA: range(1, 5),
    bankB: range(6, 10),
    ...pairedV(10, { bankAngle: 90, split: -18, startWithPair: true }),
    separateBanks: true,
    idleRpm: 900,
    redlineRpm: 8000,
    character: 'Crankpins split by 18° turn the 90° block into an even-firing V10, a firing every 72°: a smooth, continuous howl.',
    voice: { pipeLength: 1.6, reflection: -0.5, brightness: 4200, bodyHz: 210, bodyQ: 1.5, grit: 0.45, pulseDeg: 115 },
  },
  {
    id: 'v10-audi-52',
    name: '90° V10 FSI odd-fire',
    cylinders: 10,
    layout: 'v',
    bankAngle: 90,
    engine: 'Audi / Lamborghini 5.2 FSI V10',
    cars: ['Lamborghini Gallardo LP560-4 (2008)', 'Audi R8 V10 (2009)'],
    order: [1, 6, 5, 10, 2, 7, 3, 8, 4, 9],
    bankA: range(1, 5),
    bankB: range(6, 10),
    ...pairedV(10, { bankAngle: 90, split: 0, startWithPair: true }),
    separateBanks: true,
    idleRpm: 900,
    redlineRpm: 8700,
    character: 'For the 5.2, the makers went back to shared pins and uneven 54°/90° firing. Listen against the 5.0: rougher, with a harder edge.',
    voice: { pipeLength: 1.5, reflection: -0.5, brightness: 4500, bodyHz: 220, bodyQ: 1.5, grit: 0.55, pulseDeg: 115 },
  },
  {
    id: 'v10-lfa',
    name: '72° V10',
    cylinders: 10,
    layout: 'v',
    bankAngle: 72,
    engine: 'Toyota/Yamaha 1LR-GUE',
    cars: ['Lexus LFA (2010)'],
    order: null,
    bankA: [],
    bankB: [],
    ...pairedV(10, { bankAngle: 72, split: 0, startWithPair: true }),
    separateBanks: true,
    idleRpm: 1000,
    redlineRpm: 9000,
    character: 'The "natural" V10 angle: 72° banks with shared pins fire evenly every 72°. Its light internals spin up so quickly that Lexus gave it a digital rev counter.',
    voice: { pipeLength: 1.3, reflection: -0.55, brightness: 5400, bodyHz: 290, bodyQ: 1.3, grit: 0.45, pulseDeg: 110 },
  },
  {
    id: 'v10-carrera-gt',
    name: '68° V10',
    cylinders: 10,
    layout: 'v',
    bankAngle: 68,
    engine: 'Porsche 980 5.7 V10',
    cars: ['Porsche Carrera GT (2004)'],
    order: [1, 6, 3, 8, 5, 10, 4, 9, 2, 7],
    bankA: range(1, 5),
    bankB: range(6, 10),
    ...pairedV(10, { bankAngle: 68, split: 0, startWithPair: true }),
    separateBanks: true,
    idleRpm: 800,
    redlineRpm: 8400,
    character: 'Born as a racing engine, its banks sit 68° apart, a few degrees narrower than the even-firing 72°, so it fires at 68° and 76°: nearly even, with a faint edge.',
    voice: { pipeLength: 1.35, reflection: -0.55, brightness: 5000, bodyHz: 270, bodyQ: 1.3, grit: 0.5, pulseDeg: 110 },
  },
  {
    id: 'v10-triton',
    name: '90° V10 truck',
    cylinders: 10,
    layout: 'v',
    bankAngle: 90,
    engine: 'Ford 6.8 Triton V10',
    cars: ['Ford E-Series van (1997)', 'Ford F-250 Super Duty (1999)'],
    order: [1, 6, 5, 10, 2, 7, 3, 8, 4, 9],
    bankA: range(1, 5),
    bankB: range(6, 10),
    ...pairedV(10, { bankAngle: 90, split: -18, startWithPair: true }),
    separateBanks: false,
    idleRpm: 600,
    redlineRpm: 4750,
    character: 'Split crankpins and a balance shaft make it even-firing like the Gallardo, but long-stroke and single-exhaust: a low, steady drone for towing.',
    voice: { pipeLength: 2.6, reflection: -0.25, brightness: 1600, bodyHz: 85, bodyQ: 2.4, grit: 0.3, pulseDeg: 150 },
  },
  {
    id: 'v10-magnum',
    name: '90° V10 Magnum truck',
    cylinders: 10,
    layout: 'v',
    bankAngle: 90,
    engine: 'Dodge 8.0 Magnum V10',
    cars: ['Dodge Ram 2500 / 3500 (1994)'],
    order: [1, 10, 9, 4, 3, 6, 5, 8, 7, 2],
    bankA: odd(10),
    bankB: even(10),
    ...pairedV(10, { bankAngle: 90, split: 0, startWithPair: false }),
    separateBanks: false,
    idleRpm: 650,
    redlineRpm: 4500,
    character: 'The iron-block truck V10 keeps shared crankpins and the Dodge 54°/90° firing rhythm. Its lower operating speeds and shared exhaust give this preset a deep, slow pulse alongside the Viper’s sportier voice.',
    voice: { pipeLength: 2.7, reflection: -0.25, brightness: 1500, bodyHz: 85, bodyQ: 2.5, grit: 0.35, pulseDeg: 155 },
  },
  {
    id: 'v10-tdi',
    name: '90° V10 twin-turbo diesel',
    cylinders: 10,
    layout: 'v',
    bankAngle: 90,
    engine: 'Volkswagen 5.0 V10 TDI (07Z)',
    cars: ['Volkswagen Touareg V10 TDI', 'Volkswagen Phaeton V10 TDI'],
    order: [1, 6, 5, 10, 2, 7, 3, 8, 4, 9],
    bankA: range(1, 5),
    bankB: range(6, 10),
    ...pairedV(10, { bankAngle: 90, split: -18, startWithPair: true }),
    separateBanks: true,
    idleRpm: 750,
    redlineRpm: 4500,
    character: 'Volkswagen split the crankpins by 18° to obtain even 72° firing from a 90° diesel block. Two turbochargers and a balance shaft distinguish this low-revving production V10; the softened exhaust voice here is illustrative.',
    voice: { pipeLength: 2.4, reflection: -0.2, brightness: 1200, bodyHz: 80, bodyQ: 2.4, grit: 0.25, pulseDeg: 145 },
  },
]

export const getEngine = (id: string) => engines.find((e) => e.id === id)

export const DEFAULT_ENGINE_ID = 'v10-viper'

/** Which bank a cylinder sits on; engines without a published order alternate by firing position. */
export function bankOf(spec: EngineSpec): (cylinder: number, index: number) => Bank {
  if (spec.layout === 'inline') return () => 'mid'
  if (!spec.order) return (_c, index) => (index % 2 === 0 ? 'A' : 'B')
  return (cylinder) => (spec.bankA.includes(cylinder) ? 'A' : 'B')
}

/** Where the firing data comes from. Linked as further reading; nothing is copied. */
export const soundLabSources = [
  { label: 'Volkswagen Self-Study Programme 303: V10 TDI 90° banks, split pins, even 72° firing and firing order', url: 'https://www.volkspage.net/technik/ssp/ssp/SSP_303_d1.pdf' },
  { label: 'Volkswagen Self-Study Programme 304: V10 TDI cylinder banks and injector numbering', url: 'https://www.vaglinks.com/docs/ssp/VWUSA.COM_SSP_304_EDC-16.pdf' },
  { label: 'Chrysler engineering paper, SAE 933033: the 8.0-litre 90° truck V10', url: 'https://saemobilus.sae.org/papers/chrysler-80-liter-v-10-engine-933033' },
  { label: 'Dodge factory repair manual (2001 Ram 3500, archived): Magnum V10 firing order and cylinder numbering', url: 'https://charm.li/Dodge%20and%20Ram/2001/RAM%203500%20Truck%202WD%20V10-8.0L%20VIN%20W%20MDC/Repair%20and%20Diagnosis/Engine%2C%20Cooling%20and%20Exhaust/Engine/Description%20and%20Operation/' },
  { label: '488 Magnum Designs, original technical explanation: shared crankpins and Dodge V10 54°/90° firing', url: 'https://www.488magnum.com/post/why-do-dodge-v10-s-sound-unique' },
  { label: 'Porsche Cars North America, Carrera GT service training (2004): 68° banks, order 1-6-3-8-5-10-4-9-2-7, 68°/76° gaps', url: 'https://pdfcoffee.com/2004-carrera-gt-pdf-free.html' },
  { label: 'Audi Magazine, "Heart of gold": the R8 V10’s unsplit 90° crank and 90°/54° firing', url: 'https://magazine.audi.com.au/article/heart-of-gold' },
  { label: 'Audi service training (via NHTSA): 5.2 FSI V10 firing order and bank angle', url: 'https://static.nhtsa.gov/odi/tsbs/2016/MC-10119355-9999.pdf' },
  { label: 'Lexus UK media: LFA 72° V10, 9,000 rpm', url: 'https://media.lexus.co.uk/lexus-lfa/' },
  { label: 'Wikipedia: BMW S85 (shared pins, 90°/54°, order 1-6-5-10-2-7-3-8-4-9)', url: 'https://en.wikipedia.org/wiki/BMW_S85' },
  { label: 'Wikipedia: Lamborghini Gallardo (even-firing 5.0, uneven 5.2)', url: 'https://en.wikipedia.org/wiki/Lamborghini_Gallardo' },
  { label: 'Ford Authority: 6.8 Triton V10 split-pin crank, 72° firing', url: 'https://fordauthority.com/fmc/ford-motor-company-engines/ford-modular-family/ford-6-8l-triton-engine' },
  { label: 'Wikipedia: V10 engine (Viper’s 90° odd-fire layout)', url: 'https://en.wikipedia.org/wiki/V10_engine' },
  { label: 'Tenneco / Ricardo / MTS, SAE 1999-01-1652: measured and modelled Dodge Viper exhaust sound', url: 'https://www.bksv.com/media/doc/bn1828.pdf' },
  { label: 'Wikipedia: Firing order (inline, flat and V8 orders)', url: 'https://en.wikipedia.org/wiki/Firing_order' },
  { label: 'Wikipedia: Buick V6 (odd-fire 90° V6 and the 1977 split-pin crank)', url: 'https://en.wikipedia.org/wiki/Buick_V6_engine' },
]

/** The video that inspired the V10 set. Linked only. */
export const soundLabReference = { label: 'Jason Cammisa: Driving Every V10 Ever Made (YouTube)', url: 'https://www.youtube.com/watch?v=F4-RPcSGVFI' }

/** Cylinder counts in the catalogue, for grouping the picker. */
export const cylinderGroups = [...new Set(engines.map((e) => e.cylinders))].sort((a, b) => a - b)
