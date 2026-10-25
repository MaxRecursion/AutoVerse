import { describe, expect, it } from 'vitest'
import { checkRobots, crawlDelayFor, groupsFor, isAllowed, parseRobots, patternToRegExp, productToken } from './robots'

const UA = 'AutoVerseContentDiscovery/0.1 (+educational project; contact: repo owner)'

describe('parseRobots', () => {
  it('groups consecutive user-agent lines and collects rules, delays and sitemaps', () => {
    const robots = parseRobots(
      [
        '# comment',
        'User-agent: BadBot',
        'User-agent: OtherBot',
        'Disallow: /',
        '',
        'User-agent: *',
        'Disallow: /private/   # trailing comment',
        'Allow: /private/public-page',
        'Crawl-delay: 5',
        'Sitemap: https://example.com/sitemap.xml',
      ].join('\n'),
    )
    expect(robots.groups).toHaveLength(2)
    expect(robots.groups[0]!.agents).toEqual(['badbot', 'otherbot'])
    expect(robots.groups[1]!.rules).toEqual([
      { type: 'disallow', pattern: '/private/' },
      { type: 'allow', pattern: '/private/public-page' },
    ])
    expect(robots.groups[1]!.crawlDelay).toBe(5)
    expect(robots.sitemaps).toEqual(['https://example.com/sitemap.xml'])
  })

  it('treats an empty Disallow as allow-all and tolerates CRLF, BOM and odd spacing', () => {
    const robots = parseRobots('\uFEFFUser-agent: *\r\nDisallow:\r\nUser-agent: dotbot\r\nDisallow:/ \r\n')
    expect(robots.groups[0]!.rules).toEqual([])
    expect(robots.groups[1]!.rules).toEqual([{ type: 'disallow', pattern: '/' }])
  })

  it('ignores rules that appear before any user-agent line and invalid crawl delays', () => {
    const robots = parseRobots('Disallow: /x\nUser-agent: *\nCrawl-delay: soon\n')
    expect(robots.groups).toHaveLength(1)
    expect(robots.groups[0]!.rules).toEqual([])
    expect(robots.groups[0]!.crawlDelay).toBeUndefined()
  })
})

describe('group selection', () => {
  it('extracts the product token from a full user-agent string', () => {
    expect(productToken(UA)).toBe('autoversecontentdiscovery')
  })

  it('uses a group naming our token instead of the * group', () => {
    const robots = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: AutoVerseContentDiscovery\nDisallow: /tmp\n')
    expect(groupsFor(robots, UA)).toHaveLength(1)
    expect(isAllowed(robots, UA, '/engine')).toBe(true)
    expect(isAllowed(robots, UA, '/tmp/file')).toBe(false)
  })

  it('allows everything when no group applies (bot-specific blocks only)', () => {
    const robots = parseRobots('User-agent: MJ12bot\nDisallow: /\nUser-agent: AhrefsBot\nDisallow: /\n')
    expect(groupsFor(robots, UA)).toEqual([])
    expect(isAllowed(robots, UA, '/basics/how-a-diesel-engine-works.amp')).toBe(true)
  })

  it('merges multiple groups that name the same agent', () => {
    const robots = parseRobots('User-agent: *\nDisallow: /a\n\nUser-agent: *\nDisallow: /b\nCrawl-delay: 3\n')
    expect(isAllowed(robots, UA, '/a')).toBe(false)
    expect(isAllowed(robots, UA, '/b')).toBe(false)
    expect(crawlDelayFor(robots, UA)).toBe(3)
  })
})

describe('rule matching', () => {
  const robots = parseRobots(
    [
      'User-agent: *',
      'Disallow: /private',
      'Allow: /private/open',
      'Disallow: /*.pdf$',
      'Disallow: /search?',
      'Allow: /tie',
      'Disallow: /tie',
    ].join('\n'),
  )

  it('applies longest-match precedence', () => {
    expect(isAllowed(robots, UA, '/private/secret')).toBe(false)
    expect(isAllowed(robots, UA, '/private/open/page')).toBe(true)
    expect(checkRobots(robots, UA, '/private/x').rule).toEqual({ type: 'disallow', pattern: '/private' })
  })

  it('supports * wildcards and the $ end anchor', () => {
    expect(isAllowed(robots, UA, '/docs/manual.pdf')).toBe(false)
    expect(isAllowed(robots, UA, '/docs/manual.pdf?download=1')).toBe(true)
    expect(isAllowed(robots, UA, '/search?q=brakes')).toBe(false)
    expect(isAllowed(robots, UA, '/search')).toBe(true)
  })

  it('lets allow win a tie of equal-length patterns', () => {
    expect(isAllowed(robots, UA, '/tie')).toBe(true)
  })

  it('always allows /robots.txt and matches percent-encoded unreserved characters', () => {
    expect(isAllowed(parseRobots('User-agent: *\nDisallow: /'), UA, '/robots.txt')).toBe(true)
    expect(isAllowed(robots, UA, '/%70rivate/x')).toBe(false)
  })

  it('escapes regex metacharacters in patterns', () => {
    expect(patternToRegExp('/a.b(c)').test('/a.b(c)/d')).toBe(true)
    expect(patternToRegExp('/a.b').test('/axb')).toBe(false)
  })
})
