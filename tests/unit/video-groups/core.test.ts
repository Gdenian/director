import { describe, expect, it } from 'vitest'
import {
  buildVideoGroupPromptInstruction,
  chunkVideoGroupShots,
  inferVideoGridModeForShotCount,
  validateVideoGroupShotNumbers,
} from '@/lib/video-groups/core'

describe('video group core', () => {
  it('validates partial contiguous 2x2 and 3x3 shot ranges', () => {
    expect(validateVideoGroupShotNumbers({ gridMode: '2x2', shotNumbers: [1, 2] })).toEqual([1, 2])
    expect(validateVideoGroupShotNumbers({ gridMode: '2x2', shotNumbers: [1, 2, 3] })).toEqual([1, 2, 3])
    expect(validateVideoGroupShotNumbers({ gridMode: '2x2', shotNumbers: [1, 2, 3, 4] })).toEqual([1, 2, 3, 4])
    expect(validateVideoGroupShotNumbers({ gridMode: '3x3', shotNumbers: [1, 2, 3, 4, 5, 6, 7] })).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(validateVideoGroupShotNumbers({ gridMode: '3x3', shotNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9] })).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(() => validateVideoGroupShotNumbers({ gridMode: '2x2', shotNumbers: [1, 2, 4, 5] })).toThrow('VIDEO_GROUP_SHOT_NUMBERS_NOT_CONTINUOUS')
    expect(() => validateVideoGroupShotNumbers({ gridMode: '2x2', shotNumbers: [1] })).toThrow('VIDEO_GROUP_SHOT_COUNT_MISMATCH')
    expect(() => validateVideoGroupShotNumbers({ gridMode: '2x2', shotNumbers: [1, 2, 3, 4, 5] })).toThrow('VIDEO_GROUP_SHOT_COUNT_MISMATCH')
  })

  it('chunks full and final partial grid groups in edit-first order', () => {
    expect(chunkVideoGroupShots({ gridMode: '2x2', shotNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9] })).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ])
    expect(chunkVideoGroupShots({ gridMode: '2x2', shotNumbers: [1, 2, 3, 4, 5, 6, 7] })).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7],
    ])
    expect(chunkVideoGroupShots({ gridMode: '3x3', shotNumbers: [1, 2, 3, 4] })).toEqual([[1, 2, 3, 4]])
  })

  it('infers the compact reference grid mode from group size', () => {
    expect(inferVideoGridModeForShotCount(2)).toBe('2x2')
    expect(inferVideoGridModeForShotCount(4)).toBe('2x2')
    expect(inferVideoGridModeForShotCount(5)).toBe('3x3')
    expect(inferVideoGridModeForShotCount(9)).toBe('3x3')
    expect(() => inferVideoGridModeForShotCount(1)).toThrow('VIDEO_GROUP_SHOT_COUNT_UNSUPPORTED')
  })

  it('builds a prompt-writer instruction that forbids split-screen output', () => {
    const prompt = buildVideoGroupPromptInstruction({
      title: 'River Film',
      logline: 'A journey through mist.',
      aspectRatio: '9:16',
      gridMode: '2x2',
      styleContext: 'cinematic',
      shots: [
        {
          shotNumber: 1,
          durationSec: 2,
          visualAction: 'Mist opens over the river.',
          charactersAndScene: 'River',
          camera: 'wide aerial',
          videoPrompt: 'misty river',
          sound: 'soft wind',
        },
        {
          shotNumber: 2,
          durationSec: 3,
          visualAction: 'A traveler steps forward.',
          charactersAndScene: 'Traveler',
          camera: 'low tracking',
          videoPrompt: 'traveler walking',
          sound: 'footsteps',
        },
        {
          shotNumber: 3,
          durationSec: 4,
          visualAction: 'Light crosses water.',
          charactersAndScene: 'River',
          camera: 'push in',
          videoPrompt: 'gold light',
          sound: 'water',
        },
        {
          shotNumber: 4,
          durationSec: 5,
          visualAction: 'The vista resolves.',
          charactersAndScene: 'Mountains',
          camera: 'pull back',
          videoPrompt: 'mountain vista',
          sound: 'low strings',
        },
      ],
    }, 'zh')

    expect(prompt).toContain('最终视频必须是全屏连续电影画面')
    expect(prompt).toContain('绝对不要生成 2x2、3x3、拼贴图或分屏画面')
    expect(prompt).toContain('左上 = Shot 1')
    expect(prompt).toContain('右下 = Shot 4')
    expect(prompt).toContain('[00:00-00:02] Shot 1')
    expect(prompt).toContain('[00:09-00:14] Shot 4')
  })

  it('marks unused grid cells as ignored placeholders in prompt instructions', () => {
    const prompt = buildVideoGroupPromptInstruction({
      title: 'River Film',
      gridMode: '2x2',
      shots: [
        {
          shotNumber: 1,
          durationSec: 2,
          visualAction: 'Mist opens.',
          camera: 'wide',
          videoPrompt: 'mist',
          sound: 'wind',
        },
        {
          shotNumber: 2,
          durationSec: 2,
          visualAction: 'Traveler moves.',
          camera: 'track',
          videoPrompt: 'traveler',
          sound: 'steps',
        },
      ],
    }, 'en')

    expect(prompt).toContain('top-left = Shot 1')
    expect(prompt).toContain('bottom-left = Empty placeholder, ignore')
    expect(prompt).toContain('Ignore them completely')
  })
})
