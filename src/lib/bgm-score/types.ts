import { z } from 'zod'

export const BGM_STEM_ROLES = [
  'atmosphere',
  'pulse',
  'low_end',
  'harmony',
  'motif',
  'music_transition',
] as const

export type BgmStemRole = (typeof BGM_STEM_ROLES)[number]

export const BGM_SCORE_STATUS = {
  PENDING: 'pending',
  GENERATING: 'generating',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const

export type BgmScoreStatus = (typeof BGM_SCORE_STATUS)[keyof typeof BGM_SCORE_STATUS]

export const bgmStemRoleSchema = z.enum(BGM_STEM_ROLES)

export const bgmScorePlanSchema = z.object({
  durationSeconds: z.number().positive().max(600),
  global: z.object({
    mood: z.string().trim().min(1),
    genre: z.string().trim().min(1),
    bpm: z.number().int().min(20).max(300).optional().nullable(),
    key: z.string().trim().min(1).optional().nullable(),
    intensityCurve: z.array(z.object({
      timeSec: z.number().min(0),
      intensity: z.number().min(0).max(100),
    })).min(1).max(24),
  }),
  stems: z.array(z.object({
    role: bgmStemRoleSchema,
    reason: z.string().trim().min(1),
    startSec: z.number().min(0),
    durationSec: z.number().positive(),
    gainDb: z.number().min(-36).max(6),
    fadeInSec: z.number().min(0).max(30),
    fadeOutSec: z.number().min(0).max(30),
    density: z.number().min(0).max(100),
    tension: z.number().min(0).max(100),
    brightness: z.number().min(0).max(100),
    motion: z.number().min(0).max(100),
    prompt: z.string().trim().min(1),
    negativePrompt: z.string().trim().optional().nullable(),
  })).min(1).max(6),
}).superRefine((plan, ctx) => {
  const seenRoles = new Set<BgmStemRole>()
  plan.stems.forEach((stem, index) => {
    if (seenRoles.has(stem.role)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stems', index, 'role'],
        message: 'BGM_SCORE_DUPLICATE_STEM_ROLE',
      })
    }
    seenRoles.add(stem.role)

    if (stem.startSec + stem.durationSec > plan.durationSeconds + 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stems', index, 'durationSec'],
        message: 'BGM_SCORE_STEM_TIMING_OUT_OF_RANGE',
      })
    }

    if (stem.fadeInSec + stem.fadeOutSec > stem.durationSec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stems', index, 'fadeOutSec'],
        message: 'BGM_SCORE_STEM_FADE_EXCEEDS_DURATION',
      })
    }
  })
})

export type BgmScorePlan = z.infer<typeof bgmScorePlanSchema>
export type BgmScorePlanStem = BgmScorePlan['stems'][number]

export interface BgmScoreGeneratedStem {
  readonly role: BgmStemRole
  readonly reason: string
  readonly startSec: number
  readonly durationSec: number
  readonly gainDb: number
  readonly fadeInSec: number
  readonly fadeOutSec: number
  readonly prompt: string
  readonly negativePrompt?: string | null
  readonly mediaId: string
  readonly url: string
  readonly storageKey: string
  readonly mimeType: string
  readonly durationMs: number
}

export interface BgmScoreMix {
  readonly mediaId: string
  readonly url: string
  readonly storageKey: string
  readonly mimeType: string
  readonly durationMs: number
}

export interface BgmScoreProjectData {
  readonly schemaVersion: 1
  readonly status: BgmScoreStatus
  readonly taskId: string
  readonly editScriptId: string
  readonly timelineSignature: string
  readonly durationSeconds: number
  readonly musicModel: string
  readonly plan?: BgmScorePlan
  readonly stems?: readonly BgmScoreGeneratedStem[]
  readonly mix?: BgmScoreMix
  readonly errorMessage?: string | null
}
