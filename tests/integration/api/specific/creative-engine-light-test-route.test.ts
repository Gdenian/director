import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  mockUnauthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'

const openAIState = vi.hoisted(() => ({
  create: vi.fn(async () => ({ choices: [{ message: { content: 'ok' } }] })),
  constructors: [] as Array<{ apiKey?: string; baseURL?: string; timeout?: number }>,
}))

vi.mock('openai', () => ({
  default: class OpenAI {
    chat = { completions: { create: openAIState.create } }

    constructor(options: { apiKey?: string; baseURL?: string; timeout?: number }) {
      openAIState.constructors.push(options)
    }
  },
}))

describe('api specific - creative engine light-test route', () => {
  const routeContext = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    openAIState.constructors = []
    resetAuthMockState()
  })

  it('requires user auth', async () => {
    installAuthMocks()
    mockUnauthenticated()
    const route = await import('@/app/api/user/creative-engines/light-test/route')

    const res = await route.POST(buildMockRequest({
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

    expect(res.status).toBe(401)
    expect(openAIState.create).not.toHaveBeenCalled()
  })

  it('requires explicit confirmation before a paid text call', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/creative-engines/light-test/route')

    const res = await route.POST(buildMockRequest({
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

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error?.details).toMatchObject({
      code: 'CREATIVE_ENGINE_LIGHT_TEST_CONFIRMATION_REQUIRED',
      field: 'confirmedCostRisk',
    })
    expect(openAIState.create).not.toHaveBeenCalled()
  })

  it('runs only a minimal OpenAI-compatible text call after confirmation', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/creative-engines/light-test/route')

    const res = await route.POST(buildMockRequest({
      path: '/api/user/creative-engines/light-test',
      method: 'POST',
      body: {
        protocolType: 'openai-compatible',
        serviceUrl: ' https://api.example.com/v1/ ',
        apiKey: 'sk-test',
        modelCallName: ' gpt-5-mini ',
        confirmedCostRisk: true,
      },
    }), routeContext)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, message: 'ok' })
    expect(openAIState.constructors).toEqual([{
      apiKey: 'sk-test',
      baseURL: 'https://api.example.com/v1',
      timeout: 30_000,
    }])
    expect(openAIState.create).toHaveBeenCalledWith({
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
      temperature: 0,
    })
  })

  it('does not add media light-test paths', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/creative-engines/light-test/route')

    const res = await route.POST(buildMockRequest({
      path: '/api/user/creative-engines/light-test',
      method: 'POST',
      body: {
        protocolType: 'gemini-compatible',
        serviceUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: 'gemini-key',
        modelCallName: 'gemini-3-flash-preview',
        confirmedCostRisk: true,
      },
    }), routeContext)

    expect(res.status).toBe(400)
    expect(openAIState.create).not.toHaveBeenCalled()
  })
})
