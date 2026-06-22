import { describe, expect, it } from 'vitest'
import { runEditorToolOrchestrator } from '@/lib/novel-promotion/ai-editing/tool-orchestrator'
import type { VideoEditorProject } from '@/features/video-editor/types/editor.types'
import type { AiEditableMediaLibrary } from '@/lib/novel-promotion/ai-editing/tool-types'

function baseProject(): VideoEditorProject {
  return {
    id: 'editor-1',
    episodeId: 'episode-1',
    schemaVersion: '1.2',
    config: { fps: 30, width: 1920, height: 1080, videoRatio: '16:9', burnSubtitlesDefault: true },
    timeline: [{
      id: 'clip-1',
      kind: 'source',
      src: '/m/a',
      durationInFrames: 90,
      metadata: { storyboardId: 'storyboard-1', sourcePanelId: 'panel-1', storyOrder: 0, source: 'panel' },
    }],
    audioTrack: [],
    subtitleCues: [],
    editorAssets: [],
    bgmTrack: [],
    pendingVersion: null,
  }
}

function mediaLibrary(): AiEditableMediaLibrary {
  return {
    fps: 30,
    entries: [{
      id: 'user_import_video:asset-1',
      sourceType: 'user_import_video',
      kind: 'video',
      status: 'completed',
      eligibleForTimeline: true,
      url: '/m/import',
      durationInFrames: 45,
      label: 'imported',
    }],
  }
}

describe('runEditorToolOrchestrator', () => {
  it('runs a fake completion plan and returns the changed draft with summary', async () => {
    const result = await runEditorToolOrchestrator({
      project: baseProject(),
      media: mediaLibrary(),
      instruction: '在结尾插入导入视频',
      userId: 'user-1',
      model: 'test-model',
      complete: async () => JSON.stringify({
        summary: '已插入导入视频',
        toolCalls: [
          { tool: 'get_timeline', input: {} },
          { tool: 'get_media', input: {} },
          { tool: 'insert_clips', input: { end: true, mediaIds: ['user_import_video:asset-1'] } },
        ],
      }),
    })

    expect(result.changed).toBe(true)
    expect(result.summary).toBe('已插入导入视频')
    expect(result.project.timeline.map((clip) => clip.id)).toEqual(['clip-1', 'clip_asset-1'])
    expect(result.operations).toHaveLength(1)
    expect(result.operations[0]?.tool).toBe('insert_clips')
  })

  it('truncates plans after 20 tool calls and adds a warning', async () => {
    const extraReads = Array.from({ length: 22 }, () => ({ tool: 'get_timeline', input: {} }))

    const result = await runEditorToolOrchestrator({
      project: baseProject(),
      media: mediaLibrary(),
      instruction: '只查看时间线',
      userId: 'user-1',
      model: 'test-model',
      complete: async () => JSON.stringify({
        summary: '查看时间线',
        toolCalls: extraReads,
      }),
    })

    expect(result.changed).toBe(false)
    expect(result.summary).toBe('查看时间线')
    expect(result.warnings).toContain('EDITOR_TOOL_PLAN_TRUNCATED_TO_20_CALLS')
  })

  it('surfaces plan errors clearly', async () => {
    await expect(runEditorToolOrchestrator({
      project: baseProject(),
      media: mediaLibrary(),
      instruction: '旋转视频',
      userId: 'user-1',
      model: 'test-model',
      complete: async () => JSON.stringify({
        toolCalls: [
          { tool: 'get_timeline', input: {} },
          { tool: 'get_media', input: {} },
          { tool: 'rotate_clip', input: {} },
        ],
      }),
    })).rejects.toThrow('EDITOR_TOOL_PLAN_INVALID_TOOL')
  })
})
