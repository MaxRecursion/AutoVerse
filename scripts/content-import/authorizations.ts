/**
 * Reuse permissions (scripts/content-import/authorizations.json).
 *
 * The import step brings in full article content ONLY for URLs matched by an
 * entry here. An entry records who granted what, when and where the evidence
 * lives, so every imported article can be traced back to an explicit licence.
 * The file ships with an empty `authorizations` array: no third-party article
 * is currently licensed for reuse, so everything is metadata-only.
 */
import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD')

export const AuthorizationSchema = z
  .object({
    url: z.url().optional(),
    urlPrefix: z.url().optional(),
    licence: z.object({ name: z.string().min(1), url: z.url().optional() }),
    grantedBy: z.string().min(1),
    grantedAt: isoDate,
    evidence: z.string().min(1),
    attribution: z.string().min(1),
  })
  .refine((a) => Boolean(a.url) !== Boolean(a.urlPrefix), { message: 'give exactly one of url or urlPrefix' })

export const AuthorizationsFileSchema = z.union([
  z.array(AuthorizationSchema),
  z.object({ authorizations: z.array(AuthorizationSchema) }).loose(),
])

export type Authorization = z.infer<typeof AuthorizationSchema>

/** Parse the authorisations file (bare array or `{ authorizations: [...] }`). Throws on invalid entries. */
export function parseAuthorizations(raw: unknown): Authorization[] {
  const res = AuthorizationsFileSchema.safeParse(raw)
  if (!res.success) {
    throw new Error(`invalid authorizations.json: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
  }
  return Array.isArray(res.data) ? res.data : res.data.authorizations
}

const stripSlash = (u: string) => u.replace(/\/+$/, '')

/** The authorisation covering `url`, if any. Exact matches win over prefixes; longer prefixes win. */
export function findAuthorization(url: string, authorizations: readonly Authorization[]): Authorization | undefined {
  const target = stripSlash(url)
  const exact = authorizations.find((a) => a.url && stripSlash(a.url) === target)
  if (exact) return exact
  return authorizations
    .filter((a) => {
      if (!a.urlPrefix) return false
      const prefix = stripSlash(a.urlPrefix)
      return target === prefix || target.startsWith(`${prefix}/`)
    })
    .sort((a, b) => (b.urlPrefix?.length ?? 0) - (a.urlPrefix?.length ?? 0))[0]
}
