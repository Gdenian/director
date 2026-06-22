'use client'

import { useCallback } from 'react'
import { AudioAttachment, SubtitleCue, VideoClip, VideoEditorProject } from '../types/editor.types'
import { apiFetch } from '@/lib/api-fetch'
import type { AiEditableMediaLibrary } from '@/lib/novel-promotion/ai-editing/tool-types'

interface UseEditorActionsProps {
    projectId: string
    episodeId: string
}

interface ImportMediaFileInput {
    editorProjectId: string
    file: File
    label?: string
}

interface ImportMediaUrlInput {
    editorProjectId: string
    url: string
    mimeType: string
    label?: string
}

interface RefineProjectInput {
    editorProjectId: string
    instruction: string
    targetDurationSeconds?: number
    selectedClipId?: string
}

interface PendingVersionInput {
    editorProjectId: string
    pendingVersionId: string
}

interface EditorProjectInput {
    editorProjectId: string
}

/**
 * 面板数据类型（灵活接受各种格式）
 */
interface PanelData {
    id?: string
    panelIndex?: number
    storyboardId: string
    videoUrl?: string
    description?: string
    duration?: number
}

/**
 * 从已生成的视频面板创建编辑器项目
 */
export function createProjectFromPanels(
    episodeId: string,
    panels: PanelData[],
    voiceLines?: Array<{ id: string; speaker: string; content: string; audioUrl?: string | null }>
): VideoEditorProject {
    // 过滤出有视频的面板
    const videoPanels = panels.filter(p => p.videoUrl)
    const audioTrack: AudioAttachment[] = []
    const subtitleCues: SubtitleCue[] = []
    let currentFrame = 0

    // 创建视频片段
    const timeline: VideoClip[] = videoPanels.map((panel, index) => {
        // 查找匹配的配音（简单匹配：按索引）
        const matchedVoice = voiceLines?.[index]
        const clipId = `clip_${panel.id || panel.storyboardId}_${panel.panelIndex ?? index}`
        const durationInFrames = Math.round((panel.duration || 3) * 30)
        const sourcePanelId = panel.id || `${panel.storyboardId}-${panel.panelIndex ?? index}`

        if (matchedVoice?.audioUrl) {
            audioTrack.push({
                id: `audio_${clipId}`,
                src: matchedVoice.audioUrl,
                startFrame: currentFrame,
                durationInFrames,
                sourceVoiceLineId: matchedVoice.id,
                sourcePanelId,
                clipId,
                volume: 1
            })
        }

        if (matchedVoice) {
            subtitleCues.push({
                id: `subtitle_${clipId}`,
                text: matchedVoice.content,
                startFrame: currentFrame,
                endFrame: currentFrame + durationInFrames,
                sourcePanelId,
                sourceVoiceLineId: matchedVoice.id,
                style: 'default'
            })
        }

        const clip: VideoClip = {
            id: clipId,
            kind: 'source',
            src: panel.videoUrl!,
            durationInFrames,
            transition: index < videoPanels.length - 1 ? {
                type: 'dissolve' as const,
                durationInFrames: 15 // 0.5s @ 30fps
            } : undefined,
            metadata: {
                sourcePanelId,
                storyboardId: panel.storyboardId,
                voiceLineId: matchedVoice?.id,
                storyOrder: index,
                source: 'panel',
                description: panel.description || undefined
            }
        }
        currentFrame += durationInFrames
        return clip
    })

    return {
        id: `editor_${episodeId}_${Date.now()}`,
        episodeId,
        schemaVersion: '1.2',
        config: {
            fps: 30,
            width: 1920,
            height: 1080,
            videoRatio: '16:9',
            burnSubtitlesDefault: true
        },
        timeline,
        audioTrack,
        subtitleCues,
        editorAssets: [],
        bgmTrack: [],
        pendingVersion: null
    }
}

export function useEditorActions({ projectId, episodeId }: UseEditorActionsProps) {
    const editorQuery = useCallback((editorProjectId?: string) => {
        const params = new URLSearchParams({ episodeId })
        if (editorProjectId) params.set('editorProjectId', editorProjectId)
        return params.toString()
    }, [episodeId])

    /**
     * 保存项目到服务器
     */
    const saveProject = useCallback(async (project: VideoEditorProject) => {
        const response = await apiFetch(`/api/novel-promotion/${projectId}/editor`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ episodeId, projectData: project })
        })

        if (!response.ok) {
            throw new Error('Failed to save project')
        }

        return response.json()
    }, [episodeId, projectId])

    /**
     * 加载项目
     */
    const loadProject = useCallback(async (): Promise<VideoEditorProject | null> => {
        const response = await apiFetch(`/api/novel-promotion/${projectId}/editor?episodeId=${episodeId}`)

        if (!response.ok) {
            if (response.status === 404) return null
            throw new Error('Failed to load project')
        }

        const data = await response.json()
        return data.projectData
    }, [projectId, episodeId])

    /**
     * 发起渲染导出
     */
    const startRender = useCallback(async (editorProjectId: string) => {
        const response = await apiFetch(`/api/novel-promotion/${projectId}/editor/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                editorProjectId,
                format: 'mp4',
                quality: 'high'
            })
        })

        if (!response.ok) {
            throw new Error('Failed to start render')
        }

        return response.json()
    }, [projectId])

    /**
     * 获取渲染状态
     */
    const getRenderStatus = useCallback(async (editorProjectId: string) => {
        const response = await apiFetch(
            `/api/novel-promotion/${projectId}/editor/render?id=${editorProjectId}`
        )

        if (!response.ok) {
            throw new Error('Failed to get render status')
        }

        return response.json()
    }, [projectId])

    const listMedia = useCallback(async (editorProjectId: string): Promise<AiEditableMediaLibrary> => {
        const response = await apiFetch(
            `/api/novel-promotion/${projectId}/editor/media?${editorQuery(editorProjectId)}`
        )

        if (!response.ok) {
            throw new Error('Failed to list editor media')
        }

        const data = await response.json()
        return data.media
    }, [editorQuery, projectId])

    const importMediaFile = useCallback(async ({ editorProjectId, file, label }: ImportMediaFileInput) => {
        const body = new FormData()
        body.set('episodeId', episodeId)
        body.set('editorProjectId', editorProjectId)
        body.set('file', file)
        if (label) body.set('label', label)

        const response = await apiFetch(`/api/novel-promotion/${projectId}/editor/media`, {
            method: 'POST',
            body
        })

        if (!response.ok) {
            throw new Error('Failed to import editor media file')
        }

        return response.json()
    }, [episodeId, projectId])

    const importMediaUrl = useCallback(async ({ editorProjectId, url, mimeType, label }: ImportMediaUrlInput) => {
        const response = await apiFetch(`/api/novel-promotion/${projectId}/editor/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ episodeId, editorProjectId, url, mimeType, label })
        })

        if (!response.ok) {
            throw new Error('Failed to import editor media URL')
        }

        return response.json()
    }, [episodeId, projectId])

    const refineProject = useCallback(async ({
        editorProjectId,
        instruction,
        targetDurationSeconds,
        selectedClipId
    }: RefineProjectInput) => {
        const response = await apiFetch(`/api/novel-promotion/${projectId}/editor/refine`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                episodeId,
                editorProjectId,
                instruction,
                targetDurationSeconds,
                selectedClipId
            })
        })

        if (!response.ok) {
            throw new Error('Failed to submit AI edit refinement')
        }

        return response.json()
    }, [episodeId, projectId])

    const applyPendingVersion = useCallback(async ({ editorProjectId, pendingVersionId }: PendingVersionInput): Promise<{
        success: boolean
        editorProjectId: string
        projectData?: VideoEditorProject
    }> => {
        const response = await apiFetch(`/api/novel-promotion/${projectId}/editor/refine/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ episodeId, editorProjectId, pendingVersionId })
        })

        if (!response.ok) {
            throw new Error('Failed to apply pending editor version')
        }

        return response.json()
    }, [episodeId, projectId])

    const discardPendingVersion = useCallback(async ({ editorProjectId }: EditorProjectInput): Promise<{
        success: boolean
        editorProjectId: string
        projectData?: VideoEditorProject
    }> => {
        const response = await apiFetch(`/api/novel-promotion/${projectId}/editor/refine/discard`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ episodeId, editorProjectId })
        })

        if (!response.ok) {
            throw new Error('Failed to discard pending editor version')
        }

        return response.json()
    }, [episodeId, projectId])

    return {
        saveProject,
        loadProject,
        startRender,
        getRenderStatus,
        listMedia,
        importMediaFile,
        importMediaUrl,
        refineProject,
        applyPendingVersion,
        discardPendingVersion
    }
}
