import { z } from 'zod'
import { AI_PROMPT_IDS, buildAiPrompt } from '@/lib/ai-prompts'
import { executeAiTextStep, executeAiVisionStep } from '@/lib/ai-exec/engine'
import { safeParseJsonObject } from '@/lib/json-repair'
import type { Locale } from '@/i18n/routing'
import {
  buildContactSheet9GridStrategyOutput,
  classifyConsistencyBlocks,
  resolveGridDensity,
} from './strategies'
import type {
  ConsistencyLabPanelDraft,
  ConsistencyLabSourceSnapshot,
  ConsistencyLabStrategy,
  ConsistencyLabStrategyOutput,
} from './types'

const generatedPanelSchema = z.object({
  panelIndex: z.number().int().min(0),
  sourceShotNumber: z.number().int().positive(),
  sourceVideoBlockId: z.string().trim().min(1),
  prompt: z.string().trim().min(20),
})

const structuredTextPlanSchema = z.object({
  strategyOutput: z.object({
    strategy: z.literal('structured_text'),
  }).passthrough(),
  panels: z.array(generatedPanelSchema).min(1),
})

const gridFloorPlanSchema = z.object({
  strategyOutput: z.object({
    strategy: z.literal('grid_coordinates'),
    grid: z.object({
      columns: z.number().int().positive(),
      rows: z.number().int().positive(),
      ratio: z.string().trim().min(1),
      shortSideUnits: z.literal(9),
    }),
    floorPlans: z.array(z.object({
      sourceVideoBlockId: z.string().trim().min(1),
      groupIndex: z.number().int().min(0),
      classification: z.enum(['fixed_space_strong', 'fixed_space_weak', 'no_fixed_space']),
      location: z.string().nullable(),
      participants: z.array(z.string()),
      anchors: z.array(z.string()),
      skipped: z.boolean(),
      reason: z.string().trim().min(1),
      prompt: z.string().nullable(),
    })).min(1),
  }),
})

const gridCoordinateAnalysisSchema = z.object({
  strategyOutput: z.object({
    strategy: z.literal('grid_coordinates'),
  }).passthrough(),
  panels: z.array(generatedPanelSchema).min(1),
})

const contactSheetPlanSchema = z.object({
  strategyOutput: z.object({
    strategy: z.literal('contact_sheet_9grid'),
    groups: z.array(z.object({
      sourceVideoBlockId: z.string().trim().min(1),
      groupIndex: z.number().int().min(0),
      shotNumbers: z.array(z.number().int().positive()).min(1).max(9),
      prompt: z.string().trim().min(20),
      cells: z.array(z.object({
        shotNumber: z.number().int().positive(),
        cellIndex: z.number().int().min(0).max(8),
        row: z.number().int().min(0).max(2),
        column: z.number().int().min(0).max(2),
        cellPrompt: z.string().trim().min(10),
      })).min(1).max(9),
    })).min(1),
  }),
  panels: z.array(generatedPanelSchema).min(1),
})

export type GridFloorPlanModelOutput = z.infer<typeof gridFloorPlanSchema>['strategyOutput']
export type ContactSheetPlanModelOutput = z.infer<typeof contactSheetPlanSchema>['strategyOutput']

interface GenerationContext {
  readonly userId: string
  readonly projectId: string
  readonly model: string
  readonly locale: Locale
}

function stringifyForPrompt(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function panelContract(snapshot: ConsistencyLabSourceSnapshot) {
  return snapshot.shots.map((shot, panelIndex) => {
    const block = snapshot.videoBlocks.find((item) => item.shotNumbers.includes(shot.shotNumber))
    if (!block) throw new Error(`CONSISTENCY_LAB_PANEL_CONTRACT_BLOCK_MISSING:${shot.shotNumber}`)
    return {
      panelIndex,
      sourceShotNumber: shot.shotNumber,
      sourceVideoBlockId: block.sourceVideoBlockId,
      shot,
    }
  })
}

function panelKey(panel: {
  readonly panelIndex: number
  readonly sourceShotNumber: number
  readonly sourceVideoBlockId: string
}): string {
  return `${panel.panelIndex}:${panel.sourceShotNumber}:${panel.sourceVideoBlockId}`
}

function validatePanels(snapshot: ConsistencyLabSourceSnapshot, panels: readonly z.infer<typeof generatedPanelSchema>[]): ConsistencyLabPanelDraft[] {
  const contract = panelContract(snapshot)
  const requiredKeys = new Set(contract.map(panelKey))
  const seen = new Set<string>()
  for (const panel of panels) {
    const key = panelKey(panel)
    if (!requiredKeys.has(key)) throw new Error(`CONSISTENCY_LAB_LLM_PANEL_UNEXPECTED:${key}`)
    if (seen.has(key)) throw new Error(`CONSISTENCY_LAB_LLM_PANEL_DUPLICATE:${key}`)
    seen.add(key)
  }
  for (const required of requiredKeys) {
    if (!seen.has(required)) throw new Error(`CONSISTENCY_LAB_LLM_PANEL_MISSING:${required}`)
  }
  return panels
    .slice()
    .sort((left, right) => left.panelIndex - right.panelIndex)
    .map((panel) => ({
      panelIndex: panel.panelIndex,
      sourceShotNumber: panel.sourceShotNumber,
      sourceVideoBlockId: panel.sourceVideoBlockId,
      prompt: panel.prompt.trim(),
      metadata: {
        source: 'llm',
      },
    }))
}

async function runTextJsonStep(input: GenerationContext & {
  readonly promptId: typeof AI_PROMPT_IDS[keyof typeof AI_PROMPT_IDS]
  readonly variables: Record<string, string>
  readonly stepTitle: string
  readonly stepIndex: number
  readonly stepTotal: number
}): Promise<Record<string, unknown>> {
  const finalPrompt = buildAiPrompt({
    promptId: input.promptId,
    locale: input.locale,
    variables: input.variables,
  })
  const completion = await executeAiTextStep({
    userId: input.userId,
    model: input.model,
    messages: [{ role: 'user', content: finalPrompt }],
    temperature: 0.35,
    projectId: input.projectId,
    action: input.promptId,
    meta: {
      stepId: input.promptId,
      stepTitle: input.stepTitle,
      stepIndex: input.stepIndex,
      stepTotal: input.stepTotal,
    },
  })
  if (!completion.text.trim()) throw new Error(`CONSISTENCY_LAB_LLM_EMPTY:${input.promptId}`)
  return safeParseJsonObject(completion.text)
}

async function runVisionJsonStep(input: GenerationContext & {
  readonly promptId: typeof AI_PROMPT_IDS[keyof typeof AI_PROMPT_IDS]
  readonly variables: Record<string, string>
  readonly imageUrls: readonly string[]
  readonly stepTitle: string
  readonly stepIndex: number
  readonly stepTotal: number
}): Promise<Record<string, unknown>> {
  const finalPrompt = buildAiPrompt({
    promptId: input.promptId,
    locale: input.locale,
    variables: input.variables,
  })
  const completion = await executeAiVisionStep({
    userId: input.userId,
    model: input.model,
    prompt: finalPrompt,
    imageUrls: [...input.imageUrls],
    temperature: 0.2,
    projectId: input.projectId,
    action: input.promptId,
    meta: {
      stepId: input.promptId,
      stepTitle: input.stepTitle,
      stepIndex: input.stepIndex,
      stepTotal: input.stepTotal,
    },
  })
  if (!completion.text.trim()) throw new Error(`CONSISTENCY_LAB_VISION_EMPTY:${input.promptId}`)
  return safeParseJsonObject(completion.text)
}

export async function generateStructuredTextPlan(input: GenerationContext & {
  readonly snapshot: ConsistencyLabSourceSnapshot
}): Promise<{
  readonly strategyOutput: ConsistencyLabStrategyOutput
  readonly panels: readonly ConsistencyLabPanelDraft[]
}> {
  const raw = await runTextJsonStep({
    ...input,
    promptId: AI_PROMPT_IDS.CONSISTENCY_LAB_STRUCTURED_TEXT_PLAN,
    variables: {
      source_snapshot_json: stringifyForPrompt(input.snapshot),
      block_classification_draft_json: stringifyForPrompt(classifyConsistencyBlocks(input.snapshot)),
      panel_contract_json: stringifyForPrompt(panelContract(input.snapshot)),
    },
    stepTitle: 'Generate structured staging plan',
    stepIndex: 1,
    stepTotal: 1,
  })
  const parsed = structuredTextPlanSchema.parse(raw)
  return {
    strategyOutput: parsed.strategyOutput as unknown as ConsistencyLabStrategyOutput,
    panels: validatePanels(input.snapshot, parsed.panels).map((panel) => ({
      ...panel,
      metadata: {
        ...panel.metadata,
        strategy: 'structured_text',
      },
    })),
  }
}

export async function generateGridFloorPlan(input: GenerationContext & {
  readonly snapshot: ConsistencyLabSourceSnapshot
}): Promise<GridFloorPlanModelOutput> {
  const density = resolveGridDensity(input.snapshot.project.videoRatio)
  const raw = await runTextJsonStep({
    ...input,
    promptId: AI_PROMPT_IDS.CONSISTENCY_LAB_GRID_FLOOR_PLAN,
    variables: {
      source_snapshot_json: stringifyForPrompt(input.snapshot),
      block_classification_draft_json: stringifyForPrompt(classifyConsistencyBlocks(input.snapshot)),
      grid_density_json: stringifyForPrompt(density),
    },
    stepTitle: 'Generate grid floor plan prompts',
    stepIndex: 1,
    stepTotal: 1,
  })
  const parsed = gridFloorPlanSchema.parse(raw)
  if (
    parsed.strategyOutput.grid.columns !== density.columns
    || parsed.strategyOutput.grid.rows !== density.rows
    || parsed.strategyOutput.grid.ratio !== density.ratio
  ) {
    throw new Error('CONSISTENCY_LAB_GRID_DENSITY_MISMATCH')
  }
  return parsed.strategyOutput
}

export async function analyzeGridCoordinates(input: GenerationContext & {
  readonly snapshot: ConsistencyLabSourceSnapshot
  readonly floorPlanArtifacts: readonly Record<string, unknown>[]
  readonly overlayImageUrls: readonly string[]
}): Promise<{
  readonly strategyOutput: ConsistencyLabStrategyOutput
  readonly panels: readonly ConsistencyLabPanelDraft[]
}> {
  if (input.overlayImageUrls.length === 0) throw new Error('CONSISTENCY_LAB_GRID_OVERLAY_IMAGE_REQUIRED')
  const raw = await runVisionJsonStep({
    ...input,
    promptId: AI_PROMPT_IDS.CONSISTENCY_LAB_GRID_COORDINATE_VISION,
    imageUrls: input.overlayImageUrls,
    variables: {
      source_snapshot_json: stringifyForPrompt(input.snapshot),
      floor_plan_artifacts_json: stringifyForPrompt(input.floorPlanArtifacts),
      panel_contract_json: stringifyForPrompt(panelContract(input.snapshot)),
    },
    stepTitle: 'Analyze grid coordinate overlays',
    stepIndex: 1,
    stepTotal: 1,
  })
  const parsed = gridCoordinateAnalysisSchema.parse(raw)
  return {
    strategyOutput: parsed.strategyOutput as unknown as ConsistencyLabStrategyOutput,
    panels: validatePanels(input.snapshot, parsed.panels).map((panel) => ({
      ...panel,
      metadata: {
        ...panel.metadata,
        strategy: 'grid_coordinates',
      },
    })),
  }
}

export async function generateContactSheetPlan(input: GenerationContext & {
  readonly snapshot: ConsistencyLabSourceSnapshot
}): Promise<{
  readonly strategyOutput: ContactSheetPlanModelOutput
  readonly panels: readonly ConsistencyLabPanelDraft[]
}> {
  const raw = await runTextJsonStep({
    ...input,
    promptId: AI_PROMPT_IDS.CONSISTENCY_LAB_CONTACT_SHEET_PLAN,
    variables: {
      source_snapshot_json: stringifyForPrompt(input.snapshot),
      contact_sheet_group_draft_json: stringifyForPrompt(buildContactSheet9GridStrategyOutput(input.snapshot)),
      panel_contract_json: stringifyForPrompt(panelContract(input.snapshot)),
    },
    stepTitle: 'Generate contact sheet plan',
    stepIndex: 1,
    stepTotal: 1,
  })
  const parsed = contactSheetPlanSchema.parse(raw)
  const panels = validatePanels(input.snapshot, parsed.panels).map((panel) => {
    const group = parsed.strategyOutput.groups.find((item) => (
      item.sourceVideoBlockId === panel.sourceVideoBlockId
      && item.shotNumbers.includes(panel.sourceShotNumber)
    ))
    if (!group) throw new Error(`CONSISTENCY_LAB_CONTACT_SHEET_GROUP_MISSING:${panel.sourceShotNumber}`)
    const cell = group.cells.find((item) => item.shotNumber === panel.sourceShotNumber)
    if (!cell) throw new Error(`CONSISTENCY_LAB_CONTACT_SHEET_CELL_MISSING:${panel.sourceShotNumber}`)
    return {
      ...panel,
      metadata: {
        ...panel.metadata,
        strategy: 'contact_sheet_9grid' satisfies ConsistencyLabStrategy,
        contactSheet: {
          group: {
            sourceVideoBlockId: group.sourceVideoBlockId,
            groupIndex: group.groupIndex,
            shotNumbers: group.shotNumbers,
            cells: group.cells.map((groupCell) => ({
              shotNumber: groupCell.shotNumber,
              cellIndex: groupCell.cellIndex,
              row: groupCell.row,
              column: groupCell.column,
            })),
          },
          cell: {
            shotNumber: cell.shotNumber,
            cellIndex: cell.cellIndex,
            row: cell.row,
            column: cell.column,
          },
        },
      },
    }
  })
  return {
    strategyOutput: parsed.strategyOutput,
    panels,
  }
}
