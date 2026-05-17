import { z } from 'zod'
import type { EditAssetRequirement, EditScriptPayload, EditScriptShot, EditScriptVideoBlock } from '@/lib/edit-script/types'

export const CONSISTENCY_LAB_STRATEGIES = [
  'structured_text',
  'grid_coordinates',
  'contact_sheet_9grid',
] as const

export type ConsistencyLabStrategy = (typeof CONSISTENCY_LAB_STRATEGIES)[number]

export const CONSISTENCY_LAB_RUN_STATUSES = ['pending', 'generating', 'ready', 'failed'] as const
export type ConsistencyLabRunStatus = (typeof CONSISTENCY_LAB_RUN_STATUSES)[number]

export const CONSISTENCY_LAB_ARTIFACT_STATUSES = ['pending', 'generating', 'ready', 'failed'] as const
export type ConsistencyLabArtifactStatus = (typeof CONSISTENCY_LAB_ARTIFACT_STATUSES)[number]

export type FixedSpaceClassification = 'fixed_space_strong' | 'fixed_space_weak' | 'no_fixed_space'

export interface ConsistencyLabModelConfigSnapshot {
  readonly analysisModel: string
  readonly storyboardModel: string
  readonly videoModel: string | null
  readonly singleShotVideoModel: string | null
  readonly sequenceVideoModel: string | null
}

export interface ConsistencyLabAssetSnapshot {
  readonly requirementId: string
  readonly kind: EditAssetRequirement['kind']
  readonly name: string
  readonly description: string
  readonly shotNumbers: readonly number[]
  readonly targetId: string
  readonly previewImageUrl: string | null
}

export interface ConsistencyLabSourceVideoBlock extends EditScriptVideoBlock {
  readonly blockIndex: number
  readonly sourceVideoBlockId: string
}

export interface ConsistencyLabSourceSnapshot {
  readonly schemaVersion: 1
  readonly projectId: string
  readonly episodeId: string
  readonly sourceEditScriptId: string
  readonly project: {
    readonly videoRatio: string
    readonly artStyle: string | null
    readonly directorStyleDoc: string | null
  }
  readonly editScript: Pick<EditScriptPayload, 'id' | 'title' | 'logline' | 'durationSec' | 'shotCount' | 'userPrompt' | 'screenplayText'>
  readonly shots: readonly EditScriptShot[]
  readonly videoBlocks: readonly ConsistencyLabSourceVideoBlock[]
  readonly assets: readonly ConsistencyLabAssetSnapshot[]
}

export interface ConsistencyLabBlockClassification {
  readonly sourceVideoBlockId: string
  readonly blockIndex: number
  readonly classification: FixedSpaceClassification
  readonly reason: string
  readonly participantNames: readonly string[]
  readonly locationNames: readonly string[]
  readonly excludedByMotionOrAbstraction: boolean
}

export interface StructuredTextShotContinuity {
  readonly shotNumber: number
  readonly classification: FixedSpaceClassification
  readonly primarySubjects: readonly string[]
  readonly secondaryPresence: readonly string[]
  readonly screenContinuity: string
  readonly depthOfField: string
}

export interface StructuredTextBlockOutput {
  readonly sourceVideoBlockId: string
  readonly classification: FixedSpaceClassification
  readonly location: string | null
  readonly participants: readonly string[]
  readonly anchors: readonly string[]
  readonly spatialRelation: string
  readonly screenContinuity: string
  readonly shots: readonly StructuredTextShotContinuity[]
}

export interface StructuredTextStrategyOutput {
  readonly strategy: 'structured_text'
  readonly blockClassifications: readonly ConsistencyLabBlockClassification[]
  readonly blocks: readonly StructuredTextBlockOutput[]
}

export interface GridPlanCoordinate {
  readonly name: string
  readonly kind: 'character' | 'anchor'
  readonly x: number
  readonly y: number
  readonly facing?: string
}

export interface GridCoordinatesBlockOutput {
  readonly sourceVideoBlockId: string
  readonly classification: FixedSpaceClassification
  readonly grid: {
    readonly columns: number
    readonly rows: number
    readonly ratio: string
    readonly shortSideUnits: 9
  }
  readonly coordinates: readonly GridPlanCoordinate[]
  readonly cinematicTranslation: string
  readonly perShotInstructions: readonly StructuredTextShotContinuity[]
}

export interface GridCoordinatesStrategyOutput {
  readonly strategy: 'grid_coordinates'
  readonly blockClassifications: readonly ConsistencyLabBlockClassification[]
  readonly blocks: readonly GridCoordinatesBlockOutput[]
}

export interface ContactSheetCell {
  readonly shotNumber: number
  readonly cellIndex: number
  readonly row: number
  readonly column: number
  readonly crop: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
}

export interface ContactSheetGroup {
  readonly sourceVideoBlockId: string
  readonly groupIndex: number
  readonly shotNumbers: readonly number[]
  readonly cells: readonly ContactSheetCell[]
}

export interface ContactSheet9GridStrategyOutput {
  readonly strategy: 'contact_sheet_9grid'
  readonly groups: readonly ContactSheetGroup[]
}

export type ConsistencyLabStrategyOutput =
  | StructuredTextStrategyOutput
  | GridCoordinatesStrategyOutput
  | ContactSheet9GridStrategyOutput

export interface ConsistencyLabPanelDraft {
  readonly panelIndex: number
  readonly sourceShotNumber: number
  readonly sourceVideoBlockId: string
  readonly prompt: string
  readonly metadata: Record<string, unknown>
}

export interface ConsistencyLabRunDto {
  readonly id: string
  readonly projectId: string
  readonly episodeId: string
  readonly sourceEditScriptId: string
  readonly strategy: ConsistencyLabStrategy
  readonly status: ConsistencyLabRunStatus
  readonly modelConfigSnapshot: unknown
  readonly sourceSnapshotJson: unknown
  readonly strategyInputJson: unknown
  readonly strategyOutputJson: unknown
  readonly errorMessage: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly panels: readonly ConsistencyLabPanelDto[]
  readonly videos: readonly ConsistencyLabVideoDto[]
}

export interface ConsistencyLabPanelDto {
  readonly id: string
  readonly runId: string
  readonly sourceShotNumber: number
  readonly sourceVideoBlockId: string
  readonly panelIndex: number
  readonly prompt: string
  readonly imageUrl: string | null
  readonly imageMediaId: string | null
  readonly candidateImages: string | null
  readonly metadataJson: unknown
  readonly status: ConsistencyLabArtifactStatus
  readonly errorMessage: string | null
}

export interface ConsistencyLabVideoDto {
  readonly id: string
  readonly runId: string
  readonly sourceVideoBlockId: string
  readonly sourceShotNumbers: unknown
  readonly prompt: string
  readonly referencePanelImageIds: unknown
  readonly videoUrl: string | null
  readonly videoMediaId: string | null
  readonly metadataJson: unknown
  readonly status: ConsistencyLabArtifactStatus
  readonly errorMessage: string | null
}

export const createConsistencyExperimentRunRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
  editScriptId: z.string().trim().min(1),
  strategy: z.enum(CONSISTENCY_LAB_STRATEGIES),
})

export const listConsistencyExperimentRunsRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
  editScriptId: z.string().trim().min(1),
})

const sourceShotSchema = z.object({
  shotNumber: z.number().int().positive(),
  durationSec: z.number().int().positive(),
  visualAction: z.string(),
  charactersAndScene: z.string(),
  camera: z.string(),
  videoPrompt: z.string(),
  sound: z.string(),
})

const sourceVideoBlockSchema = z.object({
  kind: z.enum(['single', 'group']),
  shotNumbers: z.array(z.number().int().positive()).min(1),
  gridMode: z.enum(['2x2', '3x3']).optional(),
  reason: z.string(),
  prompt: z.string(),
  blockIndex: z.number().int().min(0),
  sourceVideoBlockId: z.string().min(1),
})

const sourceAssetSchema = z.object({
  requirementId: z.string().min(1),
  kind: z.enum(['character', 'location']),
  name: z.string(),
  description: z.string(),
  shotNumbers: z.array(z.number().int().positive()),
  targetId: z.string().min(1),
  previewImageUrl: z.string().nullable(),
})

export const consistencyLabSourceSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: z.string().min(1),
  episodeId: z.string().min(1),
  sourceEditScriptId: z.string().min(1),
  project: z.object({
    videoRatio: z.string().min(1),
    artStyle: z.string().nullable(),
    directorStyleDoc: z.string().nullable(),
  }),
  editScript: z.object({
    id: z.string().min(1),
    title: z.string(),
    logline: z.string().nullable(),
    durationSec: z.number().int().positive(),
    shotCount: z.number().int().nonnegative(),
    userPrompt: z.string(),
    screenplayText: z.string().nullable().optional(),
  }),
  shots: z.array(sourceShotSchema).min(1),
  videoBlocks: z.array(sourceVideoBlockSchema).min(1),
  assets: z.array(sourceAssetSchema),
})
