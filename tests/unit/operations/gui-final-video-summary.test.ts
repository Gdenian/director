import { describe, expect, it } from 'vitest'
import { normalizeFinalVideoSummary } from '@/lib/operations/domains/gui/final-video-summary'

describe('final video summary normalization', () => {
  it('surfaces completed BGM score from serialized editor project data', () => {
    const summary = normalizeFinalVideoSummary({
      id: 'editor-project-1',
      episodeId: 'episode-1',
      renderStatus: null,
      renderTaskId: null,
      outputUrl: null,
      updatedAt: new Date('2026-05-15T12:02:41.656Z'),
      projectData: JSON.stringify({
        bgmScore: {
          schemaVersion: 1,
          status: 'completed',
          taskId: 'task-bgm-1',
          editScriptId: 'edit-script-1',
          timelineSignature: 'timeline-1',
          durationSeconds: 57,
          musicModel: 'google::lyria-3-pro-preview',
          stems: [
            {
              role: 'atmosphere',
              reason: 'continuous bed',
              startSec: 0,
              durationSec: 57,
              gainDb: -8,
              fadeInSec: 0,
              fadeOutSec: 2,
              prompt: 'isolated stem',
              negativePrompt: null,
              mediaId: 'stem-media-1',
              url: '/m/stem-1',
              storageKey: 'images/music-stems/stem-1.mp3',
              mimeType: 'audio/mpeg',
              durationMs: 57000,
            },
          ],
          mix: {
            mediaId: 'mix-media-1',
            url: '/m/mix-1',
            storageKey: 'images/music/bgm-score.m4a',
            mimeType: 'audio/mp4',
            durationMs: 57000,
          },
        },
      }),
    })

    expect(summary?.bgmScore).toMatchObject({
      status: 'completed',
      durationSeconds: 57,
      mix: {
        url: '/m/mix-1',
      },
    })
    expect(summary?.bgmScore?.stems).toHaveLength(1)
  })

  it('fails explicitly for invalid serialized editor project data', () => {
    expect(() => normalizeFinalVideoSummary({
      id: 'editor-project-1',
      episodeId: 'episode-1',
      projectData: '{invalid-json',
    })).toThrow('VIDEO_EDITOR_PROJECT_DATA_INVALID')
  })
})
