/**
 * Exhaust gas for the Sound Lab cutaways, drawn as gas rather than as moving
 * dots: each cylinder's route (port → header → collector → tailpipe) is one
 * continuous tube of gas that carries on past the outlet as a widening,
 * slowing plume. A shader fills the tube with turbulent gas that leaves the
 * port with the exhaust valve (exhaust.ts: a blowdown burst, then the
 * piston's push), travels at the flow speed with each route’s travel delay,
 * glows while hot and cools to a
 * faint haze as it goes. Its edges fade with the viewing angle, so it reads
 * as a volume of gas, not a coloured hose.
 *
 * Every cylinder's tube shares one geometry and one draw call. Per frame only
 * uniforms change: each cylinder's degrees since its valve opened, how far
 * the gas has moved (for the turbulence), and the engine's load.
 */
import {
  AddEquation,
  BufferGeometry,
  CatmullRomCurve3,
  CustomBlending,
  Data3DTexture,
  Float32BufferAttribute,
  FrontSide,
  LinearFilter,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RedFormat,
  RepeatWrapping,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
} from 'three'
import type { QualityTier } from '@/hooks/useQualityTier'
import {
  AREA_FULL_LIFT,
  BLOWDOWN,
  BLOWDOWN_DECAY,
  COLLECTOR_RADIUS,
  DISPLACEMENT,
  EXHAUST_OPEN_DEG,
  FLOW_SPEED,
  GAS_FILL,
  HEADER_RADIUS,
  PLUME_LENGTH,
  PLUME_SLOW,
  PLUME_SPREAD,
  PORT_FLOW_PEAK,
  STROKE_END,
  STROKE_START,
  travelDeg,
  type Vec3,
} from './exhaust'

/** Most cylinders one engine has: the size of the shader's per-cylinder array. */
export const MAX_GAS_SLOTS = 10
/** Cells in the tiling noise volume: long along the flow, so the pattern rarely repeats down a pipe. */
const NOISE_X = 64
const NOISE_YZ = 32
/** Noise cells per scene unit along the flow: eddies a few pipe diameters long. */
const NOISE_ALONG = 9
/** Where the noise pattern repeats along the flow, in scene units. */
export const NOISE_PERIOD = NOISE_X / NOISE_ALONG

/**
 * How far the turbulence has to move, in noise cells, for `crankDeg` more
 * degrees of flow. The noise volume tiles, so the running total can wrap at
 * NOISE_X cells without a seam.
 */
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
    })
  }
  return rings
}

interface GasArrays {
  position: number[]
  normal: number[]
  axis: number[]
  direction: number[]
  radius: number[]
  dist: number[]
  around: number[]
  slot: number[]
  time: number[]
  plume: number[]
  fade: number[]
  mask: number[]
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
      out.axis.push(r.centre.x, r.centre.y, r.centre.z)
      out.direction.push(r.tangent.x, r.tangent.y, r.tangent.z)
      out.radius.push(r.radius)
      out.dist.push(r.dist)
      out.around.push(j / radial)
      out.slot.push(slot)
      out.time.push(r.time)
      out.plume.push(r.plume)
      out.fade.push(r.fade)
      out.mask.push(mask)
    }
  })
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < radial; j++) {
      const a = base + i * (radial + 1) + j
      const c = a + radial + 1
      out.index.push(a, a + 1, c, a + 1, c + 1, c)
    }
}

/**
 * One geometry holding every cylinder's tube of gas through its pipes, plus
 * one plume per outlet, with the attributes the shader reads: distance from
 * the port, position around the tube, slot, crank degrees the gas takes to get
 * there, plume progress and fade, the cross-section's centre, direction and
 * radius (so the shader can measure how much gas each view ray crosses) and,
 * on a plume, the set of slots (bits) whose gas it carries.
 *
 * `userData.outletTime[slot]` holds the crank degrees each cylinder's gas
 * takes to reach its outlet, for the shader's `uOutletTime`.
 */
export function buildGasGeometry(routes: GasRoute[], tier: QualityTier): BufferGeometry {
  const spacing = tier === 'low' ? 0.08 : 0.045
  const radial = tier === 'low' ? 8 : 12
  const out: GasArrays = { position: [], normal: [], axis: [], direction: [], radius: [], dist: [], around: [], slot: [], time: [], plume: [], fade: [], mask: [], index: [] }
  const outletTime = Array.from({ length: MAX_GAS_SLOTS }, () => 0)
  const outlets = new Map<string, { ring: Ring; slot: number; mask: number; lengths: number[] }>()
  for (const route of routes) {
    const rings = routeRings(route, spacing)
    addTube(out, rings, radial, route.slot, 0)
    const end = rings[rings.length - 1]!
    outletTime[route.slot] = end.time
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
    addTube(out, plumeRings(group.ring, spacing, mean), radial, group.slot, group.mask)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(out.position, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(out.normal, 3))
  geometry.setAttribute('aAxis', new Float32BufferAttribute(out.axis, 3))
  geometry.setAttribute('aTangent', new Float32BufferAttribute(out.direction, 3))
  geometry.setAttribute('aRadius', new Float32BufferAttribute(out.radius, 1))
  geometry.setAttribute('aDist', new Float32BufferAttribute(out.dist, 1))
  geometry.setAttribute('aAround', new Float32BufferAttribute(out.around, 1))
  geometry.setAttribute('aSlot', new Float32BufferAttribute(out.slot, 1))
  geometry.setAttribute('aTime', new Float32BufferAttribute(out.time, 1))
  geometry.setAttribute('aPlume', new Float32BufferAttribute(out.plume, 1))
  geometry.setAttribute('aFade', new Float32BufferAttribute(out.fade, 1))
  geometry.setAttribute('aMask', new Float32BufferAttribute(out.mask, 1))
  geometry.setIndex(out.index)
  geometry.computeBoundingSphere()
  geometry.userData.outletTime = outletTime
  return geometry
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

/* ------------------------------------------------------------ shader */

const glsl = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n))

const VERTEX = /* glsl */ `
attribute float aDist;
attribute float aAround;
attribute float aSlot;
attribute float aTime;
attribute float aPlume;
attribute float aFade;
attribute vec3 aAxis;
attribute vec3 aTangent;
attribute float aRadius;
attribute float aMask;
uniform float uSince[${MAX_GAS_SLOTS}];
varying float vEmit;
varying float vTime;
varying float vDist;
varying float vAround;
varying float vSlot;
varying float vPlume;
varying float vFade;
varying float vRadius;
varying float vMask;
varying vec3 vWorld;
varying vec3 vAxis;
varying vec3 vTangent;
void main() {
  // Degrees after its valve opened at which the gas here left the port (wrapped in the fragment shader).
  vEmit = uSince[int(aSlot + 0.5)] - aTime;
  vTime = aTime;
  vDist = aDist;
  vAround = aAround;
  vSlot = aSlot;
  vPlume = aPlume;
  vFade = aFade;
  vRadius = aRadius;
  vMask = aMask;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vAxis = (modelMatrix * vec4(aAxis, 1.0)).xyz;
  vTangent = normalize(mat3(modelMatrix) * aTangent);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const FRAGMENT = /* glsl */ `
precision highp sampler3D;
uniform sampler3D uNoise;
uniform float uShift;
uniform float uPlumeShift;
uniform float uSwirl;
uniform float uLoad;
uniform float uDiesel;
uniform float uOpacity;
uniform float uRun;
uniform float uSince[${MAX_GAS_SLOTS}];
uniform float uOutletTime[${MAX_GAS_SLOTS}];
varying float vEmit;
varying float vTime;
varying float vDist;
varying float vAround;
varying float vSlot;
varying float vPlume;
varying float vFade;
varying float vRadius;
varying float vMask;
varying vec3 vWorld;
varying vec3 vAxis;
varying vec3 vTangent;

const float PI = 3.141592653589793;
const float OPEN = ${glsl(EXHAUST_OPEN_DEG)};
const float STROKE_START = ${glsl(STROKE_START)};
const float STROKE_END = ${glsl(STROKE_END)};
const float OUTLET_RADIUS = ${glsl(COLLECTOR_RADIUS * GAS_FILL)};
const float PLUME_LENGTH = ${glsl(PLUME_LENGTH)};
const float PLUME_SLOW = ${glsl(PLUME_SLOW)};

// exhaust.ts portFlow: the valve's flow area times the blowdown burst plus the piston's push.
float portFlow(float e) {
  if (e < 0.0 || e > OPEN) return 0.0;
  float s = sin(PI * e / OPEN);
  float area = min(1.0, s * s / ${glsl(AREA_FULL_LIFT)});
  float push = (e > STROKE_START && e < STROKE_END) ? sin(PI * (e - STROKE_START) / (STROKE_END - STROKE_START)) : 0.0;
  return area * (${glsl(BLOWDOWN)} * exp(-e / ${glsl(BLOWDOWN_DECAY)}) + ${glsl(DISPLACEMENT)} * push) / ${glsl(PORT_FLOW_PEAK)};
}

// exhaust.ts portTemperature: the blowdown leaves hottest.
float portTemperature(float e) {
  float t = clamp(e / STROKE_END, 0.0, 1.0);
  return 1.0 - 0.4 * t * t * (3.0 - 2.0 * t);
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

  // Turbulence rides with the gas: in the pipes it is sampled by when the gas left the port, so
  // eddies travel with it; each cylinder has its own. Past the outlet the eddies grow and drift
  // more slowly. Octaves are whole multiples, so the flow offsets wrap without a seam.
  float angle = vAround * 2.0 * PI + uSwirl;
  float around = 0.55 + 1.7 * vPlume;
  vec2 ring = vec2(cos(angle), sin(angle)) * around + vec2(vSlot * 3.7, 9.0);
  vec3 p = vec3(uShift - vDist * ${glsl(NOISE_ALONG)} + vSlot * 11.0, ring);
  float n = noise(p) * 0.6 + noise(p * 2.0 + vec3(13.0, 1.7, 4.1)) * 0.4;
  float open = smoothstep(0.0, 0.12, vPlume);
  if (open > 0.0) {
    vec3 q = vec3(vDist * ${glsl(NOISE_ALONG / PLUME_NOISE_SCALE)} - uPlumeShift + vSlot * 11.0, ring);
    // Billows: the plume's eddies bend one another. Whole-frequency warps keep
    // the wrapping flow offset periodic across the tiling noise volume.
    q.yz += (vec2(noise(q + vec3(3.0, 7.0, 1.0)), noise(q + vec3(11.0, 2.0, 5.0))) - 0.5) * 2.4;
    float m = noise(q) * 0.62 + noise(q * 2.0 + vec3(13.0, 1.7, 4.1)) * 0.38;
    n = mix(n, m, open);
  }
#ifdef DETAIL
  n = n * 0.82 + noise(p * 4.0 + vec3(29.0, 5.5, 0.6)) * 0.18 * (1.0 - open) + noise(vec3(vDist * 5.0, ring * 2.0)) * 0.18 * open;
#endif
  // Mixing octaves averages away contrast; restore it so eddies read as eddies.
  n = clamp((n - 0.5) * 1.7 + 0.5, 0.0, 1.0);

  // The gas here left the port this long after its valve opened; turbulence tears the edges of
  // each burst, so fronts arrive ragged rather than as a clean slug.
  float e = mod(vEmit + (n - 0.5) * (26.0 + 220.0 * open), 720.0);
  // Gas only exists where it left the port after the engine started.
  float born = smoothstep(vTime, vTime + 36.0, uRun);
  float fresh = portFlow(e) * born;
  float cooling = 3.0 + 2.6 * uLoad;
  float cooledTemperature = portTemperature(e) * exp(-vDist / cooling);
  if (vMask > 0.5) {
    // One common plume carries every connected cylinder. Each contribution has its own
    // port-to-outlet travel delay and cannot appear before that route has filled.
    float totalFlow = 0.0;
    float totalHeat = 0.0;
    float filled = 0.0;
    float feeds = 0.0;
    int mask = int(vMask + 0.5);
    for (int slot = 0; slot < ${MAX_GAS_SLOTS}; slot++) {
      if ((mask & (1 << slot)) == 0) continue;
      float travel = uOutletTime[slot] + vTime;
      float arrived = smoothstep(travel, travel + 36.0, uRun);
      float phase = mod(uSince[slot] - travel + (n - 0.5) * (26.0 + 220.0 * open), 720.0);
      float contribution = portFlow(phase) * arrived;
      totalFlow += contribution;
      totalHeat += contribution * portTemperature(phase) * exp(-(uOutletTime[slot] * ${glsl(FLOW_SPEED)} + vPlume * PLUME_LENGTH) / cooling);
      filled += arrived;
      feeds += 1.0;
    }
    // Flow is normalised per connected cylinder, rather than drawing an opaque plume
    // repeatedly for each cylinder. Heat follows the actual mixture's flow weights.
    fresh = totalFlow / max(feeds, 1.0);
    born = filled / max(feeds, 1.0);
    cooledTemperature = totalHeat / max(totalFlow, 1e-4);
  }
  // Spent gas never quite empties from the pipes between bursts.
  float residual = 0.12 * (1.0 - open) * born;

  // Past the outlet the gas slows, widens and mixes into the air (exhaust.ts plumeDilution),
  // and its far reaches break up into wisps.
  float s = vPlume * PLUME_LENGTH;
  float r = max(vRadius, OUTLET_RADIUS);
  float dilution = mix(1.0, (1.0 + s / PLUME_SLOW) * (OUTLET_RADIUS * OUTLET_RADIUS) / (r * r), open);
  float wisps = mix(1.0, smoothstep(0.3, 0.72, n + 0.32 * (1.0 - vPlume)), open);
  float density = (fresh + residual) * dilution * wisps * mix(0.45, 1.55, n);

  // Temperature: hottest at blowdown and at high revs, cooling along the pipes (more slowly at
  // high revs, where the gas carries its heat further) and quickly once it mixes with the air.
  float temperature = cooledTemperature * mix(0.62, 1.0, uLoad) * mix(1.0, 0.7, uDiesel);
  temperature *= 1.0 - smoothstep(0.0, 0.18, vPlume);

  // Hot gas glows in proportion to how much of it the ray crosses, and (like any hot body) far
  // more brightly the hotter it is; cool gas scatters light as haze.
  // The glow is as lumpy as the gas: turbulence leaves brighter knots and darker gaps. It grows
  // with the amount of hot gas the ray crosses (a header's width is 1), so where several
  // cylinders' gas shares a collector their light adds up the way their gas does.
  float knots = smoothstep(0.2, 0.85, n);
  float hotGas = fresh * dilution * mix(0.12, 1.85, knots) * chord / ${glsl(2 * HEADER_RADIUS * GAS_FILL)};
  float t2 = temperature * temperature;
  vec3 glow = glowColour(temperature) * t2 * t2 * hotGas * (0.62 + 0.55 * uLoad) * mix(1.0, 0.55, uDiesel);
  float sigma = mix(14.0, 5.5, open) * (1.0 + uDiesel * (0.5 + 0.8 * uLoad));
  float haze = (1.0 - exp(-sigma * density * chord)) * mix(0.35, 1.0, 1.0 - temperature);
  vec3 hazeColour = mix(vec3(0.7, 0.73, 0.78), vec3(0.34, 0.32, 0.3), uDiesel);
  // In the open air the cooled exhaust shows as a pale vapour.
  hazeColour = mix(hazeColour, mix(vec3(0.86, 0.88, 0.9), vec3(0.42, 0.39, 0.36), uDiesel), open);

  float strength = vFade * uOpacity;
  // Encode colours before premultiplying opacity: encoding an already faint haze would brighten
  // it into a luminous hose instead of translucent gas.
  float alpha = clamp(haze * strength, 0.0, 0.92);
  vec3 emitted = linearToOutputTexel(vec4(glow, 1.0)).rgb * strength;
  vec3 scattered = linearToOutputTexel(vec4(hazeColour, 1.0)).rgb * alpha;
  gl_FragColor = vec4(emitted + scattered, alpha);
}
`

export type GasMaterial = ShaderMaterial & {
  uniforms: {
    uSince: { value: Float32Array }
    uOutletTime: { value: Float32Array }
    uShift: { value: number }
    uPlumeShift: { value: number }
    uSwirl: { value: number }
    uLoad: { value: number }
    uDiesel: { value: number }
    uOpacity: { value: number }
    uRun: { value: number }
    uNoise: { value: Data3DTexture }
  }
}

/** The gas material: premultiplied blending, so hot gas adds light and cool haze dims what is behind it. */
export function createGasMaterial(tier: QualityTier): GasMaterial {
  const material = new ShaderMaterial({
    name: 'Exhaust gas',
    uniforms: {
      uSince: { value: new Float32Array(MAX_GAS_SLOTS) },
      uOutletTime: { value: new Float32Array(MAX_GAS_SLOTS) },
      uShift: { value: 0 },
      uPlumeShift: { value: 0 },
      uSwirl: { value: 0 },
      uLoad: { value: 0 },
      uDiesel: { value: 0 },
      uOpacity: { value: 0 },
      uRun: { value: 0 },
      uNoise: { value: noiseTexture() },
    },
    defines: tier === 'high' ? { DETAIL: '' } : {},
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
