import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(async () => ({ id: 'project-1' })),
  },
  novelPromotionProject: {
    findFirst: vi.fn(async () => ({ id: 'np-project-1' })),
  },
}))

const llmClientMock = vi.hoisted(() => ({
  chatCompletion: vi.fn(async () => ({ id: 'completion-1' })),
  getCompletionContent: vi.fn(() => JSON.stringify({
    episodes: [
      {
        number: 1,
        title: '第一集',
        summary: '开端',
        startMarker: 'START_MARKER',
        endMarker: 'END_MARKER',
      },
    ],
  })),
}))

const configServiceMock = vi.hoisted(() => ({
  getUserModelConfig: vi.fn(async () => ({
    analysisModel: 'llm::analysis-model',
  })),
}))

const internalStreamMock = vi.hoisted(() => ({
  withInternalLLMStreamCallbacks: vi.fn(async (_callbacks: unknown, fn: () => Promise<unknown>) => await fn()),
}))

const sharedMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => {}),
}))

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => {}),
}))

const llmStreamMock = vi.hoisted(() => ({
  createWorkerLLMStreamContext: vi.fn(() => ({ streamId: 'stream-1' })),
  createWorkerLLMStreamCallbacks: vi.fn(() => ({
    flush: vi.fn(async () => {}),
  })),
}))

const promptMock = vi.hoisted(() => ({
  PROMPT_IDS: { NP_EPISODE_SPLIT: 'np_episode_split' },
  buildPrompt: vi.fn(() => 'EPISODE_SPLIT_PROMPT'),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/llm-client', () => llmClientMock)
vi.mock('@/lib/config-service', () => configServiceMock)
vi.mock('@/lib/llm-observe/internal-stream-context', () => internalStreamMock)
vi.mock('@/lib/workers/shared', () => sharedMock)
vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/workers/handlers/llm-stream', () => llmStreamMock)
vi.mock('@/lib/prompt-i18n', () => promptMock)
vi.mock('@/lib/novel-promotion/story-to-script/clip-matching', () => ({
  createTextMarkerMatcher: (content: string) => ({
    matchMarker: (marker: string, fromIndex = 0) => {
      const startIndex = content.indexOf(marker, fromIndex)
      if (startIndex === -1) return null
      return {
        startIndex,
        endIndex: startIndex + marker.length,
      }
    },
  }),
}))

import { handleEpisodeSplitTask } from '@/lib/workers/handlers/episode-split'

function buildJob(content: string): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-episode-split-1',
      type: TASK_TYPE.EPISODE_SPLIT_LLM,
      locale: 'zh',
      projectId: 'project-1',
      targetType: 'NovelPromotionProject',
      targetId: 'project-1',
      payload: { content },
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker episode-split', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    llmClientMock.getCompletionContent.mockReturnValue(JSON.stringify({
      episodes: [
        {
          number: 1,
          title: '第一集',
          summary: '开端',
          startMarker: 'START_MARKER',
          endMarker: 'END_MARKER',
        },
      ],
    }))
  })

  it('fails fast when content is too short', async () => {
    const job = buildJob('short text')
    await expect(handleEpisodeSplitTask(job)).rejects.toThrow('文本太短，至少需要 100 字')
  })

  it('returns matched episodes when ai boundaries are valid', async () => {
    const content = [
      '前置内容用于凑长度，确保文本超过一百字。这一段会重复两次以保证长度满足阈值。',
      '前置内容用于凑长度，确保文本超过一百字。这一段会重复两次以保证长度满足阈值。',
      'START_MARKER',
      '这里是第一集的正文内容，包含角色冲突与场景推进，长度足够用于单元测试验证。',
      'END_MARKER',
      '后置内容用于确保边界外还有文本，并继续补足长度。',
    ].join('')

    const job = buildJob(content)
    const result = await handleEpisodeSplitTask(job)

    expect(result.success).toBe(true)
    expect(result.episodes).toHaveLength(1)
    expect(result.episodes[0]?.number).toBe(1)
    expect(result.episodes[0]?.title).toBe('第一集')
    expect(result.episodes[0]?.content).toContain('START_MARKER')
    expect(result.episodes[0]?.content).toContain('END_MARKER')
  })

  it('falls back to ai indexes when an end marker cannot be located', async () => {
    const prefix = '前置内容用于凑长度，确保文本超过一百字。这一段会重复两次以保证长度满足阈值。'
    const episodeOne = 'EP1_START第一集正文内容，包含角色冲突与场景推进，长度足够用于单元测试验证。EP1_END'
    const episodeTwo = 'EP2_START第二集正文内容，AI 返回的结束标记不存在，但索引边界仍然可信。EP2_REAL_END'
    const suffix = '后置内容用于确保边界外还有文本，并继续补足长度。'
    const content = `${prefix}${prefix}${episodeOne}${episodeTwo}${suffix}`

    llmClientMock.getCompletionContent.mockReturnValue(JSON.stringify({
      episodes: [
        {
          number: 1,
          title: '第一集',
          summary: '开端',
          startMarker: 'EP1_START',
          endMarker: 'EP1_END',
          startIndex: content.indexOf('EP1_START'),
          endIndex: content.indexOf('EP1_END') + 'EP1_END'.length,
        },
        {
          number: 2,
          title: '第二集',
          summary: '转折',
          startMarker: 'EP2_START',
          endMarker: 'EP2_MISSING_END',
          startIndex: content.indexOf('EP2_START'),
          endIndex: content.indexOf('EP2_REAL_END') + 'EP2_REAL_END'.length,
        },
      ],
    }))

    const result = await handleEpisodeSplitTask(buildJob(content))

    expect(result.success).toBe(true)
    expect(result.episodes).toHaveLength(2)
    expect(result.episodes[1]?.title).toBe('第二集')
    expect(result.episodes[1]?.content).toBe(episodeTwo)
  })

  it('falls back to local safe split when ai boundaries cannot be resolved', async () => {
    const content = [
      '这是一段没有任何 AI 边界标记的正文内容，用于模拟模型返回的 marker 与索引都不可靠的情况。',
      '这段文字会重复多次以确保超过最小长度，同时本地安全切分应该仍然能返回可预览的剧集。',
      '当智能分集无法定位边界时，用户不应该看到内部 marker 错误，而应该进入兜底分集结果。',
    ].join('').repeat(2)

    llmClientMock.getCompletionContent.mockReturnValue(JSON.stringify({
      episodes: [
        {
          number: 1,
          title: '第一集',
          summary: '开端',
          startMarker: 'MISSING_START',
          endMarker: 'MISSING_END',
          startIndex: -1,
          endIndex: -1,
        },
      ],
    }))

    const result = await handleEpisodeSplitTask(buildJob(content))

    expect(result.success).toBe(true)
    expect(result.episodes.length).toBeGreaterThan(0)
    expect(result.episodes[0]?.title).toBe('第 1 集')
    expect(result.episodes[0]?.content).toBe(content)
  })
})
