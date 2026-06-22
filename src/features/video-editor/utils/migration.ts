import { logWarn as _ulogWarn } from '@/lib/logging/core'
import {
    AudioAttachment,
    BgmClip,
    ClipTransition,
    EditorConfig,
    EditorAssetRef,
    SubtitleCue,
    VideoClip,
    VideoEditorProject
} from '../types/editor.types'

function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value ? value : undefined
}

function readNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function inferVideoRatio(width: number, height: number): string {
    if (width === height) return '1:1'
    if (height > width) return '9:16'
    if (Math.abs(width / height - 4 / 3) < 0.02) return '4:3'
    return '16:9'
}

function normalizeConfig(value: unknown): EditorConfig {
    const config = toRecord(value)
    const width = readNumber(config.width, 1920)
    const height = readNumber(config.height, 1080)
    return {
        fps: readNumber(config.fps, 30),
        width,
        height,
        videoRatio: readString(config.videoRatio) || inferVideoRatio(width, height),
        burnSubtitlesDefault: config.burnSubtitlesDefault === false ? false : true,
    }
}

function normalizeSourceTrim(value: unknown, legacyValue?: unknown): VideoClip['sourceTrim'] {
    const trim = toRecord(value)
    if (typeof trim.fromFrame === 'number' && typeof trim.toFrame === 'number') {
        return {
            fromFrame: Math.max(0, Math.floor(trim.fromFrame)),
            toFrame: Math.max(0, Math.floor(trim.toFrame)),
        }
    }

    const legacyTrim = toRecord(legacyValue)
    if (typeof legacyTrim.from !== 'number' || typeof legacyTrim.to !== 'number') return undefined
    return {
        fromFrame: Math.max(0, Math.floor(legacyTrim.from)),
        toFrame: Math.max(0, Math.floor(legacyTrim.to)),
    }
}

function normalizeTransition(value: unknown): ClipTransition | undefined {
    const transition = toRecord(value)
    const type = transition.type
    if (type !== 'none' && type !== 'dissolve' && type !== 'fade' && type !== 'slide') {
        return undefined
    }
    return {
        type,
        durationInFrames: Math.max(0, Math.floor(readNumber(transition.durationInFrames, 0))),
    }
}

function normalizeClipMetadata(value: unknown, index: number): VideoClip['metadata'] {
    const metadata = toRecord(value)
    const source = metadata.source === 'lip_sync' || metadata.source === 'ai_transition' || metadata.source === 'imported' ? metadata.source : 'panel'
    const mediaSourceType =
        metadata.mediaSourceType === 'generated_panel_video' ||
            metadata.mediaSourceType === 'generated_lip_sync_video' ||
            metadata.mediaSourceType === 'generated_transition_bridge' ||
            metadata.mediaSourceType === 'user_import_video' ||
            metadata.mediaSourceType === 'user_import_image' ||
            metadata.mediaSourceType === 'render_output'
            ? metadata.mediaSourceType
            : undefined
    return {
        sourcePanelId: readString(metadata.sourcePanelId) || readString(metadata.panelId),
        storyboardId: readString(metadata.storyboardId) || '',
        voiceLineId: readString(metadata.voiceLineId),
        storyOrder: readNumber(metadata.storyOrder, index),
        source,
        mediaSourceType,
        description: readString(metadata.description),
        editorAssetId: readString(metadata.editorAssetId),
    }
}

function normalizeClip(clip: Record<string, unknown>, index: number): VideoClip {
    const durationInFrames = Math.max(1, Math.floor(readNumber(clip.durationInFrames, 90)))
    const kind = clip.kind === 'transition_bridge' ? 'transition_bridge' : 'source'
    return {
        id: readString(clip.id) || `clip_${index}`,
        kind,
        src: readString(clip.src) || '',
        durationInFrames,
        sourceTrim: normalizeSourceTrim(clip.sourceTrim, clip.trim),
        transition: normalizeTransition(clip.transition),
        metadata: normalizeClipMetadata(clip.metadata, index),
    }
}

function normalizeAudioTrack(value: unknown): AudioAttachment[] {
    if (!Array.isArray(value)) return []
    return value.map((item, index): AudioAttachment => {
        const audio = toRecord(item)
        return {
            id: readString(audio.id) || `audio_${index}`,
            src: readString(audio.src) || '',
            startFrame: Math.max(0, Math.floor(readNumber(audio.startFrame, 0))),
            durationInFrames: Math.max(1, Math.floor(readNumber(audio.durationInFrames, 1))),
            sourceVoiceLineId: readString(audio.sourceVoiceLineId),
            sourcePanelId: readString(audio.sourcePanelId),
            clipId: readString(audio.clipId),
            volume: readNumber(audio.volume, 1),
            truncated: audio.truncated === true ? true : undefined,
        }
    })
}

function normalizeSubtitleCues(value: unknown): SubtitleCue[] {
    if (!Array.isArray(value)) return []
    return value.map((item, index): SubtitleCue => {
        const subtitle = toRecord(item)
        const startFrame = Math.max(0, Math.floor(readNumber(subtitle.startFrame, 0)))
        const endFrame = Math.max(startFrame + 1, Math.floor(readNumber(subtitle.endFrame, startFrame + 1)))
        return {
            id: readString(subtitle.id) || `subtitle_${index}`,
            text: readString(subtitle.text) || '',
            startFrame,
            endFrame,
            sourcePanelId: readString(subtitle.sourcePanelId),
            sourceVoiceLineId: readString(subtitle.sourceVoiceLineId),
            style: subtitle.style === 'cinematic' ? 'cinematic' : 'default',
            truncated: subtitle.truncated === true ? true : undefined,
        }
    })
}

function normalizeEditorAssets(value: unknown): EditorAssetRef[] {
    if (!Array.isArray(value)) return []
    return value.map((item, index): EditorAssetRef => {
        const asset = toRecord(item)
        const status = asset.status === 'pending' || asset.status === 'failed' || asset.status === 'canceled'
            ? asset.status
            : 'completed'
        return {
            id: readString(asset.id) || `asset_${index}`,
            kind: asset.kind === 'render_output' ? 'render_output' : 'transition_bridge',
            url: readString(asset.url),
            status,
            taskId: readString(asset.taskId),
            mediaObjectId: readString(asset.mediaObjectId),
        }
    })
}

function migrateOnePointZero(project: Record<string, unknown>): VideoEditorProject {
    const legacyTimeline = Array.isArray(project.timeline)
        ? project.timeline as Array<Record<string, unknown>>
        : []
    const audioTrack: AudioAttachment[] = []
    const subtitleCues: SubtitleCue[] = []
    let currentFrame = 0

    const timeline = legacyTimeline.map((clip, index): VideoClip => {
        const clipId = readString(clip.id) || `clip_${index}`
        const durationInFrames = Math.max(1, Math.floor(readNumber(clip.durationInFrames, 90)))
        const attachment = toRecord(clip.attachment)
        const audio = toRecord(attachment.audio)
        const subtitle = toRecord(attachment.subtitle)
        const metadata = toRecord(clip.metadata)
        const sourcePanelId = readString(metadata.panelId)
        const sourceVoiceLineId = readString(audio.voiceLineId)

        if (audio.src) {
            audioTrack.push({
                id: `audio_${clipId}`,
                src: String(audio.src),
                startFrame: currentFrame,
                durationInFrames,
                sourceVoiceLineId,
                sourcePanelId,
                clipId,
                volume: readNumber(audio.volume, 1),
            })
        }

        if (subtitle.text) {
            subtitleCues.push({
                id: `subtitle_${clipId}`,
                text: String(subtitle.text),
                startFrame: currentFrame,
                endFrame: currentFrame + durationInFrames,
                sourcePanelId,
                sourceVoiceLineId,
                style: subtitle.style === 'cinematic' ? 'cinematic' : 'default',
            })
        }

        const migratedClip = normalizeClip({ ...clip, id: clipId, durationInFrames }, index)
        migratedClip.metadata.sourcePanelId = sourcePanelId
        migratedClip.metadata.voiceLineId = sourceVoiceLineId
        migratedClip.metadata.storyOrder = index

        currentFrame += durationInFrames
        return migratedClip
    })

    return {
        id: readString(project.id) || `editor_${Date.now()}`,
        episodeId: readString(project.episodeId) || '',
        schemaVersion: '1.2',
        config: normalizeConfig(project.config),
        timeline,
        audioTrack,
        subtitleCues,
        editorAssets: [],
        bgmTrack: Array.isArray(project.bgmTrack) ? project.bgmTrack as BgmClip[] : [],
        pendingVersion: null,
    }
}

/**
 * 版本迁移函数
 * 将旧版本数据升级到最新版本
 */
export function migrateProjectData(data: unknown): VideoEditorProject {
    const project = data as Record<string, unknown>

    // 检查 schema 版本
    const version = project.schemaVersion as string

    switch (version) {
        case '1.0':
            return migrateOnePointZero(project)

        case '1.2':
            const base = migrateOnePointZero(project)
            return {
                ...base,
                ...project,
                schemaVersion: '1.2',
                config: normalizeConfig(project.config),
                timeline: Array.isArray(project.timeline)
                    ? (project.timeline as Array<Record<string, unknown>>).map(normalizeClip)
                    : base.timeline,
                audioTrack: normalizeAudioTrack(project.audioTrack),
                subtitleCues: normalizeSubtitleCues(project.subtitleCues),
                editorAssets: normalizeEditorAssets(project.editorAssets),
                bgmTrack: Array.isArray(project.bgmTrack) ? project.bgmTrack as BgmClip[] : [],
                pendingVersion: project.pendingVersion ?? null,
            } as VideoEditorProject

        default:
            // 未知版本或无版本，尝试作为 1.0 处理
            _ulogWarn(`Unknown schema version: ${version}, treating as 1.0`)
            return migrateOnePointZero(project)
    }
}

/**
 * 验证项目数据完整性
 */
export function validateProjectData(data: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    const project = data as Record<string, unknown>

    if (!project.id) errors.push('Missing project id')
    if (!project.episodeId) errors.push('Missing episodeId')
    if (!project.schemaVersion) errors.push('Missing schemaVersion')
    if (!project.config) errors.push('Missing config')
    if (!Array.isArray(project.timeline)) errors.push('Invalid timeline')
    if (!Array.isArray(project.bgmTrack)) errors.push('Invalid bgmTrack')

    return {
        valid: errors.length === 0,
        errors
    }
}
