import { describe, expect, it } from 'vitest'
import {
  normalizeEditAssetRequirements,
  normalizeEditScriptCore,
  resolveEditScriptDefaults,
} from '@/lib/edit-script/normalize'

describe('edit script normalization', () => {
  it('keeps the minimum edit table fields and enforces continuous shot numbers', () => {
    const normalized = normalizeEditScriptCore({
      title: 'Orbital Silence',
      durationSec: 60,
      shots: [
        {
          shotNumber: 1,
          durationSec: 5,
          visualAction: 'A pilot crosses a white corridor.',
          charactersAndScene: 'Pilot / White Corridor',
          camera: 'locked wide shot, slow push in',
          videoPrompt: 'A pilot in a sterile white corridor, locked wide shot.',
          sound: 'low air-conditioning hum',
        },
        {
          shotNumber: 2,
          durationSec: 4,
          visualAction: 'The corridor opens to a red observation room.',
          charactersAndScene: 'Pilot / Red Observation Room',
          camera: 'centered medium shot, slow dolly',
          videoPrompt: 'A red observation room revealed with a centered dolly.',
          sound: 'sub-bass pulse',
        },
      ],
      videoBlocks: [
        { type: 'group', shotNumbers: [1, 2], gridMode: '2x2', reason: 'continuous corridor movement', prompt: 'final continuous corridor prompt' },
      ],
    })

    expect(normalized.shotCount).toBe(2)
    expect(normalized.durationSec).toBe(9)
    expect(normalized.videoBlocks).toEqual([
      { kind: 'group', shotNumbers: [1, 2], gridMode: '2x2', reason: 'continuous corridor movement', prompt: 'final continuous corridor prompt' },
    ])
    expect(normalized.shots[0]).toEqual({
      shotNumber: 1,
      durationSec: 5,
      visualAction: 'A pilot crosses a white corridor.',
      charactersAndScene: 'Pilot / White Corridor',
      camera: 'locked wide shot, slow push in',
      videoPrompt: 'A pilot in a sterile white corridor, locked wide shot.',
      sound: 'low air-conditioning hum',
    })
  })

  it('rejects gaps in shot numbering', () => {
    expect(() => normalizeEditScriptCore({
      title: 'Gap',
      durationSec: 60,
      shots: [
        {
          shotNumber: 1,
          durationSec: 4,
          visualAction: 'First.',
          charactersAndScene: 'A / Room',
          camera: 'wide',
          videoPrompt: 'first',
          sound: 'tone',
        },
        {
          shotNumber: 3,
          durationSec: 4,
          visualAction: 'Third.',
          charactersAndScene: 'A / Room',
          camera: 'wide',
          videoPrompt: 'third',
          sound: 'tone',
        },
      ],
      videoBlocks: [
        { type: 'group', shotNumbers: [1, 3], gridMode: '2x2', reason: 'invalid gap should fail earlier', prompt: 'invalid gap prompt' },
      ],
    })).toThrow('EDIT_SCRIPT_SHOT_NUMBER_NOT_CONTINUOUS')
  })

  it('rejects edit-first shots longer than five seconds', () => {
    expect(() => normalizeEditScriptCore({
      title: 'Too Long',
      durationSec: 6,
      shots: [
        {
          shotNumber: 1,
          durationSec: 6,
          visualAction: 'One shot holds too long.',
          charactersAndScene: 'A / Room',
          camera: 'wide',
          videoPrompt: 'long shot',
          sound: 'tone',
        },
      ],
      videoBlocks: [
        { type: 'single', shotNumbers: [1], reason: 'single long shot', prompt: 'single long prompt' },
      ],
    })).toThrow()
  })

  it('rejects videoBlocks whose grouped duration exceeds Seedance 2.0 limit', () => {
    expect(() => normalizeEditScriptCore({
      title: 'Too Long Group',
      durationSec: 17,
      shots: [
        {
          shotNumber: 1,
          durationSec: 5,
          visualAction: 'First move.',
          charactersAndScene: 'A / Room',
          camera: 'wide',
          videoPrompt: 'first',
          sound: 'tone',
        },
        {
          shotNumber: 2,
          durationSec: 4,
          visualAction: 'Second move.',
          charactersAndScene: 'A / Room',
          camera: 'wide',
          videoPrompt: 'second',
          sound: 'tone',
        },
        {
          shotNumber: 3,
          durationSec: 3,
          visualAction: 'Third move.',
          charactersAndScene: 'A / Room',
          camera: 'wide',
          videoPrompt: 'third',
          sound: 'tone',
        },
        {
          shotNumber: 4,
          durationSec: 5,
          visualAction: 'Fourth move.',
          charactersAndScene: 'A / Room',
          camera: 'wide',
          videoPrompt: 'fourth',
          sound: 'tone',
        },
      ],
      videoBlocks: [
        { type: 'group', shotNumbers: [1, 2, 3, 4], gridMode: '2x2', reason: 'too long for one Seedance segment', prompt: 'too long group prompt' },
      ],
    })).toThrow('VIDEO_BLOCK_PLAN_GROUP_DURATION_UNSUPPORTED:17')
  })

  it('extracts only character and location requirements linked to real shots', () => {
    const shots = normalizeEditScriptCore({
      title: 'Assets',
      durationSec: 16,
      shots: [
        {
          shotNumber: 1,
          durationSec: 4,
          visualAction: 'Pilot waits.',
          charactersAndScene: 'Pilot / Dock',
          camera: 'wide',
          videoPrompt: 'pilot at dock',
          sound: 'hum',
        },
        {
          shotNumber: 2,
          durationSec: 4,
          visualAction: 'Pilot enters.',
          charactersAndScene: 'Pilot / Dock',
          camera: 'medium',
          videoPrompt: 'pilot enters dock',
          sound: 'door',
        },
      ],
      videoBlocks: [
        { type: 'group', shotNumbers: [1, 2], gridMode: '2x2', reason: 'shared dock motion', prompt: 'shared dock prompt' },
      ],
    }).shots

    const assets = normalizeEditAssetRequirements({
      assets: [
        {
          kind: 'character',
          name: 'Pilot',
          description: 'A quiet astronaut in a minimal pressure suit.',
          shotNumbers: [2, 1, 2],
        },
        {
          kind: 'location',
          name: 'Dock',
          description: 'A sterile orbital docking bay with red warning light.',
          shotNumbers: [1, 3],
        },
      ],
    }, shots)

    expect(assets).toEqual([
      {
        kind: 'character',
        name: 'Pilot',
        description: 'A quiet astronaut in a minimal pressure suit.',
        shotNumbers: [1, 2],
        status: 'pending',
        targetId: null,
        errorMessage: null,
      },
      {
        kind: 'location',
        name: 'Dock',
        description: 'A sterile orbital docking bay with red warning light.',
        shotNumbers: [1],
        status: 'pending',
        targetId: null,
        errorMessage: null,
      },
    ])
  })

  it('defaults short-film requests to 60 seconds without prescribing shot count', () => {
    expect(resolveEditScriptDefaults('给我一个库布里克风格科幻短片')).toEqual({
      durationSeconds: 60,
    })
    expect(resolveEditScriptDefaults('给我一个一分钟科幻短片')).toEqual({
      durationSeconds: 60,
    })
  })
})
