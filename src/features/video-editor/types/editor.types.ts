// ========================================
// Video Editor Core Types
// Schema Version: 1.2
// ========================================

export type VideoEditorSchemaVersion = '1.0' | '1.2'
export type VideoClipKind = 'source' | 'transition_bridge'
export type VideoClipSource = 'panel' | 'lip_sync' | 'ai_transition' | 'imported'
export type ClipMediaSourceType = 'generated_panel_video' | 'generated_lip_sync_video' | 'generated_transition_bridge' | 'user_import_video' | 'user_import_image' | 'render_output'
export type SubtitleStyle = 'default' | 'cinematic'

/**
 * 剪辑项目 - 顶层结构
 */
export interface VideoEditorProject {
    id: string
    episodeId: string
    schemaVersion: '1.2'

    config: EditorConfig

    // 主时间轴 (磁性轨道) - 顺序即时间
    timeline: VideoClip[]

    // 配音轨道 (绝对定位)
    audioTrack: AudioAttachment[]

    // 字幕轨道 (绝对定位)
    subtitleCues: SubtitleCue[]

    // 编辑器拥有的派生素材
    editorAssets: EditorAssetRef[]

    // BGM 轨道 (绝对定位)
    bgmTrack: BgmClip[]

    // AI 生成但尚未应用的版本
    pendingVersion: PendingEditorVersion | null
}

/**
 * 编辑器配置
 */
export interface EditorConfig {
    fps: number
    width: number
    height: number
    videoRatio: string
    burnSubtitlesDefault: boolean
}

/**
 * 视频片段 - 时间轴核心单元
 */
export interface VideoClip {
    id: string
    kind: VideoClipKind
    src: string                    // COS URL
    durationInFrames: number       // 播放时长

    // 素材内裁剪 (可选)
    sourceTrim?: {
        fromFrame: number            // 素材起始帧
        toFrame: number              // 素材结束帧
    }

    // 转场 (与下一个片段的过渡)
    transition?: ClipTransition

    // AI 元数据 (用于回溯)
    metadata: ClipMetadata
}

/**
 * 片段附属内容 (配音 + 字幕)
 */
export interface ClipAttachment {
    audio?: {
        src: string
        volume: number
        voiceLineId?: string
    }
    subtitle?: {
        text: string
        style: SubtitleStyle
    }
}

/**
 * 转场效果
 */
export interface ClipTransition {
    type: 'none' | 'dissolve' | 'fade' | 'slide'
    durationInFrames: number
}

/**
 * 片段元数据
 */
export interface ClipMetadata {
    sourcePanelId?: string
    storyboardId: string
    voiceLineId?: string
    storyOrder?: number
    source?: VideoClipSource
    mediaSourceType?: ClipMediaSourceType
    description?: string
    editorAssetId?: string
}

export interface SubtitleCue {
    id: string
    text: string
    startFrame: number
    endFrame: number
    sourcePanelId?: string
    sourceVoiceLineId?: string
    style: SubtitleStyle
    truncated?: boolean
}

export interface AudioAttachment {
    id: string
    src: string
    startFrame: number
    durationInFrames: number
    sourceVoiceLineId?: string
    sourcePanelId?: string
    clipId?: string
    volume: number
    truncated?: boolean
}

export interface EditorAssetRef {
    id: string
    kind: 'transition_bridge' | 'render_output'
    url?: string
    status: 'pending' | 'completed' | 'failed' | 'canceled'
    taskId?: string
    mediaObjectId?: string
}

export interface PendingEditorVersion {
    versionId: string
    summary: string
    reason: string
    createdAt: string
}

/**
 * BGM 片段 - 独立轨道
 */
export interface BgmClip {
    id: string
    src: string
    startFrame: number             // 绝对定位
    durationInFrames: number
    volume: number
    fadeIn?: number
    fadeOut?: number
}

// ========================================
// 时间轴 UI 状态
// ========================================

export interface TimelineState {
    currentFrame: number
    playing: boolean
    selectedClipId: string | null
    zoom: number                   // 缩放级别 (1 = 100%)
}

// ========================================
// 计算工具类型
// ========================================

export interface ComputedClip extends VideoClip {
    startFrame: number             // 计算得出的起始帧
    endFrame: number               // 计算得出的结束帧
}

// ========================================
// API 相关类型
// ========================================

export interface SaveEditorProjectRequest {
    projectData: VideoEditorProject
}

export interface RenderRequest {
    editorProjectId: string
    format: 'mp4' | 'webm'
    quality: 'draft' | 'high'
}

export interface RenderStatus {
    status: 'pending' | 'rendering' | 'completed' | 'failed'
    progress?: number
    outputUrl?: string
    error?: string
}
