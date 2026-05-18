import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConsistencyLabSourceSnapshot } from '@/lib/consistency-lab/types'

const aiExecMock = vi.hoisted(() => ({
  executeAiTextStep: vi.fn(),
  executeAiVisionStep: vi.fn(),
}))

vi.mock('@/lib/ai-exec/engine', () => aiExecMock)

import {
  analyzeGridCoordinates,
  generateGridFloorPlan,
  generateStructuredTextPlan,
} from '@/lib/consistency-lab/model-generation'

function snapshot(): ConsistencyLabSourceSnapshot {
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
      title: 'Temple Dialogue',
      logline: null,
      durationSec: 8,
      shotCount: 2,
      userPrompt: 'two monks speak',
      screenplayText: null,
    },
    shots: [
      {
        shotNumber: 1,
        durationSec: 4,
        visualAction: 'The novice speaks alone in close-up.',
        charactersAndScene: 'Novice in temple room',
        camera: 'close-up',
        videoPrompt: 'Novice speaks.',
        sound: '',
      },
      {
        shotNumber: 2,
        durationSec: 4,
        visualAction: 'The elder answers.',
        charactersAndScene: 'Elder in temple room',
        camera: 'reverse close-up',
        videoPrompt: 'Elder answers.',
        sound: '',
      },
    ],
    videoBlocks: [
      {
        kind: 'group',
        blockIndex: 0,
        sourceVideoBlockId: 'edit-1:videoBlock:1',
        shotNumbers: [1, 2],
        reason: 'dialogue',
        prompt: 'Two monks speak across a table in the same temple room.',
      },
    ],
    assets: [
      {
        requirementId: 'req-novice',
        kind: 'character',
        name: 'Novice',
        description: 'young monk',
        shotNumbers: [1, 2],
        targetId: 'char-1',
        previewImageUrl: 'novice.png',
      },
      {
        requirementId: 'req-elder',
        kind: 'character',
        name: 'Elder',
        description: 'old monk',
        shotNumbers: [1, 2],
        targetId: 'char-2',
        previewImageUrl: 'elder.png',
      },
      {
        requirementId: 'req-room',
        kind: 'location',
        name: 'Temple Room',
        description: 'room with table',
        shotNumbers: [1, 2],
        targetId: 'loc-1',
        previewImageUrl: 'room.png',
      },
    ],
  }
}

const context = {
  userId: 'user-1',
  projectId: 'project-1',
  model: 'analysis-model',
  locale: 'en' as const,
}

describe('consistency lab model generation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls LLM for structured text and preserves counterpart presence in generated panel prompts', async () => {
    aiExecMock.executeAiTextStep.mockResolvedValue({
      text: JSON.stringify({
        strategyOutput: {
          strategy: 'structured_text',
          blocks: [{
            sourceVideoBlockId: 'edit-1:videoBlock:1',
            classification: 'fixed_space_strong',
            reason: 'dialogue in one room',
            location: 'Temple Room',
            participants: ['Novice', 'Elder'],
            anchors: ['table'],
            spatialRelation: 'Novice left, Elder right across the table.',
            screenContinuity: 'Preserve left/right relation.',
            shots: [],
          }],
        },
        panels: [
          {
            panelIndex: 0,
            sourceShotNumber: 1,
            sourceVideoBlockId: 'edit-1:videoBlock:1',
            prompt: 'Novice sharp in close-up, Elder remains as blurred background counterpart and offscreen eyeline target.',
          },
          {
            panelIndex: 1,
            sourceShotNumber: 2,
            sourceVideoBlockId: 'edit-1:videoBlock:1',
            prompt: 'Elder sharp in reverse close-up, Novice remains as foreground shoulder to preserve continuity.',
          },
        ],
      }),
      reasoning: '',
      usage: null,
      completion: {},
    })

    const result = await generateStructuredTextPlan({ ...context, snapshot: snapshot() })

    expect(aiExecMock.executeAiTextStep).toHaveBeenCalledTimes(1)
    expect(result.panels[0]?.prompt).toContain('blurred background counterpart')
    expect(result.panels[1]?.prompt).toContain('foreground shoulder')
  })

  it('grid prepare only creates floor plan prompts and does not invent coordinates', async () => {
    aiExecMock.executeAiTextStep.mockResolvedValue({
      text: JSON.stringify({
        strategyOutput: {
          strategy: 'grid_coordinates',
          grid: { columns: 16, rows: 9, ratio: '16:9', shortSideUnits: 9 },
          floorPlans: [{
            sourceVideoBlockId: 'edit-1:videoBlock:1',
            groupIndex: 0,
            classification: 'fixed_space_strong',
            location: 'Temple Room',
            participants: ['Novice', 'Elder'],
            anchors: ['table'],
            skipped: false,
            reason: 'fixed dialogue',
            prompt: 'Clean top-down 2D floor plan of the temple room with central table.',
          }],
        },
      }),
      reasoning: '',
      usage: null,
      completion: {},
    })

    const result = await generateGridFloorPlan({ ...context, snapshot: snapshot() })

    expect(result.floorPlans[0]?.prompt).toContain('top-down 2D floor plan')
    expect(JSON.stringify(result)).not.toContain('"coordinates"')
  })

  it('grid coordinate analysis requires overlay images before it can create panel prompts', async () => {
    await expect(analyzeGridCoordinates({
      ...context,
      snapshot: snapshot(),
      floorPlanArtifacts: [],
      overlayImageUrls: [],
    })).rejects.toThrow('CONSISTENCY_LAB_GRID_OVERLAY_IMAGE_REQUIRED')
  })
})
