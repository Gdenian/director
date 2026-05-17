import { AI_PROMPT_IDS, buildAiPrompt } from '@/lib/ai-prompts'
import type { Locale } from '@/i18n/routing'
import type {
  ConsistencyLabPanelDraft,
  ConsistencyLabSourceSnapshot,
  ConsistencyLabStrategy,
  ConsistencyLabStrategyOutput,
  ContactSheet9GridStrategyOutput,
} from './types'

function stringifyForPrompt(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function findShot(snapshot: ConsistencyLabSourceSnapshot, shotNumber: number) {
  const shot = snapshot.shots.find((item) => item.shotNumber === shotNumber)
  if (!shot) throw new Error(`CONSISTENCY_LAB_SHOT_MISSING:${shotNumber}`)
  return shot
}

function findBlock(snapshot: ConsistencyLabSourceSnapshot, sourceVideoBlockId: string) {
  const block = snapshot.videoBlocks.find((item) => item.sourceVideoBlockId === sourceVideoBlockId)
  if (!block) throw new Error(`CONSISTENCY_LAB_VIDEO_BLOCK_MISSING:${sourceVideoBlockId}`)
  return block
}

function characterAssetsForShot(snapshot: ConsistencyLabSourceSnapshot, shotNumber: number) {
  const block = snapshot.videoBlocks.find((item) => item.shotNumbers.includes(shotNumber))
  const relatedShotNumbers = block?.shotNumbers ?? [shotNumber]
  return snapshot.assets
    .filter((asset) => asset.kind === 'character' && asset.shotNumbers.some((item) => relatedShotNumbers.includes(item)))
    .map((asset) => ({
      requirementId: asset.requirementId,
      name: asset.name,
      description: asset.description,
      targetId: asset.targetId,
      previewImageUrl: asset.previewImageUrl,
      directlyInShot: asset.shotNumbers.includes(shotNumber),
    }))
}

function locationAssetsForShot(snapshot: ConsistencyLabSourceSnapshot, shotNumber: number) {
  const block = snapshot.videoBlocks.find((item) => item.shotNumbers.includes(shotNumber))
  const relatedShotNumbers = block?.shotNumbers ?? [shotNumber]
  return snapshot.assets
    .filter((asset) => asset.kind === 'location' && asset.shotNumbers.some((item) => relatedShotNumbers.includes(item)))
    .map((asset) => ({
      requirementId: asset.requirementId,
      name: asset.name,
      description: asset.description,
      targetId: asset.targetId,
      previewImageUrl: asset.previewImageUrl,
      directlyInShot: asset.shotNumbers.includes(shotNumber),
    }))
}

function promptIdForStrategy(strategy: ConsistencyLabStrategy) {
  if (strategy === 'structured_text') return AI_PROMPT_IDS.CONSISTENCY_LAB_STRUCTURED_TEXT_PANEL
  if (strategy === 'grid_coordinates') return AI_PROMPT_IDS.CONSISTENCY_LAB_GRID_COORDINATES_PANEL
  return AI_PROMPT_IDS.CONSISTENCY_LAB_CONTACT_SHEET_9GRID_PANEL
}

function contactSheetGroupForShot(output: ContactSheet9GridStrategyOutput, sourceVideoBlockId: string, shotNumber: number) {
  const group = output.groups.find((item) => (
    item.sourceVideoBlockId === sourceVideoBlockId && item.shotNumbers.includes(shotNumber)
  ))
  if (!group) throw new Error(`CONSISTENCY_LAB_CONTACT_SHEET_GROUP_MISSING:${shotNumber}`)
  const cell = group.cells.find((item) => item.shotNumber === shotNumber)
  if (!cell) throw new Error(`CONSISTENCY_LAB_CONTACT_SHEET_CELL_MISSING:${shotNumber}`)
  return { group, cell }
}

export function buildConsistencyLabPanelDrafts(input: {
  readonly snapshot: ConsistencyLabSourceSnapshot
  readonly strategy: ConsistencyLabStrategy
  readonly strategyOutput: ConsistencyLabStrategyOutput
  readonly locale: Locale
}): ConsistencyLabPanelDraft[] {
  return input.snapshot.shots.map((shot, panelIndex) => {
    const block = input.snapshot.videoBlocks.find((item) => item.shotNumbers.includes(shot.shotNumber))
    if (!block) throw new Error(`CONSISTENCY_LAB_VIDEO_BLOCK_FOR_SHOT_MISSING:${shot.shotNumber}`)
    const baseVariables = {
      shot_json: stringifyForPrompt(shot),
      video_block_json: stringifyForPrompt(block),
      character_assets_json: stringifyForPrompt(characterAssetsForShot(input.snapshot, shot.shotNumber)),
      location_assets_json: stringifyForPrompt(locationAssetsForShot(input.snapshot, shot.shotNumber)),
      strategy_output_json: stringifyForPrompt(input.strategyOutput),
    }
    if (input.strategy === 'contact_sheet_9grid') {
      if (input.strategyOutput.strategy !== 'contact_sheet_9grid') {
        throw new Error('CONSISTENCY_LAB_CONTACT_SHEET_OUTPUT_REQUIRED')
      }
      const contactSheet = contactSheetGroupForShot(
        input.strategyOutput,
        block.sourceVideoBlockId,
        shot.shotNumber,
      )
      return {
        panelIndex,
        sourceShotNumber: shot.shotNumber,
        sourceVideoBlockId: block.sourceVideoBlockId,
        prompt: buildAiPrompt({
          promptId: promptIdForStrategy(input.strategy),
          locale: input.locale,
          variables: {
            ...baseVariables,
            contact_sheet_group_json: stringifyForPrompt(contactSheet),
          },
        }),
        metadata: {
          strategy: input.strategy,
          contactSheet,
        },
      }
    }
    return {
      panelIndex,
      sourceShotNumber: shot.shotNumber,
      sourceVideoBlockId: block.sourceVideoBlockId,
      prompt: buildAiPrompt({
        promptId: promptIdForStrategy(input.strategy),
        locale: input.locale,
        variables: baseVariables,
      }),
      metadata: {
        strategy: input.strategy,
        sourceVideoBlockId: block.sourceVideoBlockId,
      },
    }
  })
}

export function sourceShotForPanel(snapshot: ConsistencyLabSourceSnapshot, sourceShotNumber: number) {
  return findShot(snapshot, sourceShotNumber)
}

export function sourceBlockForPanel(snapshot: ConsistencyLabSourceSnapshot, sourceVideoBlockId: string) {
  return findBlock(snapshot, sourceVideoBlockId)
}
