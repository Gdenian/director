import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeAiTextStep, executeAiVisionStep } from '@/lib/ai-exec/engine'
import {
  analyzeGridCoordinates,
  generateGridFloorPlan,
} from '@/lib/edit-script/storyboard-consistency/model-generation'
import { classifyStoryboardConsistencyBlocks, resolveGridDensity } from '@/lib/edit-script/storyboard-consistency/strategies'
import type { StoryboardConsistencySourceSnapshot } from '@/lib/edit-script/storyboard-consistency/types'

vi.mock('@/lib/ai-prompts', () => ({
  AI_PROMPT_IDS: {
    EDIT_SCRIPT_STORYBOARD_GRID_FLOOR_PLAN: 'edit-script-storyboard-grid-floor-plan',
    EDIT_SCRIPT_STORYBOARD_GRID_VISION: 'edit-script-storyboard-grid-vision',
  },
  buildAiPrompt: vi.fn((input: { readonly promptId: string }) => `prompt:${input.promptId}`),
}))

vi.mock('@/lib/ai-exec/engine', () => ({
  executeAiTextStep: vi.fn(),
  executeAiVisionStep: vi.fn(),
}))

const textStepMock = vi.mocked(executeAiTextStep)
const visionStepMock = vi.mocked(executeAiVisionStep)

function mockTextCompletion(text: string): Awaited<ReturnType<typeof executeAiTextStep>> {
  return {
    text,
    reasoning: '',
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    completion: {
      id: 'completion-1',
      object: 'chat.completion',
      created: 0,
      model: 'analysis-model',
      choices: [],
    } as Awaited<ReturnType<typeof executeAiTextStep>>['completion'],
  }
}

function mockVisionCompletion(text: string): Awaited<ReturnType<typeof executeAiVisionStep>> {
  return {
    text,
    reasoning: '',
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    completion: {
      id: 'completion-1',
      object: 'chat.completion',
      created: 0,
      model: 'analysis-model',
      choices: [],
    } as Awaited<ReturnType<typeof executeAiVisionStep>>['completion'],
  }
}

function buildSnapshot(overrides: Partial<StoryboardConsistencySourceSnapshot> = {}): StoryboardConsistencySourceSnapshot {
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
      logline: 'A monk teaches a young disciple.',
      durationSec: 10,
      shotCount: 2,
      userPrompt: 'temple lesson',
      screenplayText: null,
    },
    shots: [
      {
        shotNumber: 1,
        durationSec: 5,
        visualAction: 'Old monk speaks beside the flower bed.',
        charactersAndScene: 'Old monk and young disciple in the same temple courtyard.',
        camera: 'medium close-up',
        videoPrompt: 'Dialogue over the flower bed.',
        sound: 'quiet wind',
      },
      {
        shotNumber: 2,
        durationSec: 5,
        visualAction: 'Young disciple listens and answers.',
        charactersAndScene: 'Young disciple and old monk remain in the temple courtyard.',
        camera: 'reverse medium close-up',
        videoPrompt: 'Reverse dialogue over the flower bed.',
        sound: 'soft reply',
      },
    ],
    videoBlocks: [
      {
        kind: 'group',
        shotNumbers: [1, 2],
        reason: 'two-person dialogue in one fixed courtyard',
        prompt: 'A two-person dialogue around one flower bed.',
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
      {
        requirementId: 'loc-1',
        kind: 'location',
        name: 'Temple courtyard',
        description: 'courtyard with a central flower bed',
        shotNumbers: [1, 2],
        targetId: 'location-1',
        previewImageUrl: 'https://cdn.example.com/courtyard.png',
      },
    ],
    ...overrides,
  }
}

describe('edit-script storyboard coordinate consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('derives grid density from the project video ratio', () => {
    expect(resolveGridDensity('16:9')).toEqual({ columns: 16, rows: 9, ratio: '16:9', shortSideUnits: 9 })
    expect(resolveGridDensity('9:16')).toEqual({ columns: 9, rows: 16, ratio: '9:16', shortSideUnits: 9 })
    expect(resolveGridDensity('21:9')).toEqual({ columns: 21, rows: 9, ratio: '21:9', shortSideUnits: 9 })
    expect(resolveGridDensity('1:1')).toEqual({ columns: 9, rows: 9, ratio: '1:1', shortSideUnits: 9 })
  })

  it('classifies repeated two-person locations as fixed-space and skips chase or montage language', () => {
    const [dialogue] = classifyStoryboardConsistencyBlocks(buildSnapshot())
    expect(dialogue).toMatchObject({
      classification: 'fixed_space_strong',
      participantNames: ['Old monk', 'Young disciple'],
      locationNames: ['Temple courtyard'],
    })

    const [chase] = classifyStoryboardConsistencyBlocks(buildSnapshot({
      videoBlocks: [{
        ...buildSnapshot().videoBlocks[0],
        prompt: 'A fast chase montage through the courtyard.',
      }],
    }))
    expect(chase?.classification).toBe('no_fixed_space')
    expect(chase?.excludedByMotionOrAbstraction).toBe(true)
  })

  it('uses the LLM to prepare floor-plan prompts and does not invent coordinates in prepare', async () => {
    textStepMock.mockResolvedValueOnce(mockTextCompletion(JSON.stringify({
        strategyOutput: {
          strategy: 'grid_coordinates',
          grid: { columns: 16, rows: 9, ratio: '16:9', shortSideUnits: 9 },
          floorPlans: [{
            sourceVideoBlockId: 'edit-1:videoBlock:1',
            groupIndex: 0,
            classification: 'fixed_space_strong',
            location: 'Temple courtyard',
            participants: ['Old monk', 'Young disciple'],
            anchors: ['flower bed'],
            skipped: false,
            reason: 'Fixed two-person dialogue around one anchor.',
            prompt: 'Top-down 2D floor plan of a temple courtyard with a central flower bed.',
          }],
        },
      })))

    const output = await generateGridFloorPlan({
      userId: 'user-1',
      projectId: 'project-1',
      model: 'analysis-model',
      locale: 'zh',
      snapshot: buildSnapshot(),
    })

    expect(textStepMock).toHaveBeenCalledTimes(1)
    expect(output.floorPlans[0]).toMatchObject({
      sourceVideoBlockId: 'edit-1:videoBlock:1',
      prompt: 'Top-down 2D floor plan of a temple courtyard with a central flower bed.',
    })
    expect('coordinates' in output.floorPlans[0]).toBe(false)
  })

  it('requires overlay images for coordinate analysis and returns cinematic panel prompts', async () => {
    await expect(analyzeGridCoordinates({
      userId: 'user-1',
      projectId: 'project-1',
      model: 'analysis-model',
      locale: 'zh',
      snapshot: buildSnapshot(),
      floorPlanArtifacts: [],
      overlayImageUrls: [],
    })).rejects.toThrow('EDIT_SCRIPT_STORYBOARD_GRID_OVERLAY_IMAGE_REQUIRED')

    visionStepMock.mockResolvedValueOnce(mockVisionCompletion(JSON.stringify({
        strategyOutput: {
          strategy: 'grid_coordinates',
          blocks: [{
            sourceVideoBlockId: 'edit-1:videoBlock:1',
            cinematicTranslation: 'Old monk stays screen left, disciple stays screen right, with the flower bed between them.',
          }],
        },
        panels: [
          {
            panelIndex: 0,
            sourceShotNumber: 1,
            sourceVideoBlockId: 'edit-1:videoBlock:1',
            prompt: 'Medium close-up. Old monk foreground left speaks; young disciple remains visible as a blurred right background listener.',
          },
          {
            panelIndex: 1,
            sourceShotNumber: 2,
            sourceVideoBlockId: 'edit-1:videoBlock:1',
            prompt: 'Reverse medium close-up. Young disciple foreground right answers; old monk remains a soft left-edge shoulder silhouette.',
          },
        ],
      })))

    const result = await analyzeGridCoordinates({
      userId: 'user-1',
      projectId: 'project-1',
      model: 'analysis-model',
      locale: 'zh',
      snapshot: buildSnapshot(),
      floorPlanArtifacts: [{ id: 'artifact-1', kind: 'grid_coordinate_overlay' }],
      overlayImageUrls: ['https://cdn.example.com/overlay.png'],
    })

    expect(visionStepMock).toHaveBeenCalledWith(expect.objectContaining({
      imageUrls: ['https://cdn.example.com/overlay.png'],
    }))
    expect(result.strategyOutput).toMatchObject({
      blocks: [expect.objectContaining({
        cinematicTranslation: expect.stringContaining('screen left'),
      })],
    })
    expect(result.panels).toHaveLength(2)
    expect(result.panels[0]?.prompt).toContain('blurred right background listener')
  })
})
