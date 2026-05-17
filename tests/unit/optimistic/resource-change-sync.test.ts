import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import {
  extractWorkspaceResourceChangesFromWriteResult,
  syncWorkspaceResourceChangesFromWriteResult,
  WORKSPACE_RESOURCE_KIND,
} from '@/lib/query/resource-change-sync'
import { queryKeys } from '@/lib/query/keys'
import type { ProjectEditScreenplay } from '@/types/project'

function createScreenplay(): ProjectEditScreenplay {
  return {
    id: 'screenplay-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    userPrompt: 'make a quiet short film',
    screenplayText: '标题：《静水》',
    status: 'ready',
  }
}

describe('resource-change-sync', () => {
  it('extracts resource changes from a successful assistant tool write result', () => {
    const changes = extractWorkspaceResourceChangesFromWriteResult({
      result: {
        ok: true,
        data: createScreenplay(),
      },
      projectId: 'project-1',
      fallbackEpisodeId: 'episode-1',
    })

    expect(changes.map((change) => change.kind)).toEqual([
      WORKSPACE_RESOURCE_KIND.EDIT_SCREENPLAY,
      WORKSPACE_RESOURCE_KIND.EDIT_SCRIPT,
      WORKSPACE_RESOURCE_KIND.EPISODE_DATA,
      WORKSPACE_RESOURCE_KIND.PROJECT_CONTEXT,
      WORKSPACE_RESOURCE_KIND.PROJECT_DATA,
    ])
  })

  it('patches screenplay cache immediately and invalidates affected state', async () => {
    const queryClient = new QueryClient()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
    const screenplay = createScreenplay()

    await syncWorkspaceResourceChangesFromWriteResult({
      queryClient,
      result: {
        success: true,
        result: screenplay,
      },
      projectId: 'project-1',
      fallbackEpisodeId: 'episode-1',
    })

    expect(queryClient.getQueryData(queryKeys.project.editScreenplay('project-1', 'episode-1'))).toEqual(screenplay)
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.project.editScreenplay('project-1', 'episode-1'),
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.project.editScript('project-1', 'episode-1'),
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.episodeData('project-1', 'episode-1'),
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.project.context('project-1', 'episode-1'),
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.projectData('project-1'),
    })
  })
})
