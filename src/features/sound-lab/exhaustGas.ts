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
  /** Distance from the port. */
  dist: number
  /** 0 inside the pipes, rising to 1 at the end of the plume. */
  plume: number
  fade: number
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Centre-line samples for one route: the pipe's own curve, then the plume rising gently as it slows. */
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
      })
    }
    offset += partLength
  })
  if (!route.plume) return rings
  const end = rings[rings.length - 1]!
  const direction = end.tangent.clone()
  const up = new Vector3(0, 1, 0)
  const plumeSteps = Math.max(6, Math.ceil(PLUME_LENGTH / spacing))
  for (let i = 1; i <= plumeSteps; i++) {
    const s = (i / plumeSteps) * PLUME_LENGTH
    // Hot gas is buoyant: the plume curls upwards as it slows.
    const centre = end.centre.clone().addScaledVector(direction, s).addScaledVector(up, 0.07 * s * s)
    const tangent = direction.clone().addScaledVector(up, 0.14 * s).normalize()
    const t = s / PLUME_LENGTH
    rings.push({ centre, tangent, radius: end.radius + PLUME_SPREAD * s, dist: length + s, plume: t, fade: 1 - smooth(0.55, 1, t) })
  }
  return rings
}

/**
 * One geometry holding every route's tube of gas, with the attributes the
 * shader reads: distance from the port, position around the tube, slot,
 * crank degrees the gas takes to get there, plume progress and fade.
 */
export function buildGasGeometry(routes: GasRoute[], tier: QualityTier): BufferGeometry {
  const spacing = tier === 'low' ? 0.08 : 0.045
  const radial = tier === 'low' ? 8 : 12
  const position: number[] = []
  const normal: number[] = []
  const dist: number[] = []
  const around: number[] = []
  const slot: number[] = []
  const time: number[] = []
  const plume: number[] = []
  const fade: number[] = []
  const index: number[] = []
  const n = new Vector3()
  const b = new Vector3()
  const ring = new Vector3()
  for (const route of routes) {
    const rings = routeRings(route, spacing)
    // The outlet: past it the gas is in the slowing plume.
    const pipeEnd = rings.filter((r) => r.plume === 0).at(-1)!.dist
    // Parallel-transported frame, so the tube does not twist round the bends.
    const first = rings[0]!.tangent
    n.set(Math.abs(first.x) < 0.9 ? 1 : 0, Math.abs(first.x) < 0.9 ? 0 : 1, 0).cross(first).normalize()
    const base = position.length / 3
    rings.forEach((r, i) => {
      if (i > 0) {
        const prev = rings[i - 1]!.tangent
        const axis = new Vector3().crossVectors(prev, r.tangent)
        const sin = axis.length()
        if (sin > 1e-6) n.applyAxisAngle(axis.divideScalar(sin), Math.atan2(sin, prev.dot(r.tangent)))
        n.addScaledVector(r.tangent, -n.dot(r.tangent)).normalize()
      }
      b.crossVectors(r.tangent, n).normalize()
      const travel = travelDeg(r.dist, pipeEnd)
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2
        ring.copy(n).multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a))
        position.push(r.centre.x + ring.x * r.radius, r.centre.y + ring.y * r.radius, r.centre.z + ring.z * r.radius)
        normal.push(ring.x, ring.y, ring.z)
        dist.push(r.dist)
        around.push(j / radial)
        slot.push(route.slot)
        time.push(travel)
        plume.push(r.plume)
        fade.push(r.fade)
      }
    })
    for (let i = 0; i < rings.length - 1; i++)
      for (let j = 0; j < radial; j++) {
        const a = base + i * (radial + 1) + j
        const c = a + radial + 1
        index.push(a, a + 1, c, a + 1, c + 1, c)
      }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normal, 3))
  geometry.setAttribute('aDist', new Float32BufferAttribute(dist, 1))
  geometry.setAttribute('aAround', new Float32BufferAttribute(around, 1))
  geometry.setAttribute('aSlot', new Float32BufferAttribute(slot, 1))
  geometry.setAttribute('aTime', new Float32BufferAttribute(time, 1))
  geometry.setAttribute('aPlume', new Float32BufferAttribute(plume, 1))
  geometry.setAttribute('aFade', new Float32BufferAttribute(fade, 1))
  geometry.setIndex(index)
  geometry.computeBoundingSphere()
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
 * each axis (wrapping), stretched to the full byte range. Sampled with
 * trilinear filtering and repeat wrapping it tiles seamlessly, which lets
 * the flow offset wrap without a seam.
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
  let lo = Infinity
  let hi = -Infinity
  for (const v of a) {
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
  }
  return Uint8Array.from(a, (v) => Math.round(((v - lo) / (hi - lo || 1)) * 255))
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
uniform float uSince[${MAX_GAS_SLOTS}];
varying float vEmit;
varying float vTime;
varying float vDist;
varying float vAround;
varying float vSlot;
varying float vPlume;
varying float vFade;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  // Degrees after its valve opened at which the gas here left the port (wrapped in the fragment shader).
  vEmit = uSince[int(aSlot + 0.5)] - aTime;
  vTime = aTime;
  vDist = aDist;
  vAround = aAround;
  vSlot = aSlot;
  vPlume = aPlume;
  vFade = aFade;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = -mv.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
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
varying float vEmit;
varying float vTime;
varying float vDist;
varying float vAround;
varying float vSlot;
varying float vPlume;
varying float vFade;
varying vec3 vNormal;
varying vec3 vView;

const float PI = 3.141592653589793;
const float OPEN = ${glsl(EXHAUST_OPEN_DEG)};
const float STROKE_START = ${glsl(STROKE_START)};
const float STROKE_END = ${glsl(STROKE_END)};

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

// Incandescence of hot gas: dull red, orange, then yellow-white.
vec3 glowColour(float t) {
  vec3 c = mix(vec3(0.38, 0.03, 0.0), vec3(1.0, 0.24, 0.02), smoothstep(0.1, 0.55, t));
  c = mix(c, vec3(1.0, 0.52, 0.12), smoothstep(0.55, 0.85, t));
  return mix(c, vec3(1.0, 0.78, 0.45), smoothstep(0.88, 1.0, t));
}

float noise(vec3 p) {
  return texture(uNoise, p / vec3(${glsl(NOISE_X)}, ${glsl(NOISE_YZ)}, ${glsl(NOISE_YZ)})).r;
}

void main() {
  float e = mod(vEmit, 720.0);
  // Gas only exists where it left the port after the engine started.
  float born = smoothstep(vTime, vTime + 36.0, uRun);
  float flow = portFlow(e);
  // Spent gas lingers between pulses, faintly, inside the pipes.
  float body = (flow + 0.07 * (1.0 - vPlume)) * born;

  // Turbulence rides with the gas: in the pipes it is sampled by when the gas left the port, so
  // eddies travel with it; each cylinder has its own. Past the outlet the eddies grow and drift
  // more slowly. Octaves are whole multiples, so the flow offsets wrap without a seam.
  float angle = vAround * 2.0 * PI + uSwirl;
  float around = 0.55 + 3.4 * vPlume;
  vec2 ring = vec2(cos(angle), sin(angle)) * around + vec2(vSlot * 3.7, 9.0);
  vec3 p = vec3(uShift - vTime * ${glsl(FLOW_SPEED * NOISE_ALONG)} + vSlot * 11.0, ring);
  float n = noise(p) * 0.6 + noise(p * 2.0 + vec3(13.0, 1.7, 4.1)) * 0.4;
  float open = smoothstep(0.0, 0.12, vPlume);
  if (open > 0.0) {
    vec3 q = vec3(vDist * ${glsl(NOISE_ALONG / PLUME_NOISE_SCALE)} - uPlumeShift + vSlot * 11.0, ring);
    float m = noise(q) * 0.6 + noise(q * 2.0 + vec3(13.0, 1.7, 4.1)) * 0.4;
    n = mix(n, m, open);
  }
#ifdef DETAIL
  n = n * 0.82 + noise(p * 4.0 + vec3(29.0, 5.5, 0.6)) * 0.18 * (1.0 - open) + noise(vec3(vDist * 5.0, ring * 2.0)) * 0.18 * open;
#endif
  // Torn, lumpy gas: a dense burst fills the pipe, thin flow breaks into wisps.
  float tear = smoothstep(0.42 - 0.2 * min(body, 1.0), 0.86, n);
  float density = body * tear * tear;

  // How much gas the eye looks through: most across the middle of the tube, none at its edges.
  float facing = abs(dot(normalize(vNormal), normalize(vView)));
  float depth = smoothstep(0.0, 0.65, facing) * mix(1.0, facing, 0.5 * vPlume);

  // Temperature: hottest at blowdown and at high revs, cooling along the pipes and fast in the open air.
  float temperature = portTemperature(e) * mix(0.62, 1.0, uLoad) * mix(1.0, 0.7, uDiesel);
  temperature *= exp(-vDist / 7.5) * (1.0 - 0.85 * smoothstep(0.0, 0.5, vPlume));

  vec3 glow = glowColour(temperature) * temperature * temperature * density * (0.42 + 0.3 * uLoad) * (1.0 - open);
  // Cooled gas shows as haze: water vapour for petrol, sootier for a diesel under load.
  float haze = density * (1.0 - temperature) * mix(0.12, 0.62, open) * (1.0 + uDiesel * (0.6 + 0.9 * uLoad));
  vec3 hazeColour = mix(vec3(0.78, 0.8, 0.84), vec3(0.36, 0.34, 0.31), uDiesel);
  float strength = depth * vFade * uOpacity;
  // Encode colours before premultiplying opacity. Encoding an already tiny haze
  // contribution would brighten it into a luminous hose instead of translucent gas.
  float alpha = clamp(haze * strength, 0.0, 0.95);
  vec3 emitted = linearToOutputTexel(vec4(glow, 1.0)).rgb * strength;
  vec3 scattered = linearToOutputTexel(vec4(hazeColour, 1.0)).rgb * alpha;
  gl_FragColor = vec4(emitted + scattered, alpha);
}
`

export type GasMaterial = ShaderMaterial & {
  uniforms: {
    uSince: { value: Float32Array }
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
