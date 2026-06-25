import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OperationPolicyError } from '@/lib/admin/operation-errors'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const workerState = vi.hoisted(() => ({
  processors: new Map<string, (job: Job<TaskJobData>) => Promise<unknown>>(),
}))

const prismaMock = vi.hoisted(() => ({
  adminFeatureFlag: {
    findUnique: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  adminUserGroup: {
    findUnique: vi.fn(),
  },
  adminModelChannel: {
    findUnique: vi.fn(),
  },
  userPreference: {
    findUnique: vi.fn(),
  },
  task: {
    count: vi.fn(),
  },
}))

const taskServiceMock = vi.hoisted(() => ({
  createTask: vi.fn(),
  getTaskById: vi.fn(),
  markTaskEnqueueFailed: vi.fn(),
  markTaskEnqueued: vi.fn(),
  markTaskFailed: vi.fn(),
  rollbackTaskBillingForTask: vi.fn(),
  updateTaskBillingInfo: vi.fn(),
  updateTaskPayload: vi.fn(),
}))

const queueMock = vi.hoisted(() => ({
  addTaskJob: vi.fn(),
}))

const billingMock = vi.hoisted(() => ({
  buildDefaultTaskBillingInfo: vi.fn(() => null),
  getBillingMode: vi.fn(async () => 'ENFORCE'),
  InsufficientBalanceError: class InsufficientBalanceError extends Error {},
  isBillableTaskType: vi.fn(() => false),
  prepareTaskBilling: vi.fn(),
}))

const runRuntimeMock = vi.hoisted(() => ({
  attachTaskToRun: vi.fn(),
  createRun: vi.fn(),
  findReusableActiveRun: vi.fn(),
}))

const sharedMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  reportTaskStreamChunk: vi.fn(async () => undefined),
  withTaskLifecycle: vi.fn(async (job: Job<TaskJobData>, handler: (j: Job<TaskJobData>) => Promise<unknown>) => await handler(job)),
}))

const textHandlersMock = vi.hoisted(() => ({
  handleAnalyzeNovelTask: vi.fn(),
  handleStoryToScriptTask: vi.fn(),
  handleScriptToStoryboardTask: vi.fn(),
  handleVoiceAnalyzeTask: vi.fn(),
  handleAssetHubAIDesignTask: vi.fn(),
  handleAiStoryExpandTask: vi.fn(),
  handleClipsBuildTask: vi.fn(),
  handleScreenplayConvertTask: vi.fn(),
  handleEpisodeSplitTask: vi.fn(),
  handleAnalyzeGlobalTask: vi.fn(),
  handleAssetHubAIModifyTask: vi.fn(),
  handleReferenceToCharacterTask: vi.fn(),
  handleShotAITask: vi.fn(),
  handleCharacterProfileTask: vi.fn(),
  handleAiEditAssembleTask: vi.fn(),
  handleAiEditRefineTask: vi.fn(),
}))

const imageHandlersMock = vi.hoisted(() => ({
  handlePanelImageTask: vi.fn(),
  handleAssetHubImageTask: vi.fn(),
  handleAssetHubModifyTask: vi.fn(),
  handleCharacterImageTask: vi.fn(),
  handleLocationImageTask: vi.fn(),
  handleModifyAssetImageTask: vi.fn(),
  handlePanelVariantTask: vi.fn(),
}))

const videoHandlersMock = vi.hoisted(() => ({
  handleAiEditTransitionBridgeTask: vi.fn(),
}))

const voiceHandlersMock = vi.hoisted(() => ({
  generateVoiceLine: vi.fn(),
  handleVoiceDesignTask: vi.fn(),
}))

vi.mock('bullmq', () => ({
  Queue: class {
    async add() {
      return { id: 'task-1' }
    }

    async getJob() {
      return null
    }
  },
  Worker: class {
    constructor(name: string, processor: (job: Job<TaskJobData>) => Promise<unknown>) {
      workerState.processors.set(name, processor)
    }
  },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/task/service', () => taskServiceMock)
vi.mock('@/lib/task/queues', async () => {
  const actual = await vi.importActual<typeof import('@/lib/task/queues')>('@/lib/task/queues')
  return {
    ...actual,
    addTaskJob: queueMock.addTaskJob,
  }
})
vi.mock('@/lib/billing', () => billingMock)
vi.mock('@/lib/run-runtime/service', () => runRuntimeMock)
vi.mock('@/lib/run-runtime/workflow', () => ({
  isAiTaskType: vi.fn(() => false),
  workflowTypeFromTaskType: vi.fn(() => 'text'),
}))
vi.mock('@/lib/task/publisher', () => ({ publishTaskEvent: vi.fn() }))
vi.mock('@/lib/logging/core', () => ({
  createScopedLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    event: vi.fn(),
  })),
  logError: vi.fn(),
}))

vi.mock('@/lib/redis', () => ({ queueRedis: {} }))
vi.mock('@/lib/workers/shared', () => sharedMock)
vi.mock('@/lib/workers/utils', () => ({
  assertTaskActive: vi.fn(),
  buildMediaModelSnapshot: vi.fn(),
  getProjectModels: vi.fn(async () => ({ videoRatio: '16:9' })),
  resolveLipSyncVideoSource: vi.fn(),
  resolveVideoSourceFromGeneration: vi.fn(),
  toSignedUrlIfCos: vi.fn(),
  uploadVideoSourceToCos: vi.fn(),
}))
vi.mock('@/lib/config-service', () => ({
  getProjectModelConfig: vi.fn(async () => ({})),
  getUserWorkflowConcurrencyConfig: vi.fn(async () => ({ analysis: 5, image: 5, video: 5 })),
}))
vi.mock('@/lib/workers/user-concurrency-gate', () => ({
  withUserConcurrencyGate: vi.fn(async <T>(input: { run: () => Promise<T> }) => await input.run()),
}))
vi.mock('@/lib/ai-runtime', () => ({ executeAiTextStep: vi.fn() }))
vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  withInternalLLMStreamCallbacks: vi.fn(async (_callbacks: unknown, fn: () => Promise<unknown>) => await fn()),
}))
vi.mock('@/lib/prompt-i18n', () => ({
  PROMPT_IDS: {},
  buildPrompt: vi.fn(() => 'prompt'),
}))
vi.mock('@/lib/novel-promotion/insert-panel', () => ({ resolveInsertPanelUserInput: vi.fn(() => 'user input') }))
vi.mock('@/lib/novel-promotion/insert-panel-prompt-context', () => ({ buildInsertPanelLocationsDescription: vi.fn(() => '') }))
vi.mock('@/lib/storyboard-phases', () => ({
  executePhase1: vi.fn(),
  executePhase2: vi.fn(),
  executePhase2Acting: vi.fn(),
  executePhase3: vi.fn(),
}))
vi.mock('@/lib/workers/handlers/story-to-script', () => ({ handleStoryToScriptTask: textHandlersMock.handleStoryToScriptTask }))
vi.mock('@/lib/workers/handlers/script-to-storyboard', () => ({ handleScriptToStoryboardTask: textHandlersMock.handleScriptToStoryboardTask }))
vi.mock('@/lib/workers/handlers/voice-analyze', () => ({ handleVoiceAnalyzeTask: textHandlersMock.handleVoiceAnalyzeTask }))
vi.mock('@/lib/workers/handlers/asset-hub-ai-design', () => ({ handleAssetHubAIDesignTask: textHandlersMock.handleAssetHubAIDesignTask }))
vi.mock('@/lib/workers/handlers/ai-story-expand', () => ({ handleAiStoryExpandTask: textHandlersMock.handleAiStoryExpandTask }))
vi.mock('@/lib/workers/handlers/clips-build', () => ({ handleClipsBuildTask: textHandlersMock.handleClipsBuildTask }))
vi.mock('@/lib/workers/handlers/analyze-novel', () => ({ handleAnalyzeNovelTask: textHandlersMock.handleAnalyzeNovelTask }))
vi.mock('@/lib/workers/handlers/screenplay-convert', () => ({ handleScreenplayConvertTask: textHandlersMock.handleScreenplayConvertTask }))
vi.mock('@/lib/workers/handlers/episode-split', () => ({ handleEpisodeSplitTask: textHandlersMock.handleEpisodeSplitTask }))
vi.mock('@/lib/workers/handlers/analyze-global', () => ({ handleAnalyzeGlobalTask: textHandlersMock.handleAnalyzeGlobalTask }))
vi.mock('@/lib/workers/handlers/asset-hub-ai-modify', () => ({ handleAssetHubAIModifyTask: textHandlersMock.handleAssetHubAIModifyTask }))
vi.mock('@/lib/workers/handlers/reference-to-character', () => ({ handleReferenceToCharacterTask: textHandlersMock.handleReferenceToCharacterTask }))
vi.mock('@/lib/workers/handlers/shot-ai-tasks', () => ({ handleShotAITask: textHandlersMock.handleShotAITask }))
vi.mock('@/lib/workers/handlers/character-profile', () => ({ handleCharacterProfileTask: textHandlersMock.handleCharacterProfileTask }))
vi.mock('@/lib/workers/handlers/ai-edit-assemble', () => ({ handleAiEditAssembleTask: textHandlersMock.handleAiEditAssembleTask }))
vi.mock('@/lib/workers/handlers/ai-edit-refine', () => ({ handleAiEditRefineTask: textHandlersMock.handleAiEditRefineTask }))
vi.mock('@/lib/workers/handlers/image-task-handlers', () => imageHandlersMock)
vi.mock('@/lib/media/outbound-image', () => ({ normalizeToBase64ForGeneration: vi.fn() }))
vi.mock('@/lib/model-capabilities/lookup', () => ({ resolveBuiltinCapabilitiesByModelKey: vi.fn() }))
vi.mock('@/lib/model-config-contract', async () => {
  const actual = await vi.importActual<typeof import('@/lib/model-config-contract')>('@/lib/model-config-contract')
  return {
    ...actual,
    parseModelKeyStrict: vi.fn(() => null),
  }
})
vi.mock('@/lib/api-config', () => ({ getProviderConfig: vi.fn() }))
vi.mock('@/lib/workers/handlers/ai-edit-transition-bridge', () => videoHandlersMock)
vi.mock('@/lib/voice/generate-voice-line', () => ({ generateVoiceLine: voiceHandlersMock.generateVoiceLine }))
vi.mock('@/lib/workers/handlers/voice-design', () => ({ handleVoiceDesignTask: voiceHandlersMock.handleVoiceDesignTask }))

function toJob(data: Partial<TaskJobData> & Pick<TaskJobData, 'type' | 'payload'>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-1',
      locale: 'zh',
      projectId: 'project-1',
      episodeId: null,
      targetType: 'Target',
      targetId: 'target-1',
      userId: 'user-1',
      ...data,
    },
  } as unknown as Job<TaskJobData>
}

describe('chain contract - model governance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    workerState.processors.clear()
    prismaMock.adminFeatureFlag.findUnique.mockResolvedValue(null)
    prismaMock.user.findUnique.mockResolvedValue({ adminGroupKey: 'default' })
    prismaMock.adminUserGroup.findUnique.mockResolvedValue({
      key: 'default',
      status: 'active',
      allowedModelTiers: null,
      allowText: true,
      allowImage: true,
      allowVideo: true,
      allowVoice: true,
      allowLipSync: true,
      allowAdvancedModels: true,
      dailyTaskLimit: null,
      concurrentTaskLimit: null,
      maxTaskCost: null,
      maxFrozenAmount: null,
      signupCredits: 0,
      monthlyCredits: 0,
    })
    prismaMock.adminModelChannel.findUnique.mockResolvedValue({
      key: 'openai::disabled',
      status: 'disabled',
      groupKeys: null,
      userMessage: '模型已下线',
    })
    prismaMock.userPreference.findUnique.mockResolvedValue({ customModels: '[]' })
    prismaMock.task.count.mockResolvedValue(0)
  })

  it('task submission rejects governed models before createTask, billing freeze, or queue enqueue', async () => {
    const { submitTask } = await import('@/lib/task/submitter')

    await expect(submitTask({
      userId: 'user-1',
      locale: 'zh',
      projectId: 'project-1',
      type: TASK_TYPE.IMAGE_PANEL,
      targetType: 'NovelPromotionPanel',
      targetId: 'panel-1',
      payload: { imageModel: 'openai::disabled' },
    })).rejects.toMatchObject({
      code: 'MODEL_DISABLED',
      message: '模型已下线',
    } satisfies Partial<OperationPolicyError>)

    expect(taskServiceMock.createTask).not.toHaveBeenCalled()
    expect(billingMock.prepareTaskBilling).not.toHaveBeenCalled()
    expect(queueMock.addTaskJob).not.toHaveBeenCalled()
  })

  it('workers reject governed payload models before invoking text, image, video, or voice handlers', async () => {
    const { QUEUE_NAME } = await import('@/lib/task/queues')
    const { createTextWorker } = await import('@/lib/workers/text.worker')
    const { createImageWorker } = await import('@/lib/workers/image.worker')
    const { createVideoWorker } = await import('@/lib/workers/video.worker')
    const { createVoiceWorker } = await import('@/lib/workers/voice.worker')

    createTextWorker()
    createImageWorker()
    createVideoWorker()
    createVoiceWorker()

    const cases = [
      {
        queue: QUEUE_NAME.TEXT,
        job: toJob({ type: TASK_TYPE.ANALYZE_NOVEL, payload: { analysisModel: 'openai::disabled' } }),
        handler: textHandlersMock.handleAnalyzeNovelTask,
      },
      {
        queue: QUEUE_NAME.IMAGE,
        job: toJob({ type: TASK_TYPE.IMAGE_PANEL, payload: { imageModel: 'openai::disabled' } }),
        handler: imageHandlersMock.handlePanelImageTask,
      },
      {
        queue: QUEUE_NAME.VIDEO,
        job: toJob({ type: TASK_TYPE.AI_EDIT_TRANSITION_BRIDGE, payload: { videoModel: 'openai::disabled' } }),
        handler: videoHandlersMock.handleAiEditTransitionBridgeTask,
      },
      {
        queue: QUEUE_NAME.VOICE,
        job: toJob({
          type: TASK_TYPE.VOICE_LINE,
          targetType: 'NovelPromotionVoiceLine',
          targetId: 'line-1',
          payload: { lineId: 'line-1', episodeId: 'episode-1', audioModel: 'openai::disabled' },
        }),
        handler: voiceHandlersMock.generateVoiceLine,
      },
    ]

    for (const item of cases) {
      const processor = workerState.processors.get(item.queue)
      expect(processor).toBeTruthy()
      await expect(processor!(item.job)).rejects.toMatchObject({
        code: 'MODEL_DISABLED',
        message: '模型已下线',
      } satisfies Partial<OperationPolicyError>)
      expect(item.handler).not.toHaveBeenCalled()
    }
  })
})
