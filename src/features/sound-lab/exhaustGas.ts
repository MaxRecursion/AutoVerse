/**
 * Exhaust gas for the Sound Lab cutaways, drawn as gas rather than as moving
 * dots. Every cylinder's header is a column of gas that is always full: when
 * the exhaust valve opens the blowdown surges it along (exhaust.ts: the share
 * of the cycle's gas out so far), then the piston pushes out the rest, and
 * while the valve is shut the column stands still and cools towards the pipe
 * walls. Beyond the header the gas moves on at the flow speed through the
 * collectors and tailpipes, each cylinder's on its own route, and out of each
 * outlet into one shared plume that widens, slows, rises and fades.
 *
 * Turbulence is keyed to each parcel of gas, so eddies travel with it and stop
 * when it stops; the view ray's path through the column sets how dense it
 * looks, so it has no hard outline. Hot gas glows (far more brightly the
 * hotter it is), cool gas scatters light as haze, and on the light theme the
 * haze darkens and the glow covers what is behind it, so both still read.
 *
 * Pipe gas and plumes are two geometries sharing one material: the pipe gas
 * draws before the see-through pipe walls (so it sits inside them) and the
 * plumes after. Per frame only uniforms change.
 */
import {
  AddEquation,
  BufferGeometry,
  CatmullRomCurve3,
  ClampToEdgeWrapping,
  CustomBlending,
  Data3DTexture,
  DataTexture,
  Float32BufferAttribute,
  FrontSide,
  LinearFilter,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RedFormat,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  Vector4,
} from 'three'
import type { QualityTier } from '@/hooks/useQualityTier'
import {
  COLLECTOR_RADIUS,
  CYCLE_GAS,
  EXHAUST_OPEN_DEG,
  FLOW_SPEED,
  FLOW_TEXELS,
  GAS_FILL,
  HEADER_GAS,
  HEADER_RADIUS,
  PLUME_LENGTH,
  PLUME_SLOW,
  PLUME_SPREAD,
  RESIDUAL_TOTAL,
  SMEAR_SINGLE_DEG,
  flowTable,
  travelDeg,
  type Vec3,
} from './exhaust'

/** Most cylinders one engine has: the size of the shader's per-cylinder array. */
export const MAX_GAS_SLOTS = 10
/** Cells in the tiling noise volume: long along the flow, so the pattern rarely repeats down a pipe. */
const NOISE_X = 64
const NOISE_YZ = 32
/** Noise cells per scene unit along the flow: eddies a couple of header bores long. */
export const NOISE_ALONG = 5
/** Where the noise pattern repeats along the flow, in scene units. */
export const NOISE_PERIOD = NOISE_X / NOISE_ALONG

/** How far the turbulence moves, in noise cells, for `crankDeg` more degrees of flow at FLOW_SPEED. */
export const noiseStep = (crankDeg: number) => crankDeg * FLOW_SPEED * NOISE_ALONG
/** Past the outlet eddies grow and drift slower: the plume's turbulence is this much coarser and slower. */
const PLUME_NOISE_SCALE = 2.5
export const plumeNoiseStep = (crankDeg: number) => noiseStep(crankDeg) / (PLUME_NOISE_SCALE * PLUME_NOISE_SCALE)
export const wrapNoise = (cells: number) => ((cells % NOISE_X) + NOISE_X) % NOISE_X

export interface GasRoute {
  /** Index into the shader's per-cylinder uniforms. */
  slot: number
  /** The route, port to outlet (or to the end of a header stub). */
  points: Vec3[]
  /** The exact curves used to draw the header, collector and tailpipe. */
  segments?: Vec3[][]
  /** For each segment, how many cylinders' gas shares that pipe (shares out the collectors' residual haze). */
  feeds?: number[]
  /** Where the header ends and the wider collector starts, along the route. */
  headerLength: number
  /** Carry on past the outlet as a plume (whole engine), or fade out at the end of a header stub. */
  plume: boolean
}

interface Ring {
  centre: Vector3
  tangent: Vector3
  radius: number
  /** Distance from the port (in a plume: its routes' mean length, plus the distance past the outlet). */
  dist: number
  /** 0 inside the pipes, rising to 1 at the end of the plume. */
  plume: number
  fade: number
  /** Crank degrees gas takes to get here: from its port in a pipe, from the outlet in a plume. */
  time: number
  /** Length of this route's header column (0 in a plume). */
  header: number
  /** Cylinders sharing this stretch of pipe. */
  feeds: number
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Centre-line samples for one route's pipes, port to outlet (or to the end of a header stub). */
function routeRings(route: GasRoute, spacing: number): Ring[] {
  const curves = (route.segments ?? [route.points]).map((points) => new CatmullRomCurve3(points.map((p) => new Vector3(...p)), false, 'catmullrom', 0.2))
  const lengths = curves.map((curve) => curve.getLength())
  const length = lengths.reduce((total, part) => total + part, 0)
  const headerLength = route.segments ? lengths[0]! : route.headerLength
  const rings: Ring[] = []
  const headerR = HEADER_RADIUS * GAS_FILL
  const pipeR = (route.plume ? COLLECTOR_RADIUS : HEADER_RADIUS) * GAS_FILL
  let offset = 0
  curves.forEach((curve, part) => {
    const partLength = lengths[part]!
    const steps = Math.max(8, Math.ceil(partLength / spacing))
    for (let i = part === 0 ? 0 : 1; i <= steps; i++) {
      const u = i / steps
      const dist = offset + u * partLength
      rings.push({
        centre: curve.getPointAt(u),
        tangent: curve.getTangentAt(u).normalize(),
        radius: headerR + (pipeR - headerR) * smooth(headerLength - 0.12, headerLength + 0.12, dist),
        dist,
        plume: 0,
        // A header stub fades out where the rest of the exhaust would carry on.
        fade: route.plume ? 1 : 1 - smooth(length - 0.45, length, dist),
        time: travelDeg(dist, length),
        header: headerLength,
        feeds: route.feeds?.[part] ?? 1,
      })
    }
    offset += partLength
  })
  return rings
}

/**
 * The plume leaving one outlet, fed by every cylinder that exhausts through
 * it: it widens like a turbulent jet, slows (exhaust.ts travelDeg) and, hot
 * and buoyant, curls upwards. One plume per outlet, so the puffs of several
 * cylinders follow one another through the same cloud.
 */
function plumeRings(outlet: Ring, spacing: number, routeLength: number): Ring[] {
  const direction = outlet.tangent.clone()
  const up = new Vector3(0, 1, 0)
  const steps = Math.max(6, Math.ceil(PLUME_LENGTH / spacing))
  const rings: Ring[] = []
  for (let i = 0; i <= steps; i++) {
    const s = (i / steps) * PLUME_LENGTH
    const t = s / PLUME_LENGTH
    rings.push({
      centre: outlet.centre.clone().addScaledVector(direction, s).addScaledVector(up, 0.07 * s * s),
      tangent: direction.clone().addScaledVector(up, 0.14 * s).normalize(),
      radius: outlet.radius + PLUME_SPREAD * s,
      dist: routeLength + s,
      plume: t,
      fade: 1 - smooth(0.55, 1, t),
      time: travelDeg(routeLength + s, routeLength) - routeLength / FLOW_SPEED,
      header: 0,
      feeds: 1,
    })
  }
  return rings
}

interface GasArrays {
  position: number[]
  normal: number[]
  direction: number[]
  radius: number[]
  dist: number[]
  around: number[]
  slot: number[]
  time: number[]
  plume: number[]
  fade: number[]
  mask: number[]
  header: number[]
  feeds: number[]
  index: number[]
}

/** Rings round a centre line, with a parallel-transported frame so the tube does not twist round bends. */
function addTube(out: GasArrays, rings: Ring[], radial: number, slot: number, mask: number) {
  const n = new Vector3()
  const b = new Vector3()
  const ring = new Vector3()
  const first = rings[0]!.tangent
  n.set(Math.abs(first.x) < 0.9 ? 1 : 0, Math.abs(first.x) < 0.9 ? 0 : 1, 0).cross(first).normalize()
  const base = out.position.length / 3
  rings.forEach((r, i) => {
    if (i > 0) {
      const prev = rings[i - 1]!.tangent
      const axis = new Vector3().crossVectors(prev, r.tangent)
      const sin = axis.length()
      if (sin > 1e-6) n.applyAxisAngle(axis.divideScalar(sin), Math.atan2(sin, prev.dot(r.tangent)))
      n.addScaledVector(r.tangent, -n.dot(r.tangent)).normalize()
    }
    b.crossVectors(r.tangent, n).normalize()
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2
      ring.copy(n).multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a))
      out.position.push(r.centre.x + ring.x * r.radius, r.centre.y + ring.y * r.radius, r.centre.z + ring.z * r.radius)
      out.normal.push(ring.x, ring.y, ring.z)
      out.direction.push(r.tangent.x, r.tangent.y, r.tangent.z)
      out.radius.push(r.radius)
      out.dist.push(r.dist)
      out.around.push(j / radial)
      out.slot.push(slot)
      out.time.push(r.time)
      out.plume.push(r.plume)
      out.fade.push(r.fade)
      out.mask.push(mask)
      out.header.push(r.header)
      out.feeds.push(r.feeds)
    }
  })
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < radial; j++) {
      const a = base + i * (radial + 1) + j
      const c = a + radial + 1
      out.index.push(a, a + 1, c, a + 1, c + 1, c)
    }
}

const emptyArrays = (): GasArrays => ({ position: [], normal: [], direction: [], radius: [], dist: [], around: [], slot: [], time: [], plume: [], fade: [], mask: [], header: [], feeds: [], index: [] })

function toGeometry(out: GasArrays): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(out.position, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(out.normal, 3))
  geometry.setAttribute('aTangent', new Float32BufferAttribute(out.direction, 3))
  geometry.setAttribute('aRadius', new Float32BufferAttribute(out.radius, 1))
  geometry.setAttribute('aDist', new Float32BufferAttribute(out.dist, 1))
  geometry.setAttribute('aAround', new Float32BufferAttribute(out.around, 1))
  geometry.setAttribute('aSlot', new Float32BufferAttribute(out.slot, 1))
  geometry.setAttribute('aTime', new Float32BufferAttribute(out.time, 1))
  geometry.setAttribute('aPlume', new Float32BufferAttribute(out.plume, 1))
  geometry.setAttribute('aFade', new Float32BufferAttribute(out.fade, 1))
  geometry.setAttribute('aMask', new Float32BufferAttribute(out.mask, 1))
  geometry.setAttribute('aHeader', new Float32BufferAttribute(out.header, 1))
  geometry.setAttribute('aFeeds', new Float32BufferAttribute(out.feeds, 1))
  geometry.setIndex(out.index)
  geometry.computeBoundingSphere()
  return geometry
}

export interface GasGeometry {
  /** Each cylinder's gas through its pipes, drawn inside the pipe walls. */
  pipes: BufferGeometry
  /** One plume per outlet, drawn after the pipe walls; null for header stubs. */
  plumes: BufferGeometry | null
  /** Per slot, crank degrees from the end of the cylinder's header to its outlet (the shader's `uOutletTime`). */
  outletTime: number[]
  /** Per slot, the curved header's length: gas retains its column residence after reaching an outlet. */
  headerLength: number[]
}

/**
 * The gas geometries, with the attributes the shader reads: distance from the
 * port, position around the tube, slot, crank degrees the gas takes to get
 * there, plume progress and fade, the cross-section's direction and radius
 * (so the shader can measure how much gas each view ray crosses), the
 * header's length, how many cylinders share each stretch of pipe and, on a
 * plume, the set of slots (bits) whose gas it carries.
 */
export function buildGasGeometry(routes: GasRoute[], tier: QualityTier): GasGeometry {
  const spacing = tier === 'low' ? 0.08 : 0.045
  const radial = tier === 'low' ? 8 : 12
  const pipes = emptyArrays()
  const plumes = emptyArrays()
  const outletTime = Array.from({ length: MAX_GAS_SLOTS }, () => 0)
  const headerLength = Array.from({ length: MAX_GAS_SLOTS }, () => 0)
  const outlets = new Map<string, { ring: Ring; slot: number; mask: number; lengths: number[] }>()
  for (const route of routes) {
    const rings = routeRings(route, spacing)
    addTube(pipes, rings, radial, route.slot, 0)
    const end = rings[rings.length - 1]!
    outletTime[route.slot] = (end.dist - end.header) / FLOW_SPEED
    headerLength[route.slot] = end.header
    if (!route.plume) continue
    const key = [end.centre.x, end.centre.y, end.centre.z].map((v) => v.toFixed(4)).join()
    const group = outlets.get(key) ?? { ring: end, slot: route.slot, mask: 0, lengths: [] }
    group.slot = Math.min(group.slot, route.slot)
    group.mask |= 1 << route.slot
    group.lengths.push(end.dist)
    outlets.set(key, group)
  }
  for (const group of outlets.values()) {
    const mean = group.lengths.reduce((total, length) => total + length, 0) / group.lengths.length
    addTube(plumes, plumeRings(group.ring, spacing, mean), radial, group.slot, group.mask)
  }
  return { pipes: toGeometry(pipes), plumes: outlets.size ? toGeometry(plumes) : null, outletTime, headerLength }
}

/* ------------------------------------------------------------ turbulence */

/** Deterministic pseudo-random numbers (mulberry32), so every visit draws the same turbulence. */
function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A small tiling volume of smooth noise: random values blurred twice along
 * each axis (wrapping), then stretched so two standard deviations either side
 * of the mean span the byte range (blurring leaves most values near the mean;
 * the rare extremes clip). Sampled with trilinear filtering and repeat
 * wrapping it tiles seamlessly, which lets the flow offset wrap without a seam.
 */
export function noiseVolume(sx = NOISE_X, sy = NOISE_YZ, sz = NOISE_YZ, seed = 0x5eed): Uint8Array {
  const next = random(seed)
  let a = new Float32Array(sx * sy * sz).map(() => next())
  const at = (x: number, y: number, z: number) => ((z + sz) % sz) * sx * sy + ((y + sy) % sy) * sx + ((x + sx) % sx)
  for (let pass = 0; pass < 2; pass++)
    for (const axis of [0, 1, 2] as const) {
      const out = new Float32Array(a.length)
      for (let z = 0; z < sz; z++)
        for (let y = 0; y < sy; y++)
          for (let x = 0; x < sx; x++) {
            const d = [axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0] as const
            out[at(x, y, z)] = (a[at(x - d[0], y - d[1], z - d[2])]! + 2 * a[at(x, y, z)]! + a[at(x + d[0], y + d[1], z + d[2])]!) / 4
          }
      a = out
    }
  let mean = 0
  for (const v of a) mean += v
  mean /= a.length
  let variance = 0
  for (const v of a) variance += (v - mean) ** 2
  const spread = 4 * Math.sqrt(variance / a.length) || 1
  return Uint8Array.from(a, (v) => Math.round(Math.min(1, Math.max(0, 0.5 + (v - mean) / spread)) * 255))
}

let sharedNoise: Data3DTexture | null = null
/** One noise texture for every gas material (built on first use, in the browser, never disposed). */
function noiseTexture(): Data3DTexture {
  if (!sharedNoise) {
    const texture = new Data3DTexture(noiseVolume(), NOISE_X, NOISE_YZ, NOISE_YZ)
    texture.format = RedFormat
    texture.type = UnsignedByteType
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.wrapR = RepeatWrapping
    texture.unpackAlignment = 1
    texture.needsUpdate = true
    sharedNoise = texture
  }
  return sharedNoise
}

let sharedFlow: DataTexture | null = null
/** The flow table (exhaust.ts flowTable) as a texture, built on first use in the browser and never disposed. */
function flowTexture(): DataTexture {
  if (!sharedFlow) {
    const texture = new DataTexture(flowTable(), FLOW_TEXELS, 1, RGBAFormat, UnsignedByteType)
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.wrapS = ClampToEdgeWrapping
    texture.wrapT = ClampToEdgeWrapping
    texture.needsUpdate = true
    sharedFlow = texture
  }
  return sharedFlow
}

/* ------------------------------------------------------------ shader */

const glsl = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n))

const VERTEX = /* glsl */ `
attribute float aDist;
attribute float aAround;
attribute float aSlot;
attribute float aTime;
attribute float aPlume;
attribute float aFade;
attribute vec3 aTangent;
attribute float aRadius;
attribute float aMask;
attribute float aHeader;
attribute float aFeeds;
varying float vTime;
varying float vDist;
varying float vAround;
varying float vSlot;
varying float vPlume;
varying float vFade;
varying float vRadius;
varying float vMask;
varying float vHeader;
varying float vFeeds;
varying vec3 vWorld;
varying vec3 vAxis;
varying vec3 vTangent;
void main() {
  vTime = aTime;
  vDist = aDist;
  vAround = aAround;
  vSlot = aSlot;
  vPlume = aPlume;
  vFade = aFade;
  vRadius = aRadius;
  vMask = aMask;
  vHeader = aHeader;
  vFeeds = aFeeds;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  // The normal is the unit direction out from the centre line, so the centre is one radius in.
  vAxis = (modelMatrix * vec4(position - aRadius * normal, 1.0)).xyz;
  vTangent = normalize(mat3(modelMatrix) * aTangent);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const FRAGMENT = /* glsl */ `
precision highp sampler3D;
uniform sampler3D uNoise;
uniform sampler2D uFlow;
// Per cylinder: degrees since its exhaust valve opened, the share of the cycle's gas out so far,
// which of the last ten cycles this is, and its port flow now (motion-blurred).
uniform vec4 uSlot[${MAX_GAS_SLOTS}];
uniform float uOutletTime[${MAX_GAS_SLOTS}];
uniform float uHeaderLength[${MAX_GAS_SLOTS}];
uniform float uSmear;
uniform float uMass;
uniform float uHeat;
uniform float uFloorTemp;
uniform float uAgeScale;
uniform float uPlumeShift;
uniform float uSwirl;
uniform float uLoad;
uniform float uDiesel;
uniform float uLight;
uniform float uOpacity;
uniform float uRun;
varying float vTime;
varying float vDist;
varying float vAround;
varying float vSlot;
varying float vPlume;
varying float vFade;
varying float vRadius;
varying float vMask;
varying float vHeader;
varying float vFeeds;
varying vec3 vWorld;
varying vec3 vAxis;
varying vec3 vTangent;

const float PI = 3.141592653589793;
const float OPEN = ${glsl(EXHAUST_OPEN_DEG)};
const float TEXELS = ${glsl(FLOW_TEXELS)};
const float CYCLE_GAS = ${glsl(CYCLE_GAS)};
const float FLOW_SPEED = ${glsl(FLOW_SPEED)};
const float OUTLET_RADIUS = ${glsl(COLLECTOR_RADIUS * GAS_FILL)};
const float PLUME_LENGTH = ${glsl(PLUME_LENGTH)};
const float PLUME_SLOW = ${glsl(PLUME_SLOW)};

// exhaust.ts flowTable, at e degrees after the valve opened: r share out, b portFlow, a portTemperature.
vec4 byPhase(float e) { return texture(uFlow, vec2((clamp(e, 0.0, OPEN) / OPEN * (TEXELS - 1.0) + 0.5) / TEXELS, 0.5)); }
float flowAt(float e) { return (e < 0.0 || e > OPEN) ? 0.0 : byPhase(e).b; }
float shareAt(float e) { return e <= 0.0 ? 0.0 : (e >= OPEN ? 1.0 : byPhase(e).r); }
// exhaust.ts emissionAtShare: degrees after opening by which share f had left.
float emitAt(float f) { return texture(uFlow, vec2((clamp(f, 0.0, 1.0) * (TEXELS - 1.0) + 0.5) / TEXELS, 0.5)).g * OPEN; }
// A parcel keeps its emission time and total residence when it leaves the pipe.
// Return the crank degrees at emission and its age, as exhaust.ts parcelAt does.
vec2 emissionAge(vec4 clock, float label) {
  float rel = min(label - clock.z, 0.99995);
  float cyclesAgo = -floor(rel);
  float emitted = emitAt(rel + cyclesAgo);
  return vec2(emitted, 720.0 * cyclesAgo + clock.x - emitted);
}
float parcelTemperature(vec2 parcel) {
  float hot = byPhase(parcel.x).a * uHeat;
  float floorTemperature = min(uFloorTemp, hot);
  return floorTemperature + (hot - floorTemperature) * exp(-parcel.y * uAgeScale);
}
// exhaust.ts portFlowOver: the flow blurred over this frame's crank step (one sample, at its middle, for a small step).
float flowOver(float e) {
  if (uSmear < ${glsl(SMEAR_SINGLE_DEG)}) return flowAt(mod(e - 0.5 * uSmear, 720.0));
  float sum = 0.0;
  for (int i = 0; i < SMEAR_TAPS; i++) sum += flowAt(mod(e - uSmear * (float(i) + 0.5) / float(SMEAR_TAPS), 720.0));
  return sum / float(SMEAR_TAPS);
}

// Incandescence of hot gas, in linear light: dull red, orange, then pale yellow.
vec3 glowColour(float t) {
  vec3 c = mix(vec3(0.45, 0.035, 0.004), vec3(1.0, 0.27, 0.03), smoothstep(0.1, 0.55, t));
  c = mix(c, vec3(1.0, 0.55, 0.13), smoothstep(0.55, 0.85, t));
  return mix(c, vec3(1.0, 0.8, 0.5), smoothstep(0.88, 1.0, t));
}

float noise(vec3 p) {
  return texture(uNoise, p / vec3(${glsl(NOISE_X)}, ${glsl(NOISE_YZ)}, ${glsl(NOISE_YZ)})).r;
}

void main() {
  if (uOpacity <= 0.0) discard;

  // How much gas this pixel looks through: the view ray's chord across the gas column round
  // the pipe's centre line, so the gas is thick through its core and has no hard outline.
  vec3 ray = normalize(vWorld - cameraPosition);
  vec3 along = normalize(vTangent);
  vec3 fromAxis = cameraPosition - vAxis;
  vec3 rayAcross = ray - dot(ray, along) * along;
  vec3 eyeAcross = fromAxis - dot(fromAxis, along) * along;
  float qa = max(dot(rayAcross, rayAcross), 1e-4);
  float qb = dot(rayAcross, eyeAcross);
  float qc = dot(eyeAcross, eyeAcross) - vRadius * vRadius;
  float root = sqrt(max(qb * qb - qa * qc, 0.0));
  float enter = max((-qb - root) / qa, 0.0);
  float chord = clamp((-qb + root) / qa - enter, 0.0, 6.0 * vRadius);

  float angle = vAround * 2.0 * PI + uSwirl;
  float open = smoothstep(0.0, 0.12, vPlume);
  vec2 ring = vec2(cos(angle), sin(angle)) * (0.55 + 1.7 * vPlume) + vec2(vSlot * 3.7, 9.0);

  float n;
  float body;
  float hotBody;
  float temperature;
  if (vMask < 0.5) {
    // In the pipes. Which gas is here? In the header, a full column that moves only as the
    // cylinder pushes gas in; beyond it, gas that left the header's end a while ago at the
    // flow speed. Its label (cycles of gas) keys the turbulence, so eddies ride with it.
    vec4 clock = uSlot[int(vSlot + 0.5)];
    bool inHeader = vDist <= vHeader;
    float exitPhase = 0.0;
    float label;
    if (inHeader) {
      label = clock.z + clock.y - vDist / CYCLE_GAS;
    } else {
      float back = clock.x - (vDist - vHeader) / FLOW_SPEED;
      float wraps = -floor(back / 720.0);
      exitPhase = back + 720.0 * wraps;
      label = clock.z - wraps + shareAt(exitPhase) - vHeader / CYCLE_GAS;
    }
    // Octaves at whole multiples, so the ten-cycle label wrap (9 × 64 cells) is seamless.
    vec3 p = vec3(label * CYCLE_GAS * ${glsl(NOISE_ALONG)} + vSlot * 11.0, ring);
    n = noise(p) * 0.6 + noise(p * 2.0 + vec3(13.0, 1.7, 4.1)) * 0.4;
#ifdef DETAIL
    n = n * 0.82 + noise(p * 4.0 + vec3(29.0, 5.5, 0.6)) * 0.18;
#endif
    n = clamp((n - 0.5) * 1.7 + 0.5, 0.0, 1.0);
    // When it left the port: turbulence tears the front of each burst (about 8° of gas).
    vec2 parcel = emissionAge(clock, label + (n - 0.5) * 0.012);
    // Only gas that left the port since the engine started.
    float born = smoothstep(parcel.y, parcel.y + 36.0, uRun);
    // It left as hot as the port gas then, and has been cooling towards the walls since.
    temperature = parcelTemperature(parcel);
    float fresh = inHeader ? 1.0 : flowOver(exitPhase + (n - 0.5) * 26.0);
    // A header is always full, denser while it surges; collectors carry fresh bursts over a
    // haze of older gas shared between the cylinders feeding them.
    body = (inHeader ? ${glsl(HEADER_GAS)} * (0.7 + 0.6 * clock.w) * uMass : ${glsl(RESIDUAL_TOTAL)} / max(vFeeds, 1.0) + fresh * uMass) * born;
    hotBody = inHeader ? body : fresh * uMass * born;
  } else {
    // A plume: every cylinder exhausting through this outlet feeds it, each delayed by its own
    // route; the eddies grow and drift more slowly in the open air.
    vec3 q = vec3(vDist * ${glsl(NOISE_ALONG / PLUME_NOISE_SCALE)} - uPlumeShift + vSlot * 11.0, ring);
    // Billows: the plume's eddies bend one another (whole-frequency warps keep the wrap seamless).
    q.yz += (vec2(noise(q + vec3(3.0, 7.0, 1.0)), noise(q + vec3(11.0, 2.0, 5.0))) - 0.5) * 2.4;
    n = noise(q) * 0.62 + noise(q * 2.0 + vec3(13.0, 1.7, 4.1)) * 0.38;
#ifdef DETAIL
    n = n * 0.82 + noise(vec3(vDist * 5.0, ring * 2.0)) * 0.18;
#endif
    n = clamp((n - 0.5) * 1.5 + 0.5, 0.0, 1.0);
    float totalFlow = 0.0;
    float totalHeat = 0.0;
    float filled = 0.0;
    float feeds = 0.0;
    int mask = int(vMask + 0.5);
    for (int slot = 0; slot < ${MAX_GAS_SLOTS}; slot++) {
      if ((mask & (1 << slot)) == 0) continue;
      float travel = uOutletTime[slot] + vTime;
      vec4 clock = uSlot[slot];
      float back = clock.x - travel;
      float wraps = -floor(back / 720.0);
      float exitPhase = back + 720.0 * wraps;
      float label = clock.z - wraps + shareAt(exitPhase) - uHeaderLength[slot] / CYCLE_GAS;
      vec2 parcel = emissionAge(clock, label + (n - 0.5) * 0.012);
      float arrived = smoothstep(parcel.y, parcel.y + 36.0, uRun);
      float phase = mod(exitPhase + (n - 0.5) * (26.0 + 220.0 * open), 720.0);
      float contribution = flowAt(phase) * arrived;
      totalFlow += contribution;
      totalHeat += contribution * parcelTemperature(parcel);
      filled += arrived;
      feeds += 1.0;
    }
    // Flow per connected cylinder, so a shared outlet does not draw an opaque plume.
    float fresh = totalFlow / max(feeds, 1.0) * uMass;
    float born = filled / max(feeds, 1.0);
    body = fresh + ${glsl(RESIDUAL_TOTAL)} * 0.4 * (1.0 - open) * born;
    hotBody = fresh;
    temperature = totalHeat / max(totalFlow, 1e-4);
  }

  // Past the outlet the gas slows, widens and mixes into the air (exhaust.ts plumeDilution),
  // and its far reaches break up into wisps.
  float s = vPlume * PLUME_LENGTH;
  float r = max(vRadius, OUTLET_RADIUS);
  float dilution = mix(1.0, (1.0 + s / PLUME_SLOW) * (OUTLET_RADIUS * OUTLET_RADIUS) / (r * r), open);
  float wisps = mix(1.0, smoothstep(0.3, 0.72, n + 0.32 * (1.0 - vPlume)), open);
  float density = body * dilution * wisps * mix(0.45, 1.55, n);
  temperature *= 1.0 - smoothstep(0.0, 0.18, vPlume);

  // Hot gas glows with the amount of it the ray crosses (a header's width is 1), lumpy like the
  // gas, and far more brightly the hotter it is (gently enough that an idling engine's bursts
  // still show); cool gas scatters light as haze.
  float knots = smoothstep(0.2, 0.85, n);
  float hotGas = hotBody * dilution * mix(0.12, 1.85, knots) * chord / ${glsl(2 * HEADER_RADIUS * GAS_FILL)};
  vec3 glow = glowColour(temperature) * pow(temperature, 2.5) * hotGas * (0.5 + 0.4 * uLoad) * mix(1.0, 0.55, uDiesel);
  // On the light theme haze has to block light to show at all, so it is a little thicker there.
  float sigma = mix(12.0, 10.0, open) * (1.0 + uDiesel * (0.5 + 0.8 * uLoad)) * mix(1.0, 1.0 + 0.6 * open, uLight);
  float haze = (1.0 - exp(-sigma * density * chord)) * mix(0.35, 1.0, 1.0 - temperature);
  // Pale vapour on the dark theme; on the light theme the same gas shows as a darker smoke.
  vec3 hazeDark = mix(mix(vec3(0.7, 0.73, 0.78), vec3(0.34, 0.32, 0.3), uDiesel), mix(vec3(0.92, 0.93, 0.95), vec3(0.42, 0.39, 0.36), uDiesel), open);
  vec3 hazeLight = mix(mix(vec3(0.42, 0.45, 0.5), vec3(0.25, 0.23, 0.21), uDiesel), mix(vec3(0.45, 0.48, 0.53), vec3(0.28, 0.26, 0.24), uDiesel), open);
  vec3 hazeColour = mix(hazeDark, hazeLight, uLight);

  float strength = vFade * uOpacity;
  // Encode colours before premultiplying opacity: encoding an already faint haze would brighten
  // it into a luminous hose instead of translucent gas.
  float hazeAlpha = clamp(haze * strength, 0.0, 0.92);
  // On a light page added light would vanish, so glowing gas also covers what is behind it.
  float glowAlpha = uLight * clamp(max(glow.r, max(glow.g, glow.b)) * 0.85, 0.0, 0.85) * strength;
  vec3 emitted = linearToOutputTexel(vec4(glow, 1.0)).rgb * strength;
  vec3 scattered = linearToOutputTexel(vec4(hazeColour, 1.0)).rgb * hazeAlpha;
  gl_FragColor = vec4(emitted + scattered, clamp(hazeAlpha + glowAlpha * (1.0 - hazeAlpha), 0.0, 0.95));
}
`

export type GasMaterial = ShaderMaterial & {
  uniforms: {
    uSlot: { value: Vector4[] }
    uOutletTime: { value: Float32Array }
    uHeaderLength: { value: Float32Array }
    uSmear: { value: number }
    uMass: { value: number }
    uHeat: { value: number }
    uFloorTemp: { value: number }
    uAgeScale: { value: number }
    uPlumeShift: { value: number }
    uSwirl: { value: number }
    uLoad: { value: number }
    uDiesel: { value: number }
    uLight: { value: number }
    uOpacity: { value: number }
    uRun: { value: number }
    uNoise: { value: Data3DTexture }
    uFlow: { value: DataTexture }
  }
}

/** The gas material: premultiplied blending, so hot gas adds light and cool haze dims what is behind it. */
export function createGasMaterial(tier: QualityTier): GasMaterial {
  const material = new ShaderMaterial({
    name: 'Exhaust gas',
    uniforms: {
      uSlot: { value: Array.from({ length: MAX_GAS_SLOTS }, () => new Vector4()) },
      uOutletTime: { value: new Float32Array(MAX_GAS_SLOTS) },
      uHeaderLength: { value: new Float32Array(MAX_GAS_SLOTS) },
      uSmear: { value: 0 },
      uMass: { value: 0 },
      uHeat: { value: 0 },
      uFloorTemp: { value: 0.22 },
      uAgeScale: { value: 0 },
      uPlumeShift: { value: 0 },
      uSwirl: { value: 0 },
      uLoad: { value: 0 },
      uDiesel: { value: 0 },
      uLight: { value: 0 },
      uOpacity: { value: 0 },
      uRun: { value: 0 },
      uNoise: { value: noiseTexture() },
      uFlow: { value: flowTexture() },
    },
    defines: tier === 'high' ? { DETAIL: '', SMEAR_TAPS: 4 } : { SMEAR_TAPS: 2 },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: FrontSide,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
    toneMapped: false,
  })
  return material as GasMaterial
}
