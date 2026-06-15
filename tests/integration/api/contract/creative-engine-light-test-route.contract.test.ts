import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'

const openAIState = vi.hoisted(() => ({
  create: vi.fn(async () => ({ choices: [{ message: { content: 'ok' } }] })),
}))

vi.mock('openai', () => ({
  default: class OpenAI {
    chat = { completions: { create: openAIState.create } }
  },
}))

describe('api contract - creative engine light-test route', () => {
  const routeContext = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetAuthMockState()
  })

  it('requires explicit confirmation and performs only a minimal text probe', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/creative-engines/light-test/route')

    const blocked = await route.POST(buildMockRequest({
      path: '/api/user/creative-engines/light-test',
      method: 'POST',
      body: {
        protocolType: 'openai-compatible',
        serviceUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        modelCallName: 'gpt-5-mini',
        confirmedCostRisk: false,
      },
    }), routeContext)
    expect(blocked.status).toBe(400)
    expect(openAIState.create).not.toHaveBeenCalled()

    const confirmed = await route.POST(buildMockRequest({
      path: '/api/user/creative-engines/light-test',
      method: 'POST',
      body: {
        protocolType: 'openai-compatible',
        serviceUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        modelCallName: 'gpt-5-mini',
        confirmedCostRisk: true,
      },
    }), routeContext)
    expect(confirmed.status).toBe(200)
    await expect(confirmed.json()).resolves.toEqual({ success: true, message: 'ok' })
    expect(openAIState.create).toHaveBeenCalledWith({
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
      temperature: 0,
    })
  })
})
