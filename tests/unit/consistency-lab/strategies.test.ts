import { describe, expect, it } from 'vitest'
import type { ConsistencyLabSourceSnapshot } from '@/lib/consistency-lab/types'
import {
  buildContactSheet9GridStrategyOutput,
  buildGridCoordinatesStrategyOutput,
  buildStructuredTextStrategyOutput,
  classifyConsistencyBlocks,
  resolveGridDensity,
} from '@/lib/consistency-lab/strategies'

function createSnapshot(): ConsistencyLabSourceSnapshot {
  return {
    schemaVersion: 1,
    projectId: 'project-1',
    episodeId: 'episode-1',
    sourceEditScriptId: 'edit-1',
    project: {
      videoRatio: '16:9',
      artStyle: 'american-comic',
      directorStyleDoc: null,
    },
    editScript: {
      id: 'edit-1',
      title: 'Temple Dialogue',
      logline: 'A novice speaks with an elder.',
      durationSec: 12,
      shotCount: 3,
      userPrompt: 'dialogue',
      screenplayText: null,
    },
    shots: [
      {
        shotNumber: 1,
        durationSec: 4,
        visualAction: 'The novice asks a question beside the table.',
        charactersAndScene: 'Novice / temple room',
        camera: 'close-up on the novice',
        videoPrompt: 'Novice speaks softly.',
        sound: 'quiet room tone',
      },
      {
        shotNumber: 2,
        durationSec: 4,
        visualAction: 'The elder listens from across the table.',
        charactersAndScene: 'Elder / temple room',
        camera: 'reaction close-up',
        videoPrompt: 'Elder listens.',
        sound: 'cloth movement',
      },
      {
        shotNumber: 3,
        durationSec: 4,
        visualAction: 'Both sit across the same table.',
        charactersAndScene: 'Novice, Elder / temple room',
        camera: 'medium two-shot',
        videoPrompt: 'Both characters across the table.',
        sound: 'soft wind',
      },
    ],
    videoBlocks: [
      {
        kind: 'group',
        blockIndex: 0,
        sourceVideoBlockId: 'edit-1:videoBlock:1',
        shotNumbers: [1, 2, 3],
        reason: 'continuous dialogue',
        prompt: 'Conversation in one temple room.',
      },
    ],
    assets: [
      {
        requirementId: 'req-novice',
        kind: 'character',
        name: 'Novice',
        description: 'Young monk.',
        shotNumbers: [1, 3],
        targetId: 'character-1',
        previewImageUrl: 'novice.jpg',
      },
      {
        requirementId: 'req-elder',
        kind: 'character',
        name: 'Elder',
        description: 'Old monk.',
        shotNumbers: [2, 3],
        targetId: 'character-2',
        previewImageUrl: 'elder.jpg',
      },
      {
        requirementId: 'req-room',
        kind: 'location',
        name: 'Temple Room',
        description: 'Room with a central table.',
        shotNumbers: [1, 2, 3],
        targetId: 'location-1',
        previewImageUrl: 'room.jpg',
      },
    ],
  }
}

describe('consistency lab strategies', () => {
  it('classifies repeated same-location two-character blocks as fixed_space_strong', () => {
    const classifications = classifyConsistencyBlocks(createSnapshot())

    expect(classifications[0]).toMatchObject({
      sourceVideoBlockId: 'edit-1:videoBlock:1',
      classification: 'fixed_space_strong',
      participantNames: ['Novice', 'Elder'],
      locationNames: ['Temple Room'],
      excludedByMotionOrAbstraction: false,
    })
  })

  it('builds structured text output with secondary presence and screen continuity', () => {
    const output = buildStructuredTextStrategyOutput(createSnapshot())
    const firstShot = output.blocks[0]?.shots[0]

    expect(output.blocks[0]?.classification).toBe('fixed_space_strong')
    expect(firstShot?.primarySubjects).toEqual(['Novice'])
    expect(firstShot?.secondaryPresence).toEqual([
      'Elder: blurred background figure or offscreen eyeline target',
    ])
    expect(firstShot?.screenContinuity).toContain('left/right relation')
  })

  it('resolves ratio-aware grid density from the short side', () => {
    expect(resolveGridDensity('16:9')).toMatchObject({ columns: 16, rows: 9 })
    expect(resolveGridDensity('9:16')).toMatchObject({ columns: 9, rows: 16 })
    expect(resolveGridDensity('21:9')).toMatchObject({ columns: 21, rows: 9 })
    expect(resolveGridDensity('1:1')).toMatchObject({ columns: 9, rows: 9 })
  })

  it('converts grid coordinates into cinematic translation before panel prompts use them', () => {
    const output = buildGridCoordinatesStrategyOutput(createSnapshot())
    const block = output.blocks[0]

    expect(block?.grid).toMatchObject({ columns: 16, rows: 9 })
    expect(block?.coordinates.some((item) => item.name === 'Novice' && item.kind === 'character')).toBe(true)
    expect(block?.cinematicTranslation).toContain('Cinematic translation')
    expect(block?.cinematicTranslation).toContain('eyeline continuity')
  })

  it('groups contact sheet cells by videoBlock with at most nine shots', () => {
    const output = buildContactSheet9GridStrategyOutput(createSnapshot())

    expect(output.groups).toHaveLength(1)
    expect(output.groups[0]?.shotNumbers).toEqual([1, 2, 3])
    expect(output.groups[0]?.cells[2]).toMatchObject({
      shotNumber: 3,
      cellIndex: 3,
      row: 1,
      column: 3,
      crop: {
        x: 2 / 3,
        y: 0,
        width: 1 / 3,
        height: 1 / 3,
      },
    })
  })
})
