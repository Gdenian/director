import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query/keys'

const {
  apiFetchMock,
  useQueryClientMock,
} = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  useQueryClientMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQueryClient: () => useQueryClientMock(),
  }
})

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: apiFetchMock,
}))

import { useAssetActions } from '@/lib/query/hooks/useAssets'

function createOkResponse() {
  return {
    ok: true,
    json: async () => ({ success: true }),
  } as Response
}

describe('useAssetActions style CRUD', () => {
  beforeEach(() => {
    useQueryClientMock.mockReset()
    apiFetchMock.mockReset()
    apiFetchMock.mockResolvedValue(createOkResponse())
  })

  it('creates a style asset through the unified global assets route and invalidates caches', async () => {
    const queryClient = new QueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    useQueryClientMock.mockReturnValue(queryClient)

    const actions = useAssetActions({ scope: 'global', kind: 'style' })
    await actions.create({
      name: '冷峻赛博',
      positivePrompt: 'cyberpunk neon city',
    })

    expect(apiFetchMock).toHaveBeenCalledWith('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'global',
        kind: 'style',
        projectId: undefined,
        name: '冷峻赛博',
        positivePrompt: 'cyberpunk neon city',
      }),
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.assets.all('global', undefined),
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.globalAssets.all(),
    })
  })

  it('updates a style asset through the unified global assets route', async () => {
    const queryClient = new QueryClient()
    useQueryClientMock.mockReturnValue(queryClient)

    const actions = useAssetActions({ scope: 'global', kind: 'style' })
    await actions.update('style-1', {
      name: '冷峻赛博',
      positivePrompt: 'cyberpunk neon city',
    })

    expect(apiFetchMock).toHaveBeenCalledWith('/api/assets/style-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'global',
        kind: 'style',
        projectId: undefined,
        name: '冷峻赛博',
        positivePrompt: 'cyberpunk neon city',
      }),
    })
  })

  it('removes a style asset through the unified global assets route', async () => {
    const queryClient = new QueryClient()
    useQueryClientMock.mockReturnValue(queryClient)

    const actions = useAssetActions({ scope: 'global', kind: 'style' })
    await actions.remove('style-1')

    expect(apiFetchMock).toHaveBeenCalledWith('/api/assets/style-1', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'global',
        kind: 'style',
        projectId: undefined,
      }),
    })
  })
})
