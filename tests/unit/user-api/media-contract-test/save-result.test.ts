import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveMediaContractTestResult } from '@/lib/user-api/media-contract-test/save-result'

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(),
    upsert: vi.fn(async () => ({ id: 'pref-1' })),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('save media contract test result', () => {
  const compatMediaTemplate = {
    version: 1,
    mediaType: 'image',
    mode: 'sync',
    create: {
      method: 'POST',
      path: '/images',
      contentType: 'application/json',
      bodyTemplate: { prompt: '{{prompt}}' },
    },
    response: {
      outputUrlPath: '$.data[0].url',
    },
  }

  const storedModels = [{
    id: 'model-1',
    engineId: 'openai-compatible:relay',
    name: 'GPT Image 2',
    callName: 'gpt-image-2',
    modelKey: 'openai-compatible:relay::gpt-image-2',
    type: 'image',
    purpose: 'image-generation',
    enabled: true,
    status: 'available',
    compatMediaTemplate,
    compatMediaTemplateSource: 'manual',
    mediaContract: {
      version: 1,
      mediaType: 'image',
      executor: 'openai-compat-template',
      capabilities: ['text-to-image', 'image-to-image'],
      input: {},
      output: {
        kind: 'url',
        urlPath: '$.data[0].url',
      },
      testStatus: {
        textToImage: 'passed',
      },
    },
    mediaContractSource: 'manual',
  }]

  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.userPreference.findUnique.mockResolvedValue({
      customProviders: JSON.stringify([{ id: 'openai-compatible:relay' }]),
      customModels: JSON.stringify(storedModels),
    })
  })

  it('preserves model fields and updates only the target capability status', async () => {
    await saveMediaContractTestResult({
      userId: 'user-1',
      modelKey: 'openai-compatible:relay::gpt-image-2',
      capability: 'image-to-image',
      status: 'failed',
      diagnostic: { message: 'failed' },
    })

    const calls = prismaMock.userPreference.upsert.mock.calls as unknown as Array<[{
      update: { customModels: string }
    }]>
    const payload = calls[0][0]
    const saved = JSON.parse(payload.update.customModels)[0]
    expect(saved.compatMediaTemplate).toEqual(compatMediaTemplate)
    expect(saved.mediaContract.testStatus).toMatchObject({
      textToImage: 'passed',
      imageToImage: 'failed',
    })
    expect(saved.mediaContract.testStatus.imageEdit).toBeUndefined()
    expect(typeof saved.mediaContractCheckedAt).toBe('string')
    expect(saved.mediaContract.checkedAt).toBe(saved.mediaContractCheckedAt)
  })

  it('rejects capabilities not supported by the model media contract', async () => {
    await expect(saveMediaContractTestResult({
      userId: 'user-1',
      modelKey: 'openai-compatible:relay::gpt-image-2',
      capability: 'image-edit',
      status: 'failed',
      diagnostic: { message: 'failed' },
    })).rejects.toThrow('MEDIA_TEST_CAPABILITY_UNSUPPORTED')

    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })
})
