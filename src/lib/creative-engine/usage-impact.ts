import type { DefaultModelField } from './types'

export type CreativeEngineUsageImpactTarget =
  | { type: 'engine'; engineId: string }
  | { type: 'model'; modelKey: string }

export interface CreativeEngineUsageImpactModel {
  modelKey: string
  engineId: string
  name: string
}

export interface CreativeEngineUsageImpactProject {
  projectId: string
  title?: string | null
  analysisModel?: string | null
  characterModel?: string | null
  locationModel?: string | null
  storyboardModel?: string | null
  editModel?: string | null
  videoModel?: string | null
  audioModel?: string | null
  lipSyncModel?: string | null
  voiceDesignModel?: string | null
}

export type CreativeEngineUsageImpactItem =
  | {
    scope: 'user-default'
    field: DefaultModelField
    label: string
    modelKey: string
    modelName: string
  }
  | {
    scope: 'project'
    projectId: string
    projectTitle?: string | null
    field: DefaultModelField
    label: string
    modelKey: string
    modelName: string
  }

export interface CreativeEngineUsageImpactResult {
  affectedCount: number
  items: CreativeEngineUsageImpactItem[]
}

const DEFAULT_MODEL_FIELDS: readonly DefaultModelField[] = [
  'analysisModel',
  'characterModel',
  'locationModel',
  'storyboardModel',
  'editModel',
  'videoModel',
  'audioModel',
  'lipSyncModel',
  'voiceDesignModel',
]

export const CREATIVE_ENGINE_FIELD_LABELS: Record<DefaultModelField, string> = {
  analysisModel: '文本分析模型',
  characterModel: '角色生成模型',
  locationModel: '场景生成模型',
  storyboardModel: '分镜生成模型',
  editModel: '图片编辑模型',
  videoModel: '视频生成模型',
  audioModel: '语音生成模型',
  lipSyncModel: '口型同步模型',
  voiceDesignModel: '音色设计模型',
}

function targetedModelKeys(
  target: CreativeEngineUsageImpactTarget,
  models: CreativeEngineUsageImpactModel[],
): Set<string> {
  if (target.type === 'model') return new Set([target.modelKey])
  return new Set(
    models
      .filter((model) => model.engineId === target.engineId)
      .map((model) => model.modelKey),
  )
}

function modelNameMap(models: CreativeEngineUsageImpactModel[]): Map<string, string> {
  return new Map(models.map((model) => [model.modelKey, model.name]))
}

function readSelectedModelKey(source: Partial<Record<DefaultModelField, string | null>>, field: DefaultModelField) {
  const value = source[field]
  return typeof value === 'string' && value.trim() ? value : null
}

export function findCreativeEngineUsageImpact(input: {
  target: CreativeEngineUsageImpactTarget
  models: CreativeEngineUsageImpactModel[]
  userDefaults: Partial<Record<DefaultModelField, string | null>>
  projects: CreativeEngineUsageImpactProject[]
}): CreativeEngineUsageImpactResult {
  const targetKeys = targetedModelKeys(input.target, input.models)
  if (targetKeys.size === 0) return { affectedCount: 0, items: [] }

  const names = modelNameMap(input.models)
  const items: CreativeEngineUsageImpactItem[] = []

  for (const field of DEFAULT_MODEL_FIELDS) {
    const modelKey = readSelectedModelKey(input.userDefaults, field)
    if (!modelKey || !targetKeys.has(modelKey)) continue
    items.push({
      scope: 'user-default',
      field,
      label: CREATIVE_ENGINE_FIELD_LABELS[field],
      modelKey,
      modelName: names.get(modelKey) || modelKey,
    })
  }

  for (const project of input.projects) {
    for (const field of DEFAULT_MODEL_FIELDS) {
      const modelKey = readSelectedModelKey(project, field)
      if (!modelKey || !targetKeys.has(modelKey)) continue
      items.push({
        scope: 'project',
        projectId: project.projectId,
        projectTitle: project.title,
        field,
        label: CREATIVE_ENGINE_FIELD_LABELS[field],
        modelKey,
        modelName: names.get(modelKey) || modelKey,
      })
    }
  }

  return {
    affectedCount: items.length,
    items,
  }
}
