import { describe, expect, it } from 'vitest'
import type { ConsistencyLabSourceSnapshot } from '@/lib/consistency-lab/types'
import {
  buildStructuredTextStrategyOutput,
  classifyConsistencyBlocks,
} from '@/lib/consistency-lab/strategies'

function baseSnapshot(overrides: Partial<ConsistencyLabSourceSnapshot> = {}): ConsistencyLabSourceSnapshot {
  const snapshot: ConsistencyLabSourceSnapshot = {
    schemaVersion: 1,
    projectId: 'project-1',
    episodeId: 'episode-1',
    sourceEditScriptId: 'edit-1',
    project: {
      videoRatio: '16:9',
      artStyle: null,
      directorStyleDoc: null,
    },
    editScript: {
      id: 'edit-1',
      title: 'Regression',
      logline: null,
      durationSec: 8,
      shotCount: 2,
      userPrompt: 'test',
      screenplayText: null,
    },
    shots: [
      {
        shotNumber: 1,
        durationSec: 4,
        visualAction: 'Little monk speaks alone in frame.',
        charactersAndScene: 'Little monk / room',
        camera: 'close-up',
        videoPrompt: 'Little monk speaks.',
        sound: 'room tone',
      },
      {
        shotNumber: 2,
        durationSec: 4,
        visualAction: 'Old monk answers across the same table.',
        charactersAndScene: 'Old monk / room',
        camera: 'reverse close-up',
        videoPrompt: 'Old monk answers.',
        sound: 'room tone',
      },
    ],
    videoBlocks: [
      {
        kind: 'group',
        blockIndex: 0,
        sourceVideoBlockId: 'edit-1:videoBlock:1',
        shotNumbers: [1, 2],
        reason: 'dialogue',
        prompt: 'A continuous fixed-room dialogue.',
      },
    ],
    assets: [
      {
        requirementId: 'little',
        kind: 'character',
        name: 'Little monk',
        description: 'Young monk.',
        shotNumbers: [1],
        targetId: 'character-1',
        previewImageUrl: null,
      },
      {
        requirementId: 'old',
        kind: 'character',
        name: 'Old monk',
        description: 'Old monk.',
        shotNumbers: [2],
        targetId: 'character-2',
        previewImageUrl: null,
      },
      {
        requirementId: 'room',
        kind: 'location',
        name: 'Room',
        description: 'Shared room.',
        shotNumbers: [1, 2],
        targetId: 'location-1',
        previewImageUrl: null,
      },
    ],
  }
  return { ...snapshot, ...overrides }
}

describe('consistency lab fixed-space regression', () => {
  it('keeps the counterpart present in fixed-space solo dialogue prompts', () => {
    const output = buildStructuredTextStrategyOutput(baseSnapshot())
    const firstShot = output.blocks[0]?.shots[0]

    expect(firstShot?.primarySubjects).toEqual(['Little monk'])
    expect(firstShot?.secondaryPresence.join('\n')).toContain('Old monk')
    expect(firstShot?.depthOfField).toContain('secondary counterpart')
  })

  it('does not force fixed-space continuity for chase, dream, or object-only cases', () => {
    const snapshot = baseSnapshot({
      videoBlocks: [
        {
          kind: 'group',
          blockIndex: 0,
          sourceVideoBlockId: 'edit-1:videoBlock:1',
          shotNumbers: [1, 2],
          reason: 'dream chase montage',
          prompt: 'Dream chase montage with object-only cutaway.',
        },
      ],
    })
    const classifications = classifyConsistencyBlocks(snapshot)

    expect(classifications[0]?.classification).toBe('no_fixed_space')
    expect(classifications[0]?.excludedByMotionOrAbstraction).toBe(true)
  })
})
