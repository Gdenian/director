import { describe, expect, it } from 'vitest'
import { validateEditPlan } from '@/lib/novel-promotion/ai-editing/timeline-validator'

const manifest = {
  episodeId: 'episode-1',
  fps: 30,
  dimensions: { width: 1080, height: 1920 },
  clips: [
    {
      clipId: 'clip-1',
      sourcePanelId: 'panel-1',
      storyboardId: 'storyboard-1',
      storyOrder: 0,
      videoUrl: '/m/video',
      durationInFrames: 90,
      linkedToNextPanel: true,
    },
  ],
  voiceLines: [
    {
      id: 'voice-1',
      sourcePanelId: 'panel-1',
      audioUrl: '/m/audio',
      durationInFrames: 60,
      text: 'line',
    },
  ],
  editorAssets: [],
} as const

const bridgeManifest = {
  ...manifest,
  editorAssets: [
    {
      id: 'asset-bridge-1',
      kind: 'transition_bridge',
      url: '/m/bridge.mp4',
      durationInFrames: 24,
    },
  ],
} as const

describe('AI editing timeline validator', () => {
  it('rejects unknown media URLs', () => {
    const result = validateEditPlan(manifest, {
      clips: [
        {
          clipId: 'clip-x',
          sourcePanelId: 'panel-1',
          src: 'https://evil.invalid/x.mp4',
          trim: { fromFrame: 0, toFrame: 10 },
        },
      ],
      audio: [],
      subtitles: [],
      transitions: [],
      summary: 'bad url',
      risks: [],
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('Expected validation to reject unknown media URLs')
    }
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'MEDIA_URL_NOT_IN_MANIFEST' }))
  })

  it('rejects orphan subtitle cues', () => {
    const result = validateEditPlan(manifest, {
      clips: [
        {
          clipId: 'clip-1',
          sourcePanelId: 'panel-1',
          src: '/m/video',
          trim: { fromFrame: 0, toFrame: 60 },
        },
      ],
      audio: [],
      subtitles: [{ id: 'sub-1', text: 'orphan', startFrame: 0, endFrame: 10, sourcePanelId: 'missing-panel' }],
      transitions: [],
      summary: 'orphan subtitle',
      risks: [],
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('Expected validation to reject orphan subtitle cues')
    }
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'SUBTITLE_SOURCE_NOT_IN_EPISODE' }))
  })

  it('rejects audio and subtitles outside the final timeline unless they are truncated', () => {
    const result = validateEditPlan(manifest, {
      clips: [
        {
          clipId: 'clip-1',
          sourcePanelId: 'panel-1',
          src: '/m/video',
          trim: { fromFrame: 0, toFrame: 30 },
        },
      ],
      audio: [{ sourceVoiceLineId: 'voice-1', sourcePanelId: 'panel-1', startFrame: 20, durationInFrames: 20, src: '/m/audio' }],
      subtitles: [{ id: 'sub-1', text: 'late', startFrame: 20, endFrame: 40, sourcePanelId: 'panel-1', sourceVoiceLineId: 'voice-1' }],
      transitions: [],
      summary: 'out of range',
      risks: [],
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('Expected validation to reject out-of-range attachments')
    }
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'AUDIO_RANGE_OUTSIDE_TIMELINE' }),
      expect.objectContaining({ code: 'SUBTITLE_RANGE_OUTSIDE_TIMELINE' }),
    ]))
  })

  it('accepts truncated audio and subtitles when they fit the final timeline', () => {
    const result = validateEditPlan(manifest, {
      clips: [
        {
          clipId: 'clip-1',
          sourcePanelId: 'panel-1',
          src: '/m/video',
          trim: { fromFrame: 0, toFrame: 30 },
        },
      ],
      audio: [{ sourceVoiceLineId: 'voice-1', sourcePanelId: 'panel-1', startFrame: 0, durationInFrames: 30, src: '/m/audio', truncated: true }],
      subtitles: [{ id: 'sub-1', text: 'trimmed', startFrame: 0, endFrame: 30, sourcePanelId: 'panel-1', sourceVoiceLineId: 'voice-1', truncated: true }],
      transitions: [],
      summary: 'truncated',
      risks: [],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.audioTrack[0]).toMatchObject({ durationInFrames: 30, truncated: true })
    expect(result.project.subtitleCues[0]).toMatchObject({ endFrame: 30, truncated: true })
  })

  it('accepts transition bridge assets as durable editor-owned timeline clips', () => {
    const result = validateEditPlan(bridgeManifest, {
      clips: [
        {
          clipId: 'clip-1',
          sourcePanelId: 'panel-1',
          src: '/m/video',
          trim: { fromFrame: 0, toFrame: 60 },
        },
        {
          clipId: 'bridge-1',
          kind: 'transition_bridge',
          editorAssetId: 'asset-bridge-1',
          sourcePanelId: 'panel-1',
          src: '/m/bridge.mp4',
          trim: { fromFrame: 0, toFrame: 24 },
        },
      ],
      audio: [],
      subtitles: [],
      transitions: [],
      summary: 'bridge',
      risks: [],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.timeline[1]).toMatchObject({
      id: 'bridge-1',
      kind: 'transition_bridge',
      src: '/m/bridge.mp4',
      durationInFrames: 24,
      metadata: {
        source: 'ai_transition',
        editorAssetId: 'asset-bridge-1',
      },
    })
    expect(result.project.editorAssets).toEqual([
      expect.objectContaining({ id: 'asset-bridge-1', kind: 'transition_bridge', url: '/m/bridge.mp4', status: 'completed' }),
    ])
  })

  it('accepts a valid local edit plan and normalizes it to an editor project', () => {
    const result = validateEditPlan(manifest, {
      clips: [
        {
          clipId: 'clip-1',
          sourcePanelId: 'panel-1',
          src: '/m/video',
          trim: { fromFrame: 0, toFrame: 60 },
          transition: { type: 'fade', durationInFrames: 12 },
        },
      ],
      audio: [{ sourceVoiceLineId: 'voice-1', sourcePanelId: 'panel-1', startFrame: 0, durationInFrames: 60, src: '/m/audio' }],
      subtitles: [{ id: 'sub-1', text: 'line', startFrame: 0, endFrame: 60, sourcePanelId: 'panel-1', sourceVoiceLineId: 'voice-1' }],
      transitions: [],
      summary: 'valid',
      risks: [],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project).toMatchObject({
      episodeId: 'episode-1',
      schemaVersion: '1.2',
      config: { fps: 30, width: 1080, height: 1920 },
      timeline: [
        {
          id: 'clip-1',
          kind: 'source',
          src: '/m/video',
          durationInFrames: 60,
          sourceTrim: { fromFrame: 0, toFrame: 60 },
          transition: { type: 'fade', durationInFrames: 12 },
        },
      ],
      audioTrack: [{ src: '/m/audio', volume: 1, sourceVoiceLineId: 'voice-1', sourcePanelId: 'panel-1', clipId: 'clip-1' }],
      subtitleCues: [{ text: 'line', style: 'default', sourcePanelId: 'panel-1', sourceVoiceLineId: 'voice-1' }],
      editorAssets: [],
      bgmTrack: [],
      pendingVersion: null,
    })
  })
})
