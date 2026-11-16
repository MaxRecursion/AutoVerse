/** Camera fitting for the engine cutaways, including their exhausts. No renderer or browser state. */
export type Vec3 = [number, number, number]

const TAN_HALF_FOV = Math.tan((38 * Math.PI) / 360)
const DEFAULT_DIRECTION: Vec3 = [0.55, 0.32, 0.78]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (v: Vec3): Vec3 => {
  const length = Math.hypot(...v)
  return [v[0] / length, v[1] / length, v[2] / length]
}

/** Eight corners of an axis-aligned part, for combining it with exhaust centre-line samples. */
export function cutawayBoundsPoints(min: Vec3, max: Vec3): Vec3[] {
  return [min[0], max[0]].flatMap((x) => [min[1], max[1]].flatMap((y) => [min[2], max[2]].map((z): Vec3 => [x, y, z])))
}

/** Fit a complete axis-aligned box; use the point-cloud version for an engine with narrow rear exhausts. */
export function fitCutawayBounds(min: Vec3, max: Vec3, aspect: number, direction: Vec3 = DEFAULT_DIRECTION): { position: Vec3; target: Vec3 } {
  return fitCutawayPoints(cutawayBoundsPoints(min, max), aspect, direction)
}

/**
 * Fit actual model points into the SceneCanvas's 38° field of view. Direction
 * points from target to camera. Each point contributes its screen projection
 * and depth towards the camera, so near parts stay inside the view. Exhaust
 * samples avoid combining a distant tailpipe with a bank width that ends at
 * the engine. Target remains the centre of the complete cloud's bounds.
 */
export function fitCutawayPoints(points: readonly Vec3[], aspect: number, direction: Vec3 = DEFAULT_DIRECTION): { position: Vec3; target: Vec3 } {
  const cloud: readonly Vec3[] = points.length ? points : [[0, 0, 0]]
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const point of cloud)
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, point[i]!)
      max[i] = Math.max(max[i]!, point[i]!)
    }
  const target: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const validDirection = direction.every(Number.isFinite) && Math.hypot(...direction) > 1e-8 ? direction : DEFAULT_DIRECTION
  const d = unit(validDirection)
  const crossUp = cross([0, 1, 0], d)
  // Three's Y-up lookAt nudges the viewing direction along +z at an exact pole.
  const right: Vec3 = Math.hypot(...crossUp) > 0 ? unit(crossUp) : [1, 0, 0]
  const up = unit(cross(d, right))
  const viewportAspect = Number.isFinite(aspect) ? Math.max(0.35, aspect) : 1
  let required = 0
  for (const point of cloud) {
    const p: Vec3 = [point[0] - target[0], point[1] - target[1], point[2] - target[2]]
    const projection = Math.max(Math.abs(dot(p, right)) / (TAN_HALF_FOV * viewportAspect), Math.abs(dot(p, up)) / TAN_HALF_FOV)
    required = Math.max(required, dot(p, d) + projection)
  }
  // Ten percent of breathing room, with a valid view even for a point-sized box.
  const distance = Math.max(1, required * 1.1)
  return {
    position: [target[0] + d[0] * distance, target[1] + d[1] * distance, target[2] + d[2] * distance],
    target,
  }
}
