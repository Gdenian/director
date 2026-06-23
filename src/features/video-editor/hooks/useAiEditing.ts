'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { VideoEditorProject } from '../types/editor.types'
import { useEditorActions } from './useEditorActions'
import type { AiEditableMediaLibrary } from '@/lib/novel-promotion/ai-editing/tool-types'
import { isAsyncTaskResponse, waitForTaskResult as waitForTaskResultDefault } from '@/lib/task/client'

interface UseAiEditingProps {
    projectId: string
    episodeId: string
    editorProjectId: string
    selectedClipId?: string | null
    onProjectChange: Dispatch<SetStateAction<VideoEditorProject>>
}

type RefreshProject = () => Promise<VideoEditorProject | null>
type WaitForTaskResult = typeof waitForTaskResultDefault
type SetError = Dispatch<SetStateAction<string | null>> | ((value: string | null) => void)
type SetLoading = Dispatch<SetStateAction<boolean>> | ((value: boolean) => void)
type DiscardPendingVersion = (input: { editorProjectId: string }) => Promise<{ projectData?: VideoEditorProject }>

export function useAiEditing({
    projectId,
    episodeId,
    editorProjectId,
    selectedClipId,
    onProjectChange,
}: UseAiEditingProps) {
    const {
        loadProject,
        listMedia,
        importMediaFile,
        importMediaUrl,
        refineProject,
        applyPendingVersion,
        discardPendingVersion,
    } = useEditorActions({ projectId, episodeId })
    const [media, setMedia] = useState<AiEditableMediaLibrary | null>(null)
    const [isLoadingMedia, setIsLoadingMedia] = useState(false)
    const [isImportingMedia, setIsImportingMedia] = useState(false)
    const [isRefining, setIsRefining] = useState(false)
    const [isApplying, setIsApplying] = useState(false)
    const [isDiscarding, setIsDiscarding] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const refreshProject = useCallback(async () => {
        const nextProject = await loadProject()
        if (nextProject) onProjectChange(nextProject)
        return nextProject
    }, [loadProject, onProjectChange])

    const refreshMedia = useCallback(() => runAiEditingAction({
        setError,
        setLoading: setIsLoadingMedia,
        action: async () => {
            const nextMedia = await listMedia(editorProjectId)
            setMedia(nextMedia)
            return nextMedia
        },
    }), [editorProjectId, listMedia])

    const importFile = useCallback((file: File) => runAiEditingAction({
        setError,
        setLoading: setIsImportingMedia,
        action: async () => {
            await importMediaFile({ editorProjectId, file, label: file.name })
            await refreshMedia()
        },
    }), [editorProjectId, importMediaFile, refreshMedia])

    const importUrl = useCallback((url: string) => runAiEditingAction({
        setError,
        setLoading: setIsImportingMedia,
        action: async () => {
            await importMediaUrl({
                editorProjectId,
                url,
                mimeType: inferMimeTypeFromUrl(url),
            })
            await refreshMedia()
        },
    }), [editorProjectId, importMediaUrl, refreshMedia])

    const refine = useCallback((instruction: string) => runAiEditingAction({
        setError,
        setLoading: setIsRefining,
        action: async () => {
            const result = await refineProject({
                editorProjectId,
                instruction,
                selectedClipId: selectedClipId || undefined,
            })
            await refreshProjectAfterRefineTask({
                refineResult: result,
                waitForTaskResult: waitForTaskResultDefault,
                refreshProject,
            })
            return result
        },
    }), [editorProjectId, refineProject, refreshProject, selectedClipId])

    const applyPending = useCallback((pendingVersionId: string) => runAiEditingAction({
        setError,
        setLoading: setIsApplying,
        action: async () => {
            const result = await applyPendingVersion({ editorProjectId, pendingVersionId })
            if (result.projectData) onProjectChange(result.projectData)
            else await refreshProject()
            await refreshMedia()
            return result
        },
    }), [applyPendingVersion, editorProjectId, onProjectChange, refreshMedia, refreshProject])

    const discardPending = useCallback(() => runAiEditingAction({
        setError,
        setLoading: setIsDiscarding,
        action: async () => {
            return await discardPendingEditorVersion({
                editorProjectId,
                discardPendingVersion,
                onProjectChange,
            })
        },
    }), [discardPendingVersion, editorProjectId, onProjectChange])

    useEffect(() => {
        void refreshMedia().catch(() => undefined)
    }, [refreshMedia])

    return {
        media,
        isLoadingMedia,
        isImportingMedia,
        isRefining,
        isApplying,
        isDiscarding,
        error,
        clearError: () => setError(null),
        refreshMedia,
        importFile,
        importUrl,
        refine,
        applyPending,
        discardPending,
    }
}

export async function discardPendingEditorVersion({
    editorProjectId,
    discardPendingVersion,
    onProjectChange,
}: {
    editorProjectId: string
    discardPendingVersion: DiscardPendingVersion
    onProjectChange: Dispatch<SetStateAction<VideoEditorProject>>
}) {
    await discardPendingVersion({ editorProjectId })
    onProjectChange((currentProject) => ({
        ...currentProject,
        pendingVersion: null,
    }))
}

export async function runAiEditingAction<T>({
    setError,
    setLoading,
    action,
}: {
    setError: SetError
    setLoading: SetLoading
    action: () => Promise<T>
}) {
    setError(null)
    setLoading(true)
    try {
        return await action()
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setError(message)
        throw error
    } finally {
        setLoading(false)
    }
}

export async function refreshProjectAfterRefineTask({
    refineResult,
    waitForTaskResult,
    refreshProject,
    intervalMs = 1500,
    timeoutMs = 120000,
}: {
    refineResult: unknown
    waitForTaskResult: WaitForTaskResult
    refreshProject: RefreshProject
    intervalMs?: number
    timeoutMs?: number
}) {
    if (isAsyncTaskResponse(refineResult)) {
        await waitForTaskResult(refineResult.taskId, { intervalMs, timeoutMs })
    }

    return refreshProject()
}

function inferMimeTypeFromUrl(url: string) {
    const pathname = safePathname(url).toLowerCase()
    if (pathname.endsWith('.png')) return 'image/png'
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg'
    if (pathname.endsWith('.webp')) return 'image/webp'
    if (pathname.endsWith('.gif')) return 'image/gif'
    if (pathname.endsWith('.mp3')) return 'audio/mpeg'
    if (pathname.endsWith('.wav')) return 'audio/wav'
    if (pathname.endsWith('.m4a')) return 'audio/mp4'
    if (pathname.endsWith('.webm')) return 'video/webm'
    if (pathname.endsWith('.mov')) return 'video/quicktime'
    return 'video/mp4'
}

function safePathname(url: string) {
    try {
        return new URL(url).pathname
    } catch {
        return url.split('?')[0] || url
    }
}
