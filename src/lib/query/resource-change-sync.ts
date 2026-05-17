import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from './keys'
import type { ProjectEditScreenplay, ProjectEditScript } from '@/types/project'

type UnknownRecord = Record<string, unknown>

export const WORKSPACE_RESOURCE_KIND = {
  EDIT_SCREENPLAY: 'editScreenplay',
  EDIT_SCRIPT: 'editScript',
  EPISODE_DATA: 'episodeData',
  PROJECT_DATA: 'projectData',
  PROJECT_CONTEXT: 'projectContext',
} as const

export type WorkspaceResourceKind = (typeof WORKSPACE_RESOURCE_KIND)[keyof typeof WORKSPACE_RESOURCE_KIND]

export type WorkspaceResourceChange =
  | {
      kind: typeof WORKSPACE_RESOURCE_KIND.EDIT_SCREENPLAY
      projectId: string
      episodeId: string
      data?: ProjectEditScreenplay | null
    }
  | {
      kind: typeof WORKSPACE_RESOURCE_KIND.EDIT_SCRIPT
      projectId: string
      episodeId: string
      data?: ProjectEditScript | null
    }
  | {
      kind:
        | typeof WORKSPACE_RESOURCE_KIND.EPISODE_DATA
        | typeof WORKSPACE_RESOURCE_KIND.PROJECT_CONTEXT
      projectId: string
      episodeId: string
    }
  | {
      kind: typeof WORKSPACE_RESOURCE_KIND.PROJECT_DATA
      projectId: string
    }

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function dedupeResourceChanges(changes: readonly WorkspaceResourceChange[]): WorkspaceResourceChange[] {
  const seen = new Set<string>()
  const deduped: WorkspaceResourceChange[] = []
  for (const change of changes) {
    const key = 'episodeId' in change
      ? `${change.kind}:${change.projectId}:${change.episodeId}`
      : `${change.kind}:${change.projectId}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(change)
  }
  return deduped
}

function isEditScreenplayRecord(value: unknown): value is ProjectEditScreenplay {
  if (!isRecord(value)) return false
  return Boolean(
    readString(value.id)
      && readString(value.projectId)
      && readString(value.episodeId)
      && readString(value.screenplayText)
      && readString(value.status),
  )
}

function isEditScriptRecord(value: unknown): value is ProjectEditScript {
  if (!isRecord(value)) return false
  return Boolean(
    readString(value.id)
      && readString(value.projectId)
      && readString(value.episodeId)
      && Array.isArray(value.shots)
      && Array.isArray(value.videoBlocks),
  )
}

function readWriteResultData(value: unknown): unknown[] {
  if (!isRecord(value)) return []
  const candidates: unknown[] = []
  if (value.ok === true && 'data' in value) candidates.push(value.data)
  if (value.success === true && 'result' in value) candidates.push(value.result)
  if ('result' in value && isRecord(value.result)) {
    const nested = readWriteResultData(value.result)
    if (nested.length > 0) candidates.push(...nested)
  }
  return candidates.length > 0 ? candidates : [value]
}

export function extractWorkspaceResourceChangesFromWriteResult(params: {
  result: unknown
  projectId: string
  fallbackEpisodeId?: string | null
}): WorkspaceResourceChange[] {
  const changes: WorkspaceResourceChange[] = []
  for (const data of readWriteResultData(params.result)) {
    if (isEditScreenplayRecord(data)) {
      changes.push(
        {
          kind: WORKSPACE_RESOURCE_KIND.EDIT_SCREENPLAY,
          projectId: data.projectId,
          episodeId: data.episodeId,
          data,
        },
        {
          kind: WORKSPACE_RESOURCE_KIND.EDIT_SCRIPT,
          projectId: data.projectId,
          episodeId: data.episodeId,
        },
        {
          kind: WORKSPACE_RESOURCE_KIND.EPISODE_DATA,
          projectId: data.projectId,
          episodeId: data.episodeId,
        },
        {
          kind: WORKSPACE_RESOURCE_KIND.PROJECT_CONTEXT,
          projectId: data.projectId,
          episodeId: data.episodeId,
        },
        {
          kind: WORKSPACE_RESOURCE_KIND.PROJECT_DATA,
          projectId: data.projectId,
        },
      )
      continue
    }
    if (isEditScriptRecord(data)) {
      changes.push(
        {
          kind: WORKSPACE_RESOURCE_KIND.EDIT_SCRIPT,
          projectId: data.projectId,
          episodeId: data.episodeId,
          data,
        },
        {
          kind: WORKSPACE_RESOURCE_KIND.EPISODE_DATA,
          projectId: data.projectId,
          episodeId: data.episodeId,
        },
        {
          kind: WORKSPACE_RESOURCE_KIND.PROJECT_CONTEXT,
          projectId: data.projectId,
          episodeId: data.episodeId,
        },
        {
          kind: WORKSPACE_RESOURCE_KIND.PROJECT_DATA,
          projectId: data.projectId,
        },
      )
    }
  }

  if (changes.length > 0) return dedupeResourceChanges(changes)
  const fallbackEpisodeId = params.fallbackEpisodeId?.trim()
  if (!fallbackEpisodeId) return []
  return []
}

export async function syncWorkspaceResourceChanges(params: {
  queryClient: QueryClient
  changes: readonly WorkspaceResourceChange[]
}) {
  const changes = dedupeResourceChanges(params.changes)
  const invalidations: Promise<unknown>[] = []

  for (const change of changes) {
    if (change.kind === WORKSPACE_RESOURCE_KIND.EDIT_SCREENPLAY) {
      if (change.data !== undefined) {
        params.queryClient.setQueryData(
          queryKeys.project.editScreenplay(change.projectId, change.episodeId),
          change.data,
        )
      }
      invalidations.push(params.queryClient.invalidateQueries({
        queryKey: queryKeys.project.editScreenplay(change.projectId, change.episodeId),
      }))
      continue
    }

    if (change.kind === WORKSPACE_RESOURCE_KIND.EDIT_SCRIPT) {
      if (change.data !== undefined) {
        params.queryClient.setQueryData(
          queryKeys.project.editScript(change.projectId, change.episodeId),
          change.data,
        )
      }
      invalidations.push(params.queryClient.invalidateQueries({
        queryKey: queryKeys.project.editScript(change.projectId, change.episodeId),
      }))
      continue
    }

    if (change.kind === WORKSPACE_RESOURCE_KIND.EPISODE_DATA) {
      invalidations.push(params.queryClient.invalidateQueries({
        queryKey: queryKeys.episodeData(change.projectId, change.episodeId),
      }))
      continue
    }

    if (change.kind === WORKSPACE_RESOURCE_KIND.PROJECT_CONTEXT) {
      invalidations.push(params.queryClient.invalidateQueries({
        queryKey: queryKeys.project.context(change.projectId, change.episodeId),
      }))
      continue
    }

    invalidations.push(params.queryClient.invalidateQueries({
      queryKey: queryKeys.projectData(change.projectId),
    }))
  }

  await Promise.all(invalidations)
}

export async function syncWorkspaceResourceChangesFromWriteResult(params: {
  queryClient: QueryClient
  result: unknown
  projectId: string
  fallbackEpisodeId?: string | null
}) {
  const changes = extractWorkspaceResourceChangesFromWriteResult({
    result: params.result,
    projectId: params.projectId,
    fallbackEpisodeId: params.fallbackEpisodeId,
  })
  if (changes.length === 0) return
  await syncWorkspaceResourceChanges({
    queryClient: params.queryClient,
    changes,
  })
}

