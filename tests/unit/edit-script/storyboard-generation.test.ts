import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const txMock = vi.hoisted(() => ({
  projectClip: {
    create: vi.fn(),
  },
  projectStoryboard: {
    create: vi.fn(),
  },
}))

const prismaMock = vi.hoisted(() => ({
  projectEditScript: {
    findFirst: vi.fn(),
  },
  projectCharacter: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  projectLocation: {
    findFirst: vi.fn(),
  },
  task: {
    findFirst: vi.fn(),
  },
  projectStoryboard: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  projectPanel: {
    create: vi.fn(),
  },
  $transaction: vi.fn(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock)),
}))

const configMock = vi.hoisted(() => ({
  getProjectModelConfig: vi.fn(),
}))

const runtimeConfigMock = vi.hoisted(() => ({
  resolveModelSelection: vi.fn(),
}))

const operationMock = vi.hoisted(() => ({
  executeProjectAgentOperationFromApi: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/config-service', () => configMock)
vi.mock('@/lib/user-api/runtime-config', () => runtimeConfigMock)
vi.mock('@/lib/adapters/api/execute-project-agent-operation', () => operationMock)
vi.mock('@/lib/ai-exec/engine', () => ({ executeAiTextStep: vi.fn() }))
vi.mock('@/lib/billing', () => ({ withTextBilling: vi.fn(), buildDefaultTaskBillingInfo: vi.fn() }))
vi.mock('@/lib/assets/services/asset-actions', () => ({ submitAssetGenerateTask: vi.fn() }))

import { generateProjectEditScriptStoryboard } from '@/lib/edit-script/service'

function createRequest(): NextRequest {
  return new Request('http://localhost/api/projects/project-1/edit-script/storyboard/generate', {
    method: 'POST',
    headers: { 'accept-language': 'zh' },
  }) as unknown as NextRequest
}

describe('generateProjectEditScriptStoryboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configMock.getProjectModelConfig.mockResolvedValue({ storyboardModel: 'image-model' })
    runtimeConfigMock.resolveModelSelection.mockResolvedValue({ id: 'image-model' })
    operationMock.executeProjectAgentOperationFromApi.mockResolvedValue({ taskId: 'task-1', status: 'queued' })
    prismaMock.task.findFirst.mockResolvedValue(null)
  })

  it('converts completed edit-script shots into storyboard panels and submits panel image tasks', async () => {
    prismaMock.projectEditScript.findFirst.mockResolvedValue({
      id: 'edit-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: 'one minute sci-fi',
      title: 'Orbital Silence',
      logline: 'A pilot meets a machine intelligence.',
      durationSec: 60,
      shotCount: 1,
      status: 'ready',
      shotsJson: [
        {
          shotNumber: 1,
          durationSec: 60,
          visualAction: 'Pilot watches the station rotate.',
          charactersAndScene: 'Pilot / Station',
          camera: 'locked symmetrical wide shot',
          videoPrompt: 'A pilot watches a rotating space station.',
          sound: 'low air hum',
        },
      ],
      requirements: [
        {
          id: 'req-character',
          kind: 'character',
          name: 'Pilot',
          description: 'A quiet astronaut.',
          shotIndexes: [1],
          status: 'completed',
          targetId: 'character-1',
          errorMessage: null,
        },
        {
          id: 'req-location',
          kind: 'location',
          name: 'Station',
          description: 'A rotating orbital station.',
          shotIndexes: [1],
          status: 'completed',
          targetId: 'location-1',
          errorMessage: null,
        },
      ],
    })
    prismaMock.projectCharacter.findFirst.mockResolvedValue({
      id: 'character-1',
      appearances: [
        {
          id: 'appearance-1',
          imageUrl: 'images/character.jpg',
          imageMediaId: null,
          imageUrls: JSON.stringify(['images/character.jpg']),
        },
      ],
    })
    prismaMock.projectLocation.findFirst.mockResolvedValue({
      id: 'location-1',
      images: [
        {
          imageUrl: 'images/location.jpg',
          imageMediaId: null,
        },
      ],
    })
    prismaMock.projectCharacter.findMany.mockResolvedValue([
      {
        id: 'character-1',
        name: 'Pilot',
        appearances: [
          {
            id: 'appearance-1',
            appearanceIndex: 0,
            changeReason: 'primary',
          },
        ],
      },
    ])
    prismaMock.projectStoryboard.findFirst.mockResolvedValue(null)
    txMock.projectClip.create.mockResolvedValue({ id: 'clip-1' })
    txMock.projectStoryboard.create.mockResolvedValue({
      id: 'storyboard-1',
      clipId: 'clip-1',
      panels: [],
    })
    prismaMock.projectPanel.create.mockResolvedValue({
      id: 'panel-1',
      panelIndex: 0,
      imageUrl: null,
      candidateImages: null,
    })
    prismaMock.projectStoryboard.update.mockResolvedValue({ id: 'storyboard-1' })

    const result = await generateProjectEditScriptStoryboard({
      request: createRequest(),
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      editScriptId: 'edit-1',
    })

    expect(result).toEqual({
      storyboardId: 'storyboard-1',
      panelCount: 1,
      submittedImageTasks: 1,
    })
    expect(prismaMock.projectPanel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storyboardId: 'storyboard-1',
        panelIndex: 0,
        panelNumber: 1,
        shotType: 'locked symmetrical wide shot',
        cameraMove: 'locked symmetrical wide shot',
        location: 'Station',
        videoPrompt: 'A pilot watches a rotating space station.',
      }),
    })
    const panelCreateData = prismaMock.projectPanel.create.mock.calls[0]?.[0]?.data
    expect(panelCreateData?.characters).toBe(JSON.stringify([
      {
        characterId: 'character-1',
        name: 'Pilot',
        appearanceId: 'appearance-1',
        appearanceIndex: 0,
        appearance: 'primary',
      },
    ]))
    expect(operationMock.executeProjectAgentOperationFromApi).toHaveBeenCalledWith(expect.objectContaining({
      operationId: 'regenerate_panel_image',
      projectId: 'project-1',
      userId: 'user-1',
      input: {
        panelId: 'panel-1',
        count: 1,
      },
    }))
  })
})
