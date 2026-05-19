import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { executeAiVisionStep } from '@/lib/ai-exec/engine'
import {
  buildEdgeRulerVisionPrompt,
  edgeRulerVisionLabRequestSchema,
  runEdgeRulerVisionLab,
} from '@/lib/edit-script/storyboard-consistency/edge-ruler-vision-lab'

const executeAiVisionStepMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ai-exec/engine', () => ({
  executeAiVisionStep: executeAiVisionStepMock,
}))

type VisionStepResult = Awaited<ReturnType<typeof executeAiVisionStep>>

function mockVisionResult(text: string): VisionStepResult {
  return {
    text,
    reasoning: '',
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    completion: {
      id: 'completion-1',
      object: 'chat.completion',
      created: 0,
      model: 'vision-model',
      choices: [],
    } as unknown as VisionStepResult['completion'],
  }
}

describe('edge ruler vision lab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds a prompt that tells the model to read the real edge-ruler dimensions', () => {
    const prompt = buildEdgeRulerVisionPrompt({
      prompt: 'Inspect this edge ruler image and return strict JSON.',
      columns: 21,
      rows: 9,
    })

    expect(prompt).toContain('Actual grid dimensions for this test image: 21 columns x 9 rows.')
    expect(prompt).toContain('Use [column,row] coordinates.')
    expect(prompt).toContain('top edge gives columns 1-21')
    expect(prompt).toContain('left edge gives rows 1-9')
  })

  it('calls the selected Vision model with the composed image and returns parsed JSON', async () => {
    executeAiVisionStepMock.mockResolvedValueOnce(mockVisionResult(JSON.stringify({
      understandsEdgeRuler: true,
      grid: { columns: 16, rows: 9 },
      confidence: 0.82,
      observations: [{ coordinate: [8, 5], content: 'center courtyard', confidence: 0.8 }],
      axisReadingNotes: 'Used top and left labels.',
      failureModes: [],
    })))

    const result = await runEdgeRulerVisionLab({
      userId: 'user-1',
      request: {
        model: 'openrouter::google/gemini-3.1-flash-lite-preview',
        imageDataUrl: 'data:image/png;base64,abc',
        prompt: 'Inspect this edge ruler image and return strict JSON.',
        columns: 16,
        rows: 9,
        temperature: 0.1,
      },
    })

    expect(executeAiVisionStepMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      model: 'openrouter::google/gemini-3.1-flash-lite-preview',
      imageUrls: ['data:image/png;base64,abc'],
      temperature: 0.1,
      reasoning: false,
      action: 'edge_ruler_vision_lab',
    }))
    expect(result.parsedJson).toEqual(expect.objectContaining({
      understandsEdgeRuler: true,
      confidence: 0.82,
    }))
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 })
  })

  it('rejects non-image data urls and missing model ids before calling Vision', () => {
    expect(edgeRulerVisionLabRequestSchema.safeParse({
      model: '',
      imageDataUrl: 'data:image/png;base64,abc',
      prompt: 'Inspect this edge ruler image and return strict JSON.',
      columns: 16,
      rows: 9,
      temperature: 0.1,
    }).success).toBe(false)

    expect(edgeRulerVisionLabRequestSchema.safeParse({
      model: 'openrouter::vision-model',
      imageDataUrl: 'https://example.com/image.png',
      prompt: 'Inspect this edge ruler image and return strict JSON.',
      columns: 16,
      rows: 9,
      temperature: 0.1,
    }).success).toBe(false)
  })
})
