import { describe, expect, it } from 'vitest'
import { assertRequiredLocationPreviews } from '@/lib/edit-script/storyboard-consistency/service'
import type { StoryboardConsistencySourceSnapshot } from '@/lib/edit-script/storyboard-consistency/types'

function buildSourceSnapshot(overrides: Partial<StoryboardConsistencySourceSnapshot> = {}): StoryboardConsistencySourceSnapshot {
  return {
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
      title: 'Temple Lesson',
      logline: 'A monk teaches a disciple.',
      durationSec: 10,
      shotCount: 2,
      userPrompt: 'temple lesson',
      screenplayText: null,
    },
    shots: [
      {
        shotNumber: 1,
        durationSec: 5,
        visualAction: 'Old monk speaks to a young disciple in the temple courtyard.',
        charactersAndScene: 'Old monk and young disciple in the temple courtyard.',
        camera: 'medium shot',
        videoPrompt: 'Two-person courtyard dialogue.',
        sound: 'quiet wind',
      },
      {
        shotNumber: 2,
        durationSec: 5,
        visualAction: 'Young disciple replies while keeping the same spatial relation.',
        charactersAndScene: 'Young disciple and old monk in the temple courtyard.',
        camera: 'reverse medium shot',
        videoPrompt: 'Reverse courtyard dialogue.',
        sound: 'soft reply',
      },
    ],
    videoBlocks: [
      {
        kind: 'group',
        shotNumbers: [1, 2],
        reason: 'two-person dialogue in one fixed courtyard',
        prompt: 'A two-person dialogue in the same temple courtyard.',
        blockIndex: 0,
        sourceVideoBlockId: 'edit-1:videoBlock:1',
      },
    ],
    assets: [
      {
        requirementId: 'char-1',
        kind: 'character',
        name: 'Old monk',
        description: 'elderly monk',
        shotNumbers: [1, 2],
        targetId: 'character-1',
        previewImageUrl: 'https://cdn.example.com/old-monk.png',
      },
      {
        requirementId: 'char-2',
        kind: 'character',
        name: 'Young disciple',
        description: 'young disciple',
        shotNumbers: [1, 2],
        targetId: 'character-2',
        previewImageUrl: 'https://cdn.example.com/disciple.png',
      },
    ],
    ...overrides,
  }
}

describe('storyboard consistency service prechecks', () => {
  it('rejects fixed-space coordinate generation when no scene reference image is available', () => {
    expect(() => assertRequiredLocationPreviews({
      sourceSnapshot: buildSourceSnapshot(),
    })).toThrow('Location reference images are required before coordinate storyboard generation: scene asset')
  })

  it('allows fixed-space coordinate generation when the matching scene reference image exists', () => {
    expect(() => assertRequiredLocationPreviews({
      sourceSnapshot: buildSourceSnapshot({
        assets: [
          ...buildSourceSnapshot().assets,
          {
            requirementId: 'loc-1',
            kind: 'location',
            name: 'Temple courtyard',
            description: 'courtyard with a flower bed',
            shotNumbers: [1, 2],
            targetId: 'location-1',
            previewImageUrl: 'https://cdn.example.com/courtyard.png',
          },
        ],
      }),
    })).not.toThrow()
  })
})
