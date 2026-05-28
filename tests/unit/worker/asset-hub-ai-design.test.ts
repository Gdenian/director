import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const configMock = vi.hoisted(() => ({
  getUserModelConfig: vi.fn(),
}))

const assetUtilsMock = vi.hoisted(() => ({
  aiDesign: vi.fn(),
}))

const aiRuntimeMock = vi.hoisted(() => ({
  executeAiVisionStep: vi.fn(),
}))

const promptI18nMock = vi.hoisted(() => ({
  PROMPT_IDS: {
    ASSET_HUB_STYLE_PROMPT_GENERATE: 'asset_hub_style_prompt_generate',
  },
  buildPrompt: vi.fn(() => 'style prompt template'),
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  assertTaskActive: vi.fn(async () => undefined),
}))

vi.mock('@/lib/config-service', () => configMock)
vi.mock('@/lib/asset-utils', () => assetUtilsMock)
vi.mock('@/lib/ai-runtime', () => aiRuntimeMock)
vi.mock('@/lib/prompt-i18n', () => promptI18nMock)
vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: workerMock.reportTaskProgress,
}))
vi.mock('@/lib/workers/utils', () => ({
  assertTaskActive: workerMock.assertTaskActive,
}))

import { handleAssetHubAIDesignTask } from '@/lib/workers/handlers/asset-hub-ai-design'

function buildJob(type: TaskJobData['type'], payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-asset-ai-design-1',
      type,
      locale: 'zh',
      projectId: 'global-asset-hub',
      episodeId: null,
      targetType: 'GlobalCharacter',
      targetId: 'target-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker asset-hub-ai-design behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configMock.getUserModelConfig.mockResolvedValue({ analysisModel: 'llm::analysis-default' })
    assetUtilsMock.aiDesign.mockResolvedValue({
      success: true,
      prompt: 'generated prompt',
    })
    aiRuntimeMock.executeAiVisionStep.mockResolvedValue({
      text: JSON.stringify({
        promptZh: '电影级胶片质感，柔和自然光，低饱和暖色调，细腻颗粒，浅景深，稳定构图，写实而克制的整体视觉风格。',
        promptEn: 'Cinematic film texture, soft natural light, low-saturation warm grading, fine grain, shallow depth of field, stable composition, realistic and restrained visual style.',
      }),
    })
    promptI18nMock.buildPrompt.mockReturnValue('style prompt template')
  })

  it('missing userInstruction -> explicit error', async () => {
    const job = buildJob(TASK_TYPE.ASSET_HUB_AI_DESIGN_CHARACTER, {})
    await expect(handleAssetHubAIDesignTask(job)).rejects.toThrow('userInstruction is required')
  })

  it('unsupported task type -> explicit error', async () => {
    const job = buildJob(TASK_TYPE.IMAGE_CHARACTER, { userInstruction: 'design a hero' })
    await expect(handleAssetHubAIDesignTask(job)).rejects.toThrow('Unsupported asset hub ai design task type')
  })

  it('success uses payload analysisModel override and character assetType', async () => {
    const job = buildJob(TASK_TYPE.ASSET_HUB_AI_DESIGN_CHARACTER, {
      userInstruction: '  design a heroic character  ',
      analysisModel: '  llm::analysis-override  ',
    })

    const result = await handleAssetHubAIDesignTask(job)

    expect(assetUtilsMock.aiDesign).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      analysisModel: 'llm::analysis-override',
      userInstruction: 'design a heroic character',
      assetType: 'character',
      projectId: 'global-asset-hub',
      skipBilling: true,
    }))
    expect(result).toEqual({
      prompt: 'generated prompt',
      availableSlots: [],
    })
  })

  it('location type success -> passes location assetType', async () => {
    const job = buildJob(TASK_TYPE.ASSET_HUB_AI_DESIGN_LOCATION, {
      userInstruction: 'design a rainy alley',
    })

    await handleAssetHubAIDesignTask(job)

    expect(assetUtilsMock.aiDesign).toHaveBeenCalledWith(expect.objectContaining({
      assetType: 'location',
      analysisModel: 'llm::analysis-default',
    }))
  })

  it('style type success -> analyzes reference image with vision model and returns prompts', async () => {
    const job = buildJob(TASK_TYPE.ASSET_HUB_AI_DESIGN_STYLE, {
      referenceImageUrl: '  https://example.com/style-ref.jpg  ',
      analysisModel: '  llm::analysis-override  ',
    })

    const result = await handleAssetHubAIDesignTask(job)

    expect(promptI18nMock.buildPrompt).toHaveBeenCalledWith({
      promptId: promptI18nMock.PROMPT_IDS.ASSET_HUB_STYLE_PROMPT_GENERATE,
      locale: 'zh',
    })
    expect(aiRuntimeMock.executeAiVisionStep).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      model: 'llm::analysis-override',
      prompt: 'style prompt template',
      imageUrls: ['https://example.com/style-ref.jpg'],
      temperature: 0.2,
      projectId: 'global-asset-hub',
    }))
    expect(assetUtilsMock.aiDesign).not.toHaveBeenCalled()
    expect(result).toEqual({
      promptZh: '电影级胶片质感，柔和自然光，低饱和暖色调，细腻颗粒，浅景深，稳定构图，写实而克制的整体视觉风格。',
      promptEn: 'Cinematic film texture, soft natural light, low-saturation warm grading, fine grain, shallow depth of field, stable composition, realistic and restrained visual style.',
    })
  })

  it('style type missing referenceImageUrl -> explicit error', async () => {
    const job = buildJob(TASK_TYPE.ASSET_HUB_AI_DESIGN_STYLE, {
      referenceImageUrl: '   ',
    })

    await expect(handleAssetHubAIDesignTask(job)).rejects.toThrow('referenceImageUrl is required')
    expect(aiRuntimeMock.executeAiVisionStep).not.toHaveBeenCalled()
  })

  it('style type non-json model output -> explicit error', async () => {
    aiRuntimeMock.executeAiVisionStep.mockResolvedValueOnce({
      text: 'not json',
    })
    const job = buildJob(TASK_TYPE.ASSET_HUB_AI_DESIGN_STYLE, {
      referenceImageUrl: 'https://example.com/style-ref.jpg',
    })

    await expect(handleAssetHubAIDesignTask(job)).rejects.toThrow('Style prompt JSON could not be parsed')
  })

  it('style type missing prompt fields -> explicit error', async () => {
    aiRuntimeMock.executeAiVisionStep.mockResolvedValueOnce({
      text: JSON.stringify({ promptZh: '只有中文' }),
    })
    const job = buildJob(TASK_TYPE.ASSET_HUB_AI_DESIGN_STYLE, {
      referenceImageUrl: 'https://example.com/style-ref.jpg',
    })

    await expect(handleAssetHubAIDesignTask(job)).rejects.toThrow('Style prompt JSON must include promptZh and promptEn')
  })
})
