import { z } from 'zod'

/**
 * Runtime schemas for every piece of educational content. All JSON under
 * src/content is parsed through these at load time (see lib/content.ts) and
 * in `npm run validate:content`, so malformed data fails loudly.
 */

const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ids must be kebab-case')

export const DifficultySchema = z.enum(['beginner', 'intermediate', 'advanced'])
export const ContentStatusSchema = z.enum(['complete', 'draft', 'outline'])
export const ExplanationLevelSchema = z.enum(['beginner', 'technical'])

export const SourceReferenceSchema = z.object({
  title: z.string().min(1),
  url: z.url(),
  publisher: z.string().optional(),
  /** ISO date the source was consulted. */
  accessed: z.string().optional(),
  note: z.string().optional(),
})

export const LicenceSchema = z.object({
  name: z.string().min(1),
  url: z.url().optional(),
  holder: z.string().optional(),
})

export const CategorySchema = z.object({
  id,
  slug: id,
  title: z.string().min(1),
  summary: z.string().min(1),
  /** lucide-react icon name, resolved in components/learning/CategoryIcon. */
  icon: z.string().min(1),
  order: z.number().int(),
  /** Vehicle system this category maps to in the system map / explorer. */
  systemId: id.optional(),
})

export const StepSchema = z.object({
  id,
  title: z.string().min(1),
  beginner: z.string().min(1),
  technical: z.string().min(1),
  /** Lab cue to seek to when this step is activated (lab-defined id). */
  cue: z.string().optional(),
  componentIds: z.array(id).default([]),
})

export const QuizQuestionSchema = z
  .object({
    id,
    prompt: z.string().min(1),
    options: z.array(z.string().min(1)).min(2).max(6),
    answerIndex: z.number().int().min(0),
    explanation: z.string().min(1),
  })
  .refine((q) => q.answerIndex < q.options.length, { message: 'answerIndex out of range' })

export const FlowDiagramSchema = z.object({
  nodes: z.array(
    z.object({
      id,
      label: z.string().min(1),
      detail: z.string().optional(),
      componentId: id.optional(),
      topicId: id.optional(),
    }),
  ),
  edges: z.array(z.object({ from: id, to: id, label: z.string().optional() })),
})

export const TopicSchema = z.object({
  id,
  slug: id,
  title: z.string().min(1),
  summary: z.string().min(1),
  categoryId: id,
  difficulty: DifficultySchema,
  /** Minutes. */
  estimatedDuration: z.number().int().positive(),
  tags: z.array(z.string()).default([]),
  learningObjectives: z.array(z.string().min(1)).default([]),
  beginnerExplanation: z.string().min(1),
  technicalExplanation: z.string().min(1),
  steps: z.array(StepSchema).default([]),
  componentIds: z.array(id).default([]),
  /** Lab rendered inside the lesson (features/labs registry id). */
  labId: id.optional(),
  /** Asset id in public/models/manifest.json, when a third-party model is used. */
  modelAsset: z.string().optional(),
  animationId: z.string().optional(),
  flow: FlowDiagramSchema.optional(),
  keyConcepts: z
    .array(z.object({ term: z.string().min(1), definition: z.string().min(1), equation: z.string().optional() }))
    .default([]),
  misconceptions: z.array(z.object({ myth: z.string().min(1), reality: z.string().min(1) })).default([]),
  practicalExamples: z.array(z.string().min(1)).default([]),
  relatedTopicIds: z.array(id).default([]),
  prerequisiteTopicIds: z.array(id).default([]),
  quiz: z.array(QuizQuestionSchema).default([]),
  sourceReferences: z.array(SourceReferenceSchema).default([]),
  attribution: z.string().optional(),
  licence: LicenceSchema,
  contentStatus: ContentStatusSchema,
})

export const SceneComponentSchema = z.object({
  id,
  name: z.string().min(1),
  /** Vehicle system the component belongs to (engine, transmission, ...). */
  systemId: id,
  description: z.string().min(1),
  technical: z.string().optional(),
  /** Exact node name in a GLB when the part comes from a third-party model. */
  modelObjectName: z.string().optional(),
  parentComponentId: id.optional(),
  relatedTopicIds: z.array(id).default([]),
  annotations: z.array(z.object({ label: z.string(), text: z.string() })).default([]),
  highlight: z
    .object({
      color: z.string().default('#38d7f2'),
      emphasis: z.enum(['glow', 'tint']).default('glow'),
    })
    .default({ color: '#38d7f2', emphasis: 'glow' }),
})

export const SystemMapSchema = z.object({
  nodes: z.array(
    z.object({
      id,
      label: z.string().min(1),
      topicId: id.optional(),
      /** Focus target in a supported 3D scene. */
      focus: z.object({ labId: id, componentId: id.optional() }).optional(),
      group: z.string().optional(),
      /** Optional short explanation of the node on the map (otherwise the UI quotes the topic summary). */
      description: z.string().min(1).optional(),
    }),
  ),
  layouts: z.array(
    z.object({
      id,
      title: z.string().min(1),
      description: z.string().min(1),
      /** Ordered power path, node ids. */
      path: z.array(id).min(2),
      notes: z.array(z.string()).default([]),
    }),
  ),
  /**
   * Relationships between systems (e.g. cooling → engine). `kind: 'flow'`
   * marks a branch of the power flow beyond a layout's main path (e.g. an
   * all-wheel-drive front axle); `'relation'` is never part of the flow.
   * Without `kind`, a link from a driveline node to a driveline / wheels node
   * is treated as a flow branch.
   */
  links: z.array(z.object({ from: id, to: id, label: z.string(), kind: z.enum(['flow', 'relation']).optional() })).default([]),
})

export const SourceArticleSchema = z.object({
  url: z.url(),
  title: z.string().min(1),
  sourceCategory: z.string().optional(),
  mappedCategoryId: id.optional(),
  importStatus: z.enum(['metadata-only', 'imported', 'failed', 'blocked-by-robots', 'skipped']),
  retrievedAt: z.string().optional(),
  licence: z.string(),
  note: z.string().optional(),
})

export const ModelManifestSchema = z.object({
  version: z.number(),
  generatedAt: z.string(),
  assets: z.array(
    z
      .object({
        id: z.string(),
        name: z.string(),
        system: z.string(),
        status: z.string(),
        source: z.object({ site: z.string(), modelPageUrl: z.string(), downloadUrl: z.string().nullish() }).loose(),
        author: z.string().nullish(),
        license: z
          .object({
            name: z.string(),
            url: z.string().nullish(),
            attributionRequired: z.boolean().nullish(),
            attributionText: z.string().nullish(),
          })
          .loose(),
        localPath: z.string().nullish(),
        readyForInteractiveUse: z.boolean(),
        componentMap: z.record(z.string(), z.string()).default({}),
      })
      .loose(),
  ),
})

export type Difficulty = z.infer<typeof DifficultySchema>
export type ContentStatus = z.infer<typeof ContentStatusSchema>
export type ExplanationLevel = z.infer<typeof ExplanationLevelSchema>
export type Category = z.infer<typeof CategorySchema>
export type Topic = z.infer<typeof TopicSchema>
export type Step = z.infer<typeof StepSchema>
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>
export type FlowDiagram = z.infer<typeof FlowDiagramSchema>
export type SceneComponent = z.infer<typeof SceneComponentSchema>
export type SystemMap = z.infer<typeof SystemMapSchema>
export type SourceArticle = z.infer<typeof SourceArticleSchema>
export type ModelManifest = z.infer<typeof ModelManifestSchema>

/**
 * Curated learning path (src/content/learning-paths.json). Paths may name
 * topics that are not written yet; the UI skips ids that do not resolve, so
 * these references are intentionally not part of findBrokenReferences().
 */
export const LearningPathSchema = z.object({
  id,
  title: z.string().min(1),
  summary: z.string().min(1),
  level: DifficultySchema,
  order: z.number().int().default(0),
  topicIds: z.array(id).min(2),
})

export type LearningPath = z.infer<typeof LearningPathSchema>
