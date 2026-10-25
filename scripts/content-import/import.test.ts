import { describe, expect, it } from 'vitest'
import { SourceArticleSchema } from '../../src/lib/schemas'
import type { InventoryArticle } from '../content-discovery/inventory'
import { findAuthorization, parseAuthorizations, type Authorization } from './authorizations'
import {
  METADATA_ONLY_LICENCE,
  countArticles,
  extractArticleText,
  failedImport,
  importedArticle,
  planImport,
  sortSourceArticles,
} from './build-index'
import { AUTOVERSE_CATEGORY_IDS, SOURCE_CATEGORY_DEFAULTS, mapToCategory } from './mapping'
import authorizationsFile from './authorizations.json'

const article = (over: Partial<InventoryArticle> = {}): InventoryArticle => ({
  url: 'https://www.example.com/brakes/bleeding-the-brakes',
  fetchUrl: 'https://www.example.com/brakes/bleeding-the-brakes.amp',
  title: ' Bleeding the brakes ',
  titleSource: 'page',
  sourceCategory: 'Brakes',
  sourceCategorySlug: 'brakes',
  sourceCategorySource: 'path',
  httpStatus: 200,
  fetched: true,
  retrievedAt: '2026-01-02T00:00:00.000Z',
  listedAt: '2026-01-01T00:00:00.000Z',
  robotsAllowed: true,
  discoveredFrom: [],
  ...over,
})

const auth = (over: Partial<Authorization> = {}): Authorization => ({
  licence: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  grantedBy: 'Example Ltd',
  grantedAt: '2026-01-01',
  evidence: 'https://www.example.com/licence',
  attribution: '© Example Ltd, CC BY 4.0',
  ...over,
})

describe('authorizations', () => {
  it('ships with no authorisations', () => {
    expect(parseAuthorizations(authorizationsFile)).toEqual([])
  })

  it('accepts a bare array and rejects entries without exactly one matcher or evidence', () => {
    expect(parseAuthorizations([auth({ url: 'https://www.example.com/a' })])).toHaveLength(1)
    expect(() => parseAuthorizations([auth()])).toThrow(/exactly one of url or urlPrefix/)
    expect(() => parseAuthorizations([auth({ url: 'https://x.test/a', urlPrefix: 'https://x.test/' })])).toThrow()
    expect(() => parseAuthorizations([{ ...auth({ url: 'https://x.test/a' }), evidence: '' }])).toThrow()
    expect(() => parseAuthorizations([auth({ url: 'https://x.test/a', grantedAt: 'last week' })])).toThrow(/YYYY-MM-DD/)
  })

  it('matches exact URLs before prefixes, on path boundaries only', () => {
    const exact = auth({ url: 'https://www.example.com/brakes/pads/', grantedBy: 'exact' })
    const broad = auth({ urlPrefix: 'https://www.example.com/', grantedBy: 'broad' })
    const narrow = auth({ urlPrefix: 'https://www.example.com/brakes', grantedBy: 'narrow' })
    const list = [broad, narrow, exact]
    expect(findAuthorization('https://www.example.com/brakes/pads', list)?.grantedBy).toBe('exact')
    expect(findAuthorization('https://www.example.com/brakes/discs', list)?.grantedBy).toBe('narrow')
    expect(findAuthorization('https://www.example.com/brakes-extra/x', [narrow])).toBeUndefined()
    expect(findAuthorization('https://www.example.com/engine/x', [narrow])).toBeUndefined()
  })
})

describe('mapToCategory', () => {
  it('maps every known source category to a real AutoVerse category', () => {
    for (const id of Object.values(SOURCE_CATEGORY_DEFAULTS)) expect(AUTOVERSE_CATEGORY_IDS).toContain(id)
  })

  it.each([
    ['basics', '/basics/how-a-diesel-engine-works', 'fuel-ignition'],
    ['basics', '/basics/how-an-engine-cooling-system-works', 'cooling-lubrication'],
    ['basics', '/basics/how-automatic-gearboxes-work', 'transmission'],
    ['basics', '/basics/how-the-starting-system-works', 'electrical'],
    ['basics', '/basics/how-car-heating-and-ventilation-systems-work', 'hvac'],
    ['basics', '/basics/the-engine-how-power-is-created', 'engine'],
    ['technology', '/technology/how-abs-works', 'brakes'],
    ['technology', '/technology/car-aerodynamics', 'aero-technology'],
    ['technology', '/technology/torque-and-bhp-explained', 'basics'],
    ['ignition-system', '/ignition-system/stripping-the-starter-motor', 'electrical'],
    ['ignition-system', '/ignition-system/cleaning-and-fitting-spark-plugs', 'fuel-ignition'],
    ['transmission', '/transmission/how-to-check-u-joints', 'drivetrain'],
    ['engine', '/engine/servicing-a-diesel-engine', 'engine'],
    ['advanced-driving', '/advanced-driving/braking', 'driving'],
    ['modifications', '/modifications/installing-a-turbocharger', 'maintenance'],
  ])('%s %s → %s', (source, pathname, expected) => {
    expect(mapToCategory(source, `https://www.example.com${pathname}.amp`)).toBe(expected)
  })

  it('returns undefined for unknown source categories', () => {
    expect(mapToCategory('podcasts', 'https://www.example.com/podcasts/episode-1')).toBeUndefined()
    expect(mapToCategory(null, 'not a url')).toBeUndefined()
  })
})

describe('planImport', () => {
  it('records unauthorised articles as metadata-only with an honest licence', () => {
    const [item] = planImport([article()], [])
    expect(item?.kind).toBe('record')
    const a = item!.kind === 'record' ? item.article : null
    expect(a).toMatchObject({
      url: 'https://www.example.com/brakes/bleeding-the-brakes',
      title: 'Bleeding the brakes',
      mappedCategoryId: 'brakes',
      importStatus: 'metadata-only',
      retrievedAt: '2026-01-02T00:00:00.000Z',
      licence: METADATA_ONLY_LICENCE,
    })
    expect(SourceArticleSchema.safeParse(a).success).toBe(true)
  })

  it('flags robots-blocked, inaccessible and listed-only articles', () => {
    const plan = planImport(
      [
        article({ url: 'https://www.example.com/brakes/a', robotsAllowed: false }),
        article({ url: 'https://www.example.com/brakes/b', httpStatus: 404 }),
        article({ url: 'https://www.example.com/brakes/c', fetched: false, httpStatus: null, retrievedAt: null }),
        article({ url: 'https://www.example.com/brakes/c' }),
      ],
      [],
    )
    expect(plan).toHaveLength(3)
    const records = plan.map((p) => (p.kind === 'record' ? p.article : null))
    expect(records.map((r) => r?.importStatus)).toEqual(['blocked-by-robots', 'failed', 'metadata-only'])
    expect(records[1]?.note).toMatch(/HTTP 404/)
    expect(records[2]?.note).toMatch(/category index only/)
    expect(records[2]?.retrievedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('only schedules authorised, reachable, robots-allowed articles for import', () => {
    const permission = auth({ urlPrefix: 'https://www.example.com/brakes' })
    const plan = planImport(
      [article(), article({ url: 'https://www.example.com/brakes/x', robotsAllowed: false }), article({ url: 'https://www.example.com/engine/y', sourceCategorySlug: 'engine' })],
      [permission],
    )
    expect(plan.map((p) => p.kind)).toEqual(['import', 'record', 'record'])
  })

  it('builds imported and failed records with licence and attribution', () => {
    const base = planImport([article()], [])[0]!
    const rec = base.kind === 'record' ? base.article : base.article
    const imported = importedArticle(rec, auth({ url: rec.url }), '2026-02-01T00:00:00.000Z')
    expect(imported).toMatchObject({ importStatus: 'imported', licence: 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)' })
    expect(imported.note).toContain('© Example Ltd')
    expect(failedImport(rec, 'HTTP 500')).toMatchObject({ importStatus: 'failed', note: 'Authorised import failed: HTTP 500' })
  })
})

describe('helpers', () => {
  it('sorts by mapped category then title and counts statuses', () => {
    const list = sortSourceArticles([
      { url: 'https://e.com/2', title: 'b', mappedCategoryId: 'engine', importStatus: 'metadata-only', licence: 'x' },
      { url: 'https://e.com/1', title: 'a', mappedCategoryId: 'engine', importStatus: 'failed', licence: 'x' },
      { url: 'https://e.com/3', title: 'z', mappedCategoryId: 'brakes', importStatus: 'metadata-only', licence: 'x' },
    ])
    expect(list.map((a) => a.url)).toEqual(['https://e.com/3', 'https://e.com/1', 'https://e.com/2'])
    expect(countArticles(list)).toEqual({ total: 3, byStatus: { 'metadata-only': 2, failed: 1 }, byCategory: { brakes: 1, engine: 2 } })
  })

  it('extracts readable article text without navigation or scripts', () => {
    const html = `<html><body><nav>Menu</nav><article><h1>Title &amp; more</h1><p>First <b>para</b>.</p><script>x()</script><p>Second</p></article><footer>F</footer></body></html>`
    expect(extractArticleText(html)).toBe('Title & more\n\nFirst para .\n\nSecond')
  })
})
