// @vitest-environment node
import { parseRepository, parseRepositoryInput, validateBranch, validateRepositoryPath } from './validation'

describe('repository and branch validation', () => {
  it('accepts public GitHub URL forms and strips a .git suffix', () => {
    expect(parseRepository('https://github.com/microsoft/TypeScript.git/')).toEqual({ owner: 'microsoft', repository: 'TypeScript' })
    expect(parseRepositoryInput({ repository: 'microsoft/TypeScript', branch: 'release/5.0' })).toEqual({ owner: 'microsoft', repository: 'TypeScript', branch: 'release/5.0' })
  })

  it.each([
    'https://github.com.attacker.test/acme/demo',
    'http://github.com/acme/demo',
    'https://github.com/acme/demo/tree/main',
    'https://user@github.com/acme/demo',
    'https://github.com/acme/demo?redirect=example.com',
    'acme/../secrets',
  ])('rejects unsafe repository input %s', (input) => {
    expect(() => parseRepository(input)).toThrow()
  })

  it('rejects branch and path traversal', () => {
    expect(() => validateBranch('../main')).toThrow()
    expect(() => validateBranch('feature//next')).toThrow()
    expect(validateRepositoryPath('src/components/Button.tsx')).toBe(true)
    expect(validateRepositoryPath('../.env')).toBe(false)
    expect(validateRepositoryPath('/etc/passwd')).toBe(false)
  })
})
