import { NextRequest, NextResponse } from 'next/server'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { parseCreativeModels } from '@/lib/creative-engine/persisted-config'
import {
  findCreativeEngineUsageImpact,
  type CreativeEngineUsageImpactTarget,
} from '@/lib/creative-engine/usage-impact'
import type { DefaultModelField } from '@/lib/creative-engine/types'

type ImpactRequestBody = {
  target?: unknown
}

const USER_DEFAULT_SELECT = {
  customModels: true,
  analysisModel: true,
  characterModel: true,
  locationModel: true,
  storyboardModel: true,
  editModel: true,
  videoModel: true,
  audioModel: true,
  lipSyncModel: true,
  voiceDesignModel: true,
} as const

const PROJECT_SELECT = {
  id: true,
  name: true,
  novelPromotionData: {
    select: {
      analysisModel: true,
      characterModel: true,
      locationModel: true,
      storyboardModel: true,
      editModel: true,
      videoModel: true,
      audioModel: true,
    },
  },
} as const

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readTarget(value: unknown): CreativeEngineUsageImpactTarget {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CREATIVE_ENGINE_IMPACT_INVALID',
      field: 'target',
    })
  }
  if (value.type === 'engine' && typeof value.engineId === 'string' && value.engineId.trim()) {
    return { type: 'engine', engineId: value.engineId.trim() }
  }
  if (value.type === 'model' && typeof value.modelKey === 'string' && value.modelKey.trim()) {
    return { type: 'model', modelKey: value.modelKey.trim() }
  }
  throw new ApiError('INVALID_PARAMS', {
    code: 'CREATIVE_ENGINE_IMPACT_INVALID',
    field: 'target',
  })
}

function pickDefaultModels(source: Partial<Record<DefaultModelField, string | null>> | null | undefined) {
  const defaults: Partial<Record<DefaultModelField, string | null>> = {}
  if (!source) return defaults
  for (const field of DEFAULT_MODEL_FIELDS) {
    defaults[field] = source[field] ?? null
  }
  return defaults
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => null) as ImpactRequestBody | null
  if (!body) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CREATIVE_ENGINE_IMPACT_INVALID',
      field: 'body',
    })
  }

  const target = readTarget(body.target)
  const userId = authResult.session.user.id
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: USER_DEFAULT_SELECT,
  })
  const projects = await prisma.project.findMany({
    where: { userId },
    select: PROJECT_SELECT,
  })
  const models = parseCreativeModels(pref?.customModels).map((model) => ({
    modelKey: model.modelKey,
    engineId: model.engineId,
    name: model.name,
  }))

  const impact = findCreativeEngineUsageImpact({
    target,
    models,
    userDefaults: pickDefaultModels(pref),
    projects: projects.map((project) => ({
      projectId: project.id,
      title: project.name,
      ...pickDefaultModels(project.novelPromotionData),
    })),
  })

  return NextResponse.json(impact)
})
