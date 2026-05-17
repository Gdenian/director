import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({
  authenticated: true,
}))

const serviceMock = vi.hoisted(() => ({
  listConsistencyExperimentRuns: vi.fn(),
  createConsistencyExperimentRun: vi.fn(),
  deleteConsistencyExperimentRun: vi.fn(),
}))

const adoptMock = vi.hoisted(() => ({
  adoptConsistencyExperimentRun: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )
  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireProjectAuthLight: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1' },
      }
    },
    requireProjectAuth: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1' },
      }
    },
  }
})

vi.mock('@/lib/consistency-lab/service', () => serviceMock)
vi.mock('@/lib/consistency-lab/adopt', () => adoptMock)

import {
  GET as runsGet,
  POST as runsPost,
} from '@/app/api/projects/[projectId]/consistency-lab/runs/route'
import { DELETE as runDelete } from '@/app/api/projects/[projectId]/consistency-lab/runs/[runId]/route'
import { POST as adoptPost } from '@/app/api/projects/[projectId]/consistency-lab/runs/[runId]/adopt/route'

describe('api contract - consistency lab routes', () => {
  beforeEach(() => {
    authState.authenticated = true
    vi.clearAllMocks()
    serviceMock.listConsistencyExperimentRuns.mockResolvedValue([])
    serviceMock.createConsistencyExperimentRun.mockResolvedValue({
      id: 'run-1',
      strategy: 'structured_text',
      panels: [],
      videos: [],
    })
    serviceMock.deleteConsistencyExperimentRun.mockResolvedValue({ success: true })
    adoptMock.adoptConsistencyExperimentRun.mockResolvedValue({
      storyboardId: 'storyboard-1',
      panelCount: 2,
    })
  })

  it('GET /api/projects/[projectId]/consistency-lab/runs -> lists runs for an edit script', async () => {
    const response = await runsGet(
      buildMockRequest({
        path: '/api/projects/project-1/consistency-lab/runs',
        method: 'GET',
        query: {
          episode: 'episode-1',
          editScriptId: 'edit-1',
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(200)
    expect(serviceMock.listConsistencyExperimentRuns).toHaveBeenCalledWith({
      projectId: 'project-1',
      episodeId: 'episode-1',
      editScriptId: 'edit-1',
    })
    await expect(response.json()).resolves.toEqual({ runs: [] })
  })

  it('POST /api/projects/[projectId]/consistency-lab/runs -> creates a strategy run', async () => {
    const response = await runsPost(
      buildMockRequest({
        path: '/api/projects/project-1/consistency-lab/runs',
        method: 'POST',
        body: {
          episodeId: 'episode-1',
          editScriptId: 'edit-1',
          strategy: 'grid_coordinates',
          meta: { locale: 'zh' },
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(200)
    expect(serviceMock.createConsistencyExperimentRun).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      episodeId: 'episode-1',
      editScriptId: 'edit-1',
      strategy: 'grid_coordinates',
      userId: 'user-1',
      locale: 'zh',
    }))
    await expect(response.json()).resolves.toEqual({
      run: {
        id: 'run-1',
        strategy: 'structured_text',
        panels: [],
        videos: [],
      },
    })
  })

  it('DELETE /api/projects/[projectId]/consistency-lab/runs/[runId] -> deletes experiment references', async () => {
    const response = await runDelete(
      buildMockRequest({
        path: '/api/projects/project-1/consistency-lab/runs/run-1',
        method: 'DELETE',
      }),
      { params: Promise.resolve({ projectId: 'project-1', runId: 'run-1' }) },
    )

    expect(response.status).toBe(200)
    expect(serviceMock.deleteConsistencyExperimentRun).toHaveBeenCalledWith({
      projectId: 'project-1',
      runId: 'run-1',
    })
    await expect(response.json()).resolves.toEqual({ success: true })
  })

  it('POST /api/projects/[projectId]/consistency-lab/runs/[runId]/adopt -> adopts a run as main storyboard', async () => {
    const response = await adoptPost(
      buildMockRequest({
        path: '/api/projects/project-1/consistency-lab/runs/run-1/adopt',
        method: 'POST',
      }),
      { params: Promise.resolve({ projectId: 'project-1', runId: 'run-1' }) },
    )

    expect(response.status).toBe(200)
    expect(adoptMock.adoptConsistencyExperimentRun).toHaveBeenCalledWith({
      projectId: 'project-1',
      runId: 'run-1',
    })
    await expect(response.json()).resolves.toEqual({
      storyboardId: 'storyboard-1',
      panelCount: 2,
    })
  })

  it('POST /api/projects/[projectId]/consistency-lab/runs rejects unknown strategy', async () => {
    const response = await runsPost(
      buildMockRequest({
        path: '/api/projects/project-1/consistency-lab/runs',
        method: 'POST',
        body: {
          episodeId: 'episode-1',
          editScriptId: 'edit-1',
          strategy: 'baseline',
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(400)
    expect(serviceMock.createConsistencyExperimentRun).not.toHaveBeenCalled()
  })
})
