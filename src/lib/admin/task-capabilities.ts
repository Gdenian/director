import { TASK_TYPE, type TaskType } from '@/lib/task/types'
import type { FeatureFlagKey, OperationCapability } from './policy-types'

const TEXT_TASKS = new Set<TaskType>([
  TASK_TYPE.REGENERATE_STORYBOARD_TEXT,
  TASK_TYPE.INSERT_PANEL,
  TASK_TYPE.ANALYZE_NOVEL,
  TASK_TYPE.STORY_TO_SCRIPT_RUN,
  TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
  TASK_TYPE.SCREENPLAY_CONVERT,
  TASK_TYPE.VOICE_ANALYZE,
  TASK_TYPE.ANALYZE_GLOBAL,
  TASK_TYPE.AI_STORY_EXPAND,
  TASK_TYPE.AI_MODIFY_APPEARANCE,
  TASK_TYPE.AI_MODIFY_LOCATION,
  TASK_TYPE.AI_MODIFY_PROP,
  TASK_TYPE.AI_MODIFY_SHOT_PROMPT,
  TASK_TYPE.ANALYZE_SHOT_VARIANTS,
  TASK_TYPE.AI_CREATE_CHARACTER,
  TASK_TYPE.AI_CREATE_LOCATION,
  TASK_TYPE.REFERENCE_TO_CHARACTER,
  TASK_TYPE.CHARACTER_PROFILE_CONFIRM,
  TASK_TYPE.CHARACTER_PROFILE_BATCH_CONFIRM,
  TASK_TYPE.EPISODE_SPLIT_LLM,
  TASK_TYPE.ASSET_HUB_AI_DESIGN_CHARACTER,
  TASK_TYPE.ASSET_HUB_AI_DESIGN_LOCATION,
  TASK_TYPE.ASSET_HUB_AI_DESIGN_STYLE,
  TASK_TYPE.ASSET_HUB_AI_MODIFY_CHARACTER,
  TASK_TYPE.ASSET_HUB_AI_MODIFY_LOCATION,
  TASK_TYPE.ASSET_HUB_AI_MODIFY_PROP,
  TASK_TYPE.ASSET_HUB_REFERENCE_TO_CHARACTER,
  TASK_TYPE.AI_EDIT_ASSEMBLE,
  TASK_TYPE.AI_EDIT_REFINE,
  TASK_TYPE.CLIPS_BUILD,
])

const IMAGE_TASKS = new Set<TaskType>([
  TASK_TYPE.IMAGE_PANEL,
  TASK_TYPE.IMAGE_CHARACTER,
  TASK_TYPE.IMAGE_LOCATION,
  TASK_TYPE.MODIFY_ASSET_IMAGE,
  TASK_TYPE.REGENERATE_GROUP,
  TASK_TYPE.ASSET_HUB_IMAGE,
  TASK_TYPE.ASSET_HUB_MODIFY,
  TASK_TYPE.PANEL_VARIANT,
])

const VIDEO_TASKS = new Set<TaskType>([
  TASK_TYPE.VIDEO_PANEL,
  TASK_TYPE.AI_EDIT_TRANSITION_BRIDGE,
])

const VOICE_TASKS = new Set<TaskType>([
  TASK_TYPE.VOICE_LINE,
  TASK_TYPE.VOICE_DESIGN,
  TASK_TYPE.ASSET_HUB_VOICE_DESIGN,
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function getTaskOperationCapability(type: TaskType): OperationCapability {
  if (TEXT_TASKS.has(type)) return 'text'
  if (IMAGE_TASKS.has(type)) return 'image'
  if (VIDEO_TASKS.has(type)) return 'video'
  if (VOICE_TASKS.has(type)) return 'voice'
  if (type === TASK_TYPE.LIP_SYNC) return 'lip_sync'
  return 'text'
}

export function getFeatureFlagForCapability(capability: OperationCapability): FeatureFlagKey {
  if (capability === 'text') return 'text_generation'
  if (capability === 'image') return 'image_generation'
  if (capability === 'video') return 'video_generation'
  if (capability === 'voice') return 'voice_generation'
  if (capability === 'lip_sync') return 'lip_sync'
  if (capability === 'payment') return 'payment'
  if (capability === 'redeem_code') return 'redeem_code'
  if (capability === 'create_work') return 'create_work'
  return 'advanced_models'
}

export function extractTaskModelKeys(payload: unknown): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  const keys = ['model', 'modelId', 'modelKey', 'analysisModel', 'imageModel', 'videoModel', 'audioModel', 'voiceModel', 'lipSyncModel', 'flModel']

  function push(value: unknown) {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    result.push(trimmed)
  }

  function visit(value: unknown, depth: number) {
    if (depth > 2 || !isRecord(value)) return
    for (const key of keys) push(value[key])
    if (isRecord(value.meta)) visit(value.meta, depth + 1)
    if (isRecord(value.firstLastFrame)) visit(value.firstLastFrame, depth + 1)
  }

  visit(payload, 0)
  return result
}
