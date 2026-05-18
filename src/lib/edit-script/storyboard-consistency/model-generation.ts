import { AI_PROMPT_IDS, buildAiPrompt } from '@/lib/ai-prompts'
import { executeAiTextStep, executeAiVisionStep } from '@/lib/ai-exec/engine'
import { safeParseJsonObject } from '@/lib/json-repair'
import type { Locale } from '@/i18n/routing'
import {
  generatedPanelPromptSchema,
  gridCoordinateAnalysisModelOutputSchema,
  gridFloorPlanModelOutputSchema,
  type GridFloorPlanModelOutput,
  type StoryboardConsistencySourceSnapshot,
  type StoryboardPanelPromptDraft,
} from './types'
import { classifyStoryboardConsistencyBlocks, resolveGridDensity } from './strategies'

interface GenerationContext {
  readonly userId: string
  readonly projectId: string
  readonly model: string
  readonly locale: Locale
}

function stringifyForPrompt(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function panelContract(snapshot: StoryboardConsistencySourceSnapshot) {
  return snapshot.shots.map((shot, panelIndex) => {
    const block = snapshot.videoBlocks.find((item) => item.shotNumbers.includes(shot.shotNumber))
    if (!block) throw new Error(`EDIT_SCRIPT_STORYBOARD_PANEL_CONTRACT_BLOCK_MISSING:${shot.shotNumber}`)
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

function validatePanels(
  snapshot: StoryboardConsistencySourceSnapshot,
  panels: readonly typeof generatedPanelPromptSchema._output[],
): StoryboardPanelPromptDraft[] {
  const contract = panelContract(snapshot)
  const requiredKeys = new Set(contract.map(panelKey))
  const seen = new Set<string>()
  for (const panel of panels) {
    const key = panelKey(panel)
    if (!requiredKeys.has(key)) throw new Error(`EDIT_SCRIPT_STORYBOARD_LLM_PANEL_UNEXPECTED:${key}`)
    if (seen.has(key)) throw new Error(`EDIT_SCRIPT_STORYBOARD_LLM_PANEL_DUPLICATE:${key}`)
    seen.add(key)
  }
  for (const required of requiredKeys) {
    if (!seen.has(required)) throw new Error(`EDIT_SCRIPT_STORYBOARD_LLM_PANEL_MISSING:${required}`)
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
        source: 'grid_coordinates',
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
  if (!completion.text.trim()) throw new Error(`EDIT_SCRIPT_STORYBOARD_LLM_EMPTY:${input.promptId}`)
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
  if (!completion.text.trim()) throw new Error(`EDIT_SCRIPT_STORYBOARD_VISION_EMPTY:${input.promptId}`)
  return safeParseJsonObject(completion.text)
}

export async function generateGridFloorPlan(input: GenerationContext & {
  readonly snapshot: StoryboardConsistencySourceSnapshot
}): Promise<GridFloorPlanModelOutput> {
  const density = resolveGridDensity(input.snapshot.project.videoRatio)
  const raw = await runTextJsonStep({
    ...input,
    promptId: AI_PROMPT_IDS.EDIT_SCRIPT_STORYBOARD_GRID_FLOOR_PLAN,
    variables: {
      source_snapshot_json: stringifyForPrompt(input.snapshot),
      block_classification_draft_json: stringifyForPrompt(classifyStoryboardConsistencyBlocks(input.snapshot)),
      grid_density_json: stringifyForPrompt(density),
    },
    stepTitle: 'Generate edit-script storyboard grid floor plan prompts',
    stepIndex: 1,
    stepTotal: 1,
  })
  const parsed = gridFloorPlanModelOutputSchema.parse(readStrategyOutput(raw))
  if (
    parsed.grid.columns !== density.columns
    || parsed.grid.rows !== density.rows
    || parsed.grid.ratio !== density.ratio
  ) {
    throw new Error('EDIT_SCRIPT_STORYBOARD_GRID_DENSITY_MISMATCH')
  }
  return parsed
}

function readStrategyOutput(raw: Record<string, unknown>): unknown {
  const output = raw.strategyOutput
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    throw new Error('EDIT_SCRIPT_STORYBOARD_STRATEGY_OUTPUT_MISSING')
  }
  return output
}

export async function analyzeGridCoordinates(input: GenerationContext & {
  readonly snapshot: StoryboardConsistencySourceSnapshot
  readonly floorPlanArtifacts: readonly Record<string, unknown>[]
  readonly overlayImageUrls: readonly string[]
}): Promise<{
  readonly strategyOutput: unknown
  readonly panels: readonly StoryboardPanelPromptDraft[]
}> {
  if (input.overlayImageUrls.length === 0) throw new Error('EDIT_SCRIPT_STORYBOARD_GRID_OVERLAY_IMAGE_REQUIRED')
  const raw = await runVisionJsonStep({
    ...input,
    promptId: AI_PROMPT_IDS.EDIT_SCRIPT_STORYBOARD_GRID_VISION,
    imageUrls: input.overlayImageUrls,
    variables: {
      source_snapshot_json: stringifyForPrompt(input.snapshot),
      floor_plan_artifacts_json: stringifyForPrompt(input.floorPlanArtifacts),
      panel_contract_json: stringifyForPrompt(panelContract(input.snapshot)),
    },
    stepTitle: 'Analyze edit-script storyboard coordinate overlays',
    stepIndex: 1,
    stepTotal: 1,
  })
  const parsed = gridCoordinateAnalysisModelOutputSchema.parse(raw)
  return {
    strategyOutput: parsed.strategyOutput,
    panels: validatePanels(input.snapshot, parsed.panels).map((panel) => ({
      ...panel,
      metadata: {
        ...panel.metadata,
        strategy: 'grid_coordinates',
      },
    })),
  }
}
