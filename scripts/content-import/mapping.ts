/**
 * Map a source article (site category + URL slug) onto an AutoVerse category
 * id (src/content/categories.json). Pure and table-driven: keyword rules on
 * the article slug are tried first (the source's "Basics" and "Technology"
 * sections span many systems), then the source category default.
 */

export const AUTOVERSE_CATEGORY_IDS = [
  'basics',
  'engine',
  'fuel-ignition',
  'cooling-lubrication',
  'transmission',
  'drivetrain',
  'brakes',
  'suspension-steering',
  'wheels-tyres',
  'electrical',
  'hvac',
  'body-chassis',
  'aero-technology',
  'maintenance',
  'driving',
] as const

export type AutoVerseCategoryId = (typeof AUTOVERSE_CATEGORY_IDS)[number]

/** Source category slug (first URL path segment) → default AutoVerse category. */
export const SOURCE_CATEGORY_DEFAULTS: Record<string, AutoVerseCategoryId> = {
  basics: 'basics',
  engine: 'engine',
  'fuel-systems': 'fuel-ignition',
  'ignition-system': 'fuel-ignition',
  'cooling-systems': 'cooling-lubrication',
  transmission: 'transmission',
  brakes: 'brakes',
  steering: 'suspension-steering',
  suspension: 'suspension-steering',
  'wheels-and-tyres': 'wheels-tyres',
  'electrical-systems': 'electrical',
  accessories: 'electrical',
  bodywork: 'body-chassis',
  technology: 'aero-technology',
  modifications: 'maintenance',
  'advanced-driving': 'driving',
}

interface KeywordRule {
  /** Matched against the article slug (last URL path segment). */
  pattern: RegExp
  category: AutoVerseCategoryId
  /** Restrict the rule to these source categories (default: all except advanced-driving). */
  sources?: readonly string[]
}

/** First matching rule wins, so specific patterns come before broad ones. */
export const KEYWORD_RULES: readonly KeywordRule[] = [
  { pattern: /\b(heater|heating|ventilat)/, category: 'hvac' },
  { pattern: /\babs\b/, category: 'brakes' },
  { pattern: /\b(torque-and-bhp)\b/, category: 'basics' },
  { pattern: /\b(starter|starting-system|bendix|dynamo|charging|alternator|electrical-systems)\b/, category: 'electrical' },
  { pattern: /\b(clutch|gearbox|gearboxes|transmission)\b/, category: 'transmission', sources: ['basics'] },
  { pattern: /\b(half-shafts|u-joints|rear-axle|driven-wheel-hubs)\b/, category: 'drivetrain' },
  { pattern: /\b(diesel|fuel|carburettor|carburettors|ignition|lean-burn)\b/, category: 'fuel-ignition', sources: ['basics', 'technology'] },
  { pattern: /\b(cooling)\b/, category: 'cooling-lubrication', sources: ['basics'] },
  { pattern: /\b(oil-is-refined)\b/, category: 'cooling-lubrication' },
  { pattern: /\b(braking)\b/, category: 'brakes', sources: ['basics'] },
  { pattern: /\b(suspension|springs-and-dampers|steering)\b/, category: 'suspension-steering', sources: ['basics'] },
  { pattern: /\b(engine|timing|valves|two-stroke|wankel)\b/, category: 'engine', sources: ['basics', 'technology'] },
  { pattern: /\b(exhaust)\b/, category: 'engine', sources: ['bodywork'] },
]

const lastSegment = (url: string): string => {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean)
    return (parts.at(-1) ?? '').replace(/\.amp$/, '')
  } catch {
    return ''
  }
}

/** AutoVerse category for a source article, or undefined if the source category is unknown. */
export function mapToCategory(sourceCategorySlug: string | null | undefined, url: string): AutoVerseCategoryId | undefined {
  const source = sourceCategorySlug ?? ''
  if (source !== 'advanced-driving') {
    const slug = lastSegment(url)
    for (const rule of KEYWORD_RULES) {
      if (rule.sources && !rule.sources.includes(source)) continue
      if (rule.pattern.test(slug)) return rule.category
    }
  }
  return SOURCE_CATEGORY_DEFAULTS[source]
}
