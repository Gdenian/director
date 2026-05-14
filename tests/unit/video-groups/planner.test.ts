import { describe, expect, it } from 'vitest'
import {
  buildVideoGenerationPlanInstruction,
  normalizeVideoGenerationPlanResponse,
  parseVideoGenerationPlanText,
} from '@/lib/video-groups/planner'
import { DEFAULT_GROUP_VIDEO_MODEL } from '@/lib/ai-exec/video-defaults'

describe('video generation planner', () => {
  it('normalizes mixed single and group plans in edit-first order', () => {
    const plan = normalizeVideoGenerationPlanResponse({
      allShotNumbers: [1, 2, 3, 4, 5],
      response: {
        items: [
          { type: 'single', shotNumbers: [1], reason: 'static product shot', prompt: 'single prompt 1' },
          { type: 'group', shotNumbers: [2, 3, 4], gridMode: '2x2', reason: 'continuous fight movement', prompt: 'group prompt 2-4' },
          { type: 'single', shotNumbers: [5], reason: 'space jumps', prompt: 'single prompt 5' },
        ],
      },
    })

    expect(plan.items).toEqual([
      { kind: 'single', shotNumbers: [1], reason: 'static product shot', prompt: 'single prompt 1' },
      { kind: 'group', shotNumbers: [2, 3, 4], gridMode: '2x2', reason: 'continuous fight movement', prompt: 'group prompt 2-4' },
      { kind: 'single', shotNumbers: [5], reason: 'space jumps', prompt: 'single prompt 5' },
    ])
  })

  it('fails when the plan skips or reorders edit-first shots', () => {
    expect(() => normalizeVideoGenerationPlanResponse({
      allShotNumbers: [1, 2, 3],
      response: {
        items: [
          { type: 'single', shotNumbers: [1], reason: 'ok', prompt: 'prompt 1' },
          { type: 'single', shotNumbers: [3], reason: 'skip', prompt: 'prompt 3' },
        ],
      },
    })).toThrow('VIDEO_GENERATION_PLAN_SHOT_COVERAGE_INVALID')
  })

  it('requires final prompts for every planned video block', () => {
    expect(() => normalizeVideoGenerationPlanResponse({
      allShotNumbers: [1],
      response: {
        items: [{ type: 'single', shotNumbers: [1], reason: 'missing prompt' }],
      },
    })).toThrow('VIDEO_GENERATION_PLAN_PROMPT_REQUIRED')
  })

  it('rejects invalid group sizes and wrong grid modes', () => {
    expect(() => normalizeVideoGenerationPlanResponse({
      allShotNumbers: [1],
      response: {
        items: [{ type: 'group', shotNumbers: [1], gridMode: '2x2', reason: 'too short', prompt: 'group prompt' }],
      },
    })).toThrow('VIDEO_GROUP_SHOT_COUNT_UNSUPPORTED')

    expect(() => normalizeVideoGenerationPlanResponse({
      allShotNumbers: [1, 2, 3, 4, 5],
      response: {
        items: [{ type: 'group', shotNumbers: [1, 2, 3, 4, 5], gridMode: '2x2', reason: 'wrong grid', prompt: 'group prompt' }],
      },
    })).toThrow('VIDEO_GENERATION_PLAN_GRID_MODE_MISMATCH')
  })

  it('parses repaired JSON text and builds the centralized plan prompt', () => {
    const plan = parseVideoGenerationPlanText({
      allShotNumbers: [1, 2],
      text: '```json\n{"items":[{"type":"group","shotNumbers":[1,2],"gridMode":"2x2","reason":"shared motion","prompt":"final continuous prompt"}]}\n```',
    })
    const prompt = buildVideoGenerationPlanInstruction({
      title: 'Launch Film',
      logline: 'A fast product reveal.',
      aspectRatio: '9:16',
      locale: 'en',
      shots: [
        {
          shotNumber: 1,
          durationSec: 2,
          visualAction: 'Door opens.',
          camera: 'push',
          videoPrompt: 'door open',
          sound: 'hit',
        },
      ],
    })

    expect(plan.items[0]).toEqual({ kind: 'group', shotNumbers: [1, 2], gridMode: '2x2', reason: 'shared motion', prompt: 'final continuous prompt' })
    expect(prompt).toContain('Prefer group by default')
    expect(prompt).toContain('Every item must include prompt')
    expect(prompt).toContain('2-15 seconds total')
    expect(DEFAULT_GROUP_VIDEO_MODEL).toBe('ark::doubao-seedance-2-0-260128')
  })
})
