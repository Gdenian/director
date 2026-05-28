import type { Job } from 'bullmq'
import { getUserModelConfig } from '@/lib/config-service'
import { aiDesign } from '@/lib/asset-utils'
import { executeAiVisionStep } from '@/lib/ai-runtime'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

function resolveUserInstruction(payload: Record<string, unknown>) {
  const value = payload.userInstruction
  return typeof value === 'string' ? value.trim() : ''
}

type StylePromptGenerationResult = {
  promptZh: string
  promptEn: string
}

function resolveReferenceImageUrl(payload: Record<string, unknown>): string {
  const value = payload.referenceImageUrl
  return typeof value === 'string' ? value.trim() : ''
}

function parseStylePromptGenerationResult(rawText: string): StylePromptGenerationResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error('Style prompt JSON could not be parsed')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Style prompt JSON must include promptZh and promptEn')
  }

  const record = parsed as { promptZh?: unknown; promptEn?: unknown }
  const promptZh = typeof record.promptZh === 'string' ? record.promptZh.trim() : ''
  const promptEn = typeof record.promptEn === 'string' ? record.promptEn.trim() : ''
  if (!promptZh || !promptEn) {
    throw new Error('Style prompt JSON must include promptZh and promptEn')
  }

  return { promptZh, promptEn }
}

export async function handleAssetHubAIDesignTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const assetType =
    job.data.type === TASK_TYPE.ASSET_HUB_AI_DESIGN_CHARACTER
      || job.data.type === TASK_TYPE.AI_CREATE_CHARACTER
      ? 'character'
      : job.data.type === TASK_TYPE.ASSET_HUB_AI_DESIGN_LOCATION
        || job.data.type === TASK_TYPE.AI_CREATE_LOCATION
        ? 'location'
        : job.data.type === TASK_TYPE.ASSET_HUB_AI_DESIGN_STYLE
          ? 'style'
          : null
  if (!assetType) {
    throw new Error(`Unsupported asset hub ai design task type: ${job.data.type}`)
  }

  const userConfig = await getUserModelConfig(job.data.userId)
  const analysisModelFromPayload =
    typeof payload.analysisModel === 'string' && payload.analysisModel.trim()
      ? payload.analysisModel.trim()
      : null
  const analysisModel = analysisModelFromPayload || userConfig.analysisModel || ''
  if (!analysisModel) {
    throw new Error('ANALYSIS_MODEL_NOT_CONFIGURED: 请先在设置页面配置分析模型')
  }

  if (assetType === 'style') {
    const referenceImageUrl = resolveReferenceImageUrl(payload)
    if (!referenceImageUrl) {
      throw new Error('referenceImageUrl is required')
    }

    await reportTaskProgress(job, 25, {
      stage: 'asset_hub_style_prompt_prepare',
      stageLabel: '准备风格参考图分析参数',
      displayMode: 'detail',
    })
    await assertTaskActive(job, 'asset_hub_style_prompt_prepare')

    const prompt = buildPrompt({
      promptId: PROMPT_IDS.ASSET_HUB_STYLE_PROMPT_GENERATE,
      locale: job.data.locale,
    })
    const completion = await executeAiVisionStep({
      userId: job.data.userId,
      model: analysisModel,
      prompt,
      imageUrls: [referenceImageUrl],
      temperature: 0.2,
      projectId: job.data.projectId || 'global-asset-hub',
      action: 'asset_hub_style_prompt_generate',
    })

    const result = parseStylePromptGenerationResult(completion.text)

    await reportTaskProgress(job, 96, {
      stage: 'asset_hub_style_prompt_done',
      stageLabel: '风格提示词生成完成',
      displayMode: 'detail',
    })

    return result
  }

  const userInstruction = resolveUserInstruction(payload)
  if (!userInstruction) {
    throw new Error('userInstruction is required')
  }

  await reportTaskProgress(job, 25, {
    stage: 'asset_hub_ai_design_prepare',
    stageLabel: '准备资产设计参数',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'asset_hub_ai_design_prepare')

  const result = await aiDesign({
    userId: job.data.userId,
    locale: job.data.locale,
    analysisModel,
    userInstruction,
    assetType,
    projectId: job.data.projectId || 'asset-hub',
    skipBilling: true,
  })

  if (!result.success || !result.prompt) {
    throw new Error(result.error || 'Generation failed')
  }

  await reportTaskProgress(job, 96, {
    stage: 'asset_hub_ai_design_done',
    stageLabel: '资产设计结果已生成',
    displayMode: 'detail',
  })

  return {
    prompt: result.prompt,
    availableSlots: result.availableSlots ?? [],
  }
}
