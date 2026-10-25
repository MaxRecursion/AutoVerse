/**
 * Node-side content loader shared by validation and prerendering. Reads the
 * JSON under src/content with fs and parses it with the app's Zod schemas via
 * the same pure helper the app uses (parseContentFiles), so tooling and app
 * can never disagree about what is valid.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { z } from 'zod'
import { parseContentFiles, type ContentBundle, type ContentError } from '../../src/lib/content'
import {
  CategorySchema,
  LearningPathSchema,
  ModelManifestSchema,
  SceneComponentSchema,
  SourceArticleSchema,
  SystemMapSchema,
  TopicSchema,
  type LearningPath,
  type ModelManifest,
  type SourceArticle,
} from '../../src/lib/schemas'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const CONTENT_DIR = path.join(ROOT, 'src/content')

export function listJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listJsonFiles(full))
    else if (entry.endsWith('.json')) out.push(full)
  }
  return out
}

const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join('/')

export interface LoadedContent extends ContentBundle {
  sourceArticles: SourceArticle[]
  learningPaths: LearningPath[]
  /** topic id → repo-relative file path. */
  topicFiles: Map<string, string>
  /** Files that could not be read or parsed as JSON, plus schema failures. */
  errors: ContentError[]
  /** JSON files under src/content that no loader picks up. */
  unknownFiles: string[]
}

function readJsonFiles(files: string[], errors: ContentError[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const file of files) {
    try {
      out[rel(file)] = JSON.parse(readFileSync(file, 'utf8'))
    } catch (error) {
      errors.push({ file: rel(file), message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` })
    }
  }
  return out
}

export function loadContent(contentDir = CONTENT_DIR): LoadedContent {
  const errors: ContentError[] = []
  const at = (...p: string[]) => path.join(contentDir, ...p)
  const exists = (file: string) => (existsSync(file) ? [file] : [])

  const categoryFiles = exists(at('categories.json'))
  const topicPaths = listJsonFiles(at('topics'))
  const componentPaths = listJsonFiles(at('components')).filter((f) => path.dirname(f) === at('components'))
  const mapFiles = exists(at('system-map.json'))
  const sourceFiles = exists(at('source-index.json'))
  const pathFiles = exists(at('learning-paths.json'))

  const parse = <S extends z.ZodType>(schema: S, files: string[]) => {
    const result = parseContentFiles(schema, readJsonFiles(files, errors))
    errors.push(...result.errors)
    return result.items
  }

  const categories = parse(CategorySchema, categoryFiles).sort((a, b) => a.order - b.order)
  const topicFiles = new Map<string, string>()
  const topics = topicPaths.flatMap((file) => {
    const items = parse(TopicSchema, [file])
    items.forEach((t) => topicFiles.set(t.id, rel(file)))
    return items
  })
  const components = parse(SceneComponentSchema, componentPaths)
  const systemMap = parse(SystemMapSchema, mapFiles)[0] ?? null
  const sourceArticles = parse(SourceArticleSchema, sourceFiles)
  const learningPaths = parse(LearningPathSchema, pathFiles).sort((a, b) => a.order - b.order)

  const known = new Set([...categoryFiles, ...topicPaths, ...componentPaths, ...mapFiles, ...sourceFiles, ...pathFiles].map(rel))
  const unknownFiles = listJsonFiles(contentDir)
    .map(rel)
    .filter((f) => !known.has(f))

  return { categories, topics, components, systemMap, sourceArticles, learningPaths, topicFiles, errors, unknownFiles }
}

/** Lab ids declared in src/features/labs/registry.ts (read as text — the registry imports React). */
export function readLabIds(): string[] {
  const file = path.join(ROOT, 'src/features/labs/registry.ts')
  if (!existsSync(file)) return []
  const source = readFileSync(file, 'utf8')
  const ids = [...source.matchAll(/\bid:\s*['"]([a-z0-9-]+)['"]/g)].map((m) => m[1]!)
  return [...new Set(ids)]
}

export function loadModelManifest(): { manifest: ModelManifest | null; error?: string } {
  const file = path.join(ROOT, 'public/models/manifest.json')
  if (!existsSync(file)) return { manifest: null }
  try {
    const res = ModelManifestSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
    if (res.success) return { manifest: res.data }
    return { manifest: null, error: res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  } catch (error) {
    return { manifest: null, error: error instanceof Error ? error.message : String(error) }
  }
}
