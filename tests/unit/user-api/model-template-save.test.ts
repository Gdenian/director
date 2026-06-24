import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn<(...args: unknown[]) => Promise<{ customProviders: string; customModels: string } | null>>(async () => null),
    upsert: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

import { saveModelTemplateConfiguration } from '@/lib/user-api/model-template/save'

function readSavedModelsFromUpsert(): Array<Record<string, unknown>> {
  const firstCall = prismaMock.userPreference.upsert.mock.calls[0]
  if (!firstCall) throw new Error('expected upsert to be called')
  const payload = (firstCall as [{ update?: { customModels?: unknown } }])[0]
  const raw = payload.update?.customModels
  if (typeof raw !== 'string') throw new Error('expected customModels string')
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) throw new Error('expected customModels array')
  return parsed as Array<Record<string, unknown>>
}

describe('user-api model template save', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('preserves existing model fields while updating target model template', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      customProviders: JSON.stringify([
        { id: 'openai-compatible:oa-1', name: 'OpenAI Compat' },
      ]),
      customModels: JSON.stringify([
        {
          modelId: 'veo3.1',
          modelKey: 'openai-compatible:oa-1::veo3.1',
          name: 'Veo 3.1',
          type: 'video',
          provider: 'openai-compatible:oa-1',
          customPricing: { video: { basePrice: 1.2 } },
          capabilities: { video: { durationOptions: [5, 8] } },
        },
      ]),
    })

    await saveModelTemplateConfiguration({
      userId: 'user-1',
      providerId: 'openai-compatible:oa-1',
      modelId: 'veo3.1',
      name: 'Veo 3.1',
      type: 'video',
      template: {
        version: 1,
        mediaType: 'video',
        mode: 'async',
        create: { method: 'POST', path: '/v2/videos/generations' },
        status: { method: 'GET', path: '/v2/videos/generations/{{task_id}}' },
        response: {
          taskIdPath: '$.task_id',
          statusPath: '$.status',
        },
        polling: {
          intervalMs: 3000,
          timeoutMs: 180000,
          doneStates: ['done'],
          failStates: ['failed'],
        },
      },
      source: 'ai',
    })

    const savedModels = readSavedModelsFromUpsert()
    const target = savedModels.find((item) => item.modelKey === 'openai-compatible:oa-1::veo3.1')
    expect(target).toBeTruthy()
    expect(target?.pricing).toEqual({ video: { basePrice: 1.2 } })
    expect(target?.customPricing).toBeUndefined()
    expect(target?.capabilities).toEqual({ video: { durationOptions: [5, 8] } })
    expect(target?.provider).toBeUndefined()
    expect(target?.modelId).toBeUndefined()
    expect(target?.compatMediaTemplate).toMatchObject({
      mediaType: 'video',
      mode: 'async',
    })
    expect(target?.compatMediaTemplateSource).toBe('ai')
    expect(typeof target?.compatMediaTemplateCheckedAt).toBe('string')
  })

  it('preserves creative-shape models when saving a template', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      customProviders: JSON.stringify([
        {
          id: 'openai-compatible:oa-1',
          name: 'OpenAI Compat',
          providerKey: 'openai-compatible',
        },
      ]),
      customModels: JSON.stringify([
        {
          id: 'openai-compatible:oa-1::veo3.1',
          engineId: 'openai-compatible:oa-1',
          callName: 'veo3.1',
          modelKey: 'openai-compatible:oa-1::veo3.1',
          name: 'Veo 3.1',
          type: 'video',
          purpose: 'video-generation',
          enabled: true,
          status: 'available',
          pricing: { video: { basePrice: 1.2 } },
          warningCodes: ['manual-review'],
        },
        {
          id: 'openai-compatible:oa-1::draft-image',
          engineId: 'openai-compatible:oa-1',
          callName: 'draft-image',
          modelKey: 'openai-compatible:oa-1::draft-image',
          name: 'Draft Image',
          type: 'image',
          purpose: 'image-edit',
          enabled: false,
          status: 'unchecked',
          confidence: 'low',
        },
      ]),
    })

    await saveModelTemplateConfiguration({
      userId: 'user-1',
      providerId: 'openai-compatible:oa-1',
      modelId: 'veo3.1',
      name: 'Veo 3.1',
      type: 'video',
      template: {
        version: 1,
        mediaType: 'video',
        mode: 'async',
        create: { method: 'POST', path: '/v2/videos/generations' },
        status: { method: 'GET', path: '/v2/videos/generations/{{task_id}}' },
        response: {
          taskIdPath: '$.task_id',
          statusPath: '$.status',
        },
        polling: {
          intervalMs: 3000,
          timeoutMs: 180000,
          doneStates: ['done'],
          failStates: ['failed'],
        },
      },
      source: 'manual',
    })

    const savedModels = readSavedModelsFromUpsert()
    expect(savedModels).toHaveLength(2)
    const target = savedModels.find((item) => item.modelKey === 'openai-compatible:oa-1::veo3.1')
    expect(target).toMatchObject({
      engineId: 'openai-compatible:oa-1',
      callName: 'veo3.1',
      purpose: 'video-generation',
      pricing: { video: { basePrice: 1.2 } },
      warningCodes: ['manual-review'],
      compatMediaTemplateSource: 'manual',
    })
    expect(target?.provider).toBeUndefined()
    expect(target?.modelId).toBeUndefined()
    expect(savedModels.find((item) => item.modelKey === 'openai-compatible:oa-1::draft-image')).toMatchObject({
      purpose: 'image-edit',
      enabled: false,
      confidence: 'low',
    })
  })

  it('persists media contract metadata alongside the template', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      customProviders: JSON.stringify([
        {
          id: 'openai-compatible:oa-1',
          name: 'OpenAI Compat',
          providerKey: 'openai-compatible',
        },
      ]),
      customModels: JSON.stringify([]),
    })

    await saveModelTemplateConfiguration({
      userId: 'user-1',
      providerId: 'openai-compatible:oa-1',
      modelId: 'agnes-video-v2.0',
      name: 'Agnes Video V2',
      type: 'video',
      template: {
        version: 1,
        mediaType: 'video',
        mode: 'async',
        create: {
          method: 'POST',
          path: '/videos',
          contentType: 'application/json',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
            image: '{{image}}',
          },
        },
        status: {
          method: 'GET',
          path: 'https://apihub.agnes-ai.com/agnesapi?video_id={{task_id}}',
        },
        response: {
          taskIdPath: '$.video_id',
          statusPath: '$.status',
          outputUrlPath: '$.remixed_from_video_id',
        },
        polling: {
          intervalMs: 5000,
          timeoutMs: 600000,
          doneStates: ['completed'],
          failStates: ['failed'],
        },
      },
      source: 'ai',
      mediaContract: {
        version: 1,
        mediaType: 'video',
        executor: 'openai-compat-template',
        capabilities: ['image-to-video'],
        input: { image: 'publicUrl' },
        output: { kind: 'asyncTask', urlPath: '$.remixed_from_video_id' },
        testStatus: { imageToVideo: 'unchecked' },
        source: 'llm',
      },
      mediaContractSource: 'llm',
    })

    const savedModels = readSavedModelsFromUpsert()
    const target = savedModels.find((item) => item.modelKey === 'openai-compatible:oa-1::agnes-video-v2.0')
    expect(target).toMatchObject({
      mediaContract: {
        mediaType: 'video',
        executor: 'openai-compat-template',
        capabilities: ['image-to-video'],
        input: { image: 'publicUrl' },
        output: { kind: 'asyncTask', urlPath: '$.remixed_from_video_id' },
        testStatus: { imageToVideo: 'unchecked' },
        source: 'llm',
      },
      mediaContractSource: 'llm',
    })
    expect(typeof target?.mediaContractCheckedAt).toBe('string')
  })
})
