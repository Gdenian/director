import { z } from 'zod'
import { executeAiVisionStep } from '@/lib/ai-exec/engine'
import { DEFAULT_EDGE_RULER_VISION_PROMPT } from './edge-ruler-vision-prompt'

const MAX_IMAGE_DATA_URL_LENGTH = 18_000_000

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue }

export const edgeRulerVisionLabRequestSchema = z.object({
  model: z.string().trim().min(1),
  imageDataUrl: z.string().trim().startsWith('data:image/').max(MAX_IMAGE_DATA_URL_LENGTH),
  prompt: z.string().trim().min(20).max(12000).default(DEFAULT_EDGE_RULER_VISION_PROMPT),
  columns: z.number().int().min(4).max(32).default(16),
  rows: z.number().int().min(4).max(24).default(9),
  temperature: z.number().min(0).max(1).default(0.1),
})

export type EdgeRulerVisionLabRequest = z.infer<typeof edgeRulerVisionLabRequestSchema>

export interface EdgeRulerVisionLabResult {
  readonly model: string
  readonly rawText: string
  readonly parsedJson: JsonValue | null
  readonly usage: {
    readonly promptTokens: number
    readonly completionTokens: number
    readonly totalTokens: number
  }
}

function parseJsonObject(text: string): JsonValue | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as JsonValue
  } catch {
    const firstBrace = trimmed.indexOf('{')
    const lastBrace = trimmed.lastIndexOf('}')
    if (firstBrace < 0 || lastBrace <= firstBrace) return null
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as JsonValue
    } catch {
      return null
    }
  }
}

export function buildEdgeRulerVisionPrompt(input: {
  readonly prompt: string
  readonly columns: number
  readonly rows: number
}): string {
  return [
    input.prompt.trim(),
    '',
    `Actual grid dimensions for this test image: ${input.columns} columns x ${input.rows} rows.`,
    `Use [column,row] coordinates. The top edge gives columns 1-${input.columns}; the left edge gives rows 1-${input.rows}.`,
  ].join('\n')
}

export async function runEdgeRulerVisionLab(input: {
  readonly userId: string
  readonly request: EdgeRulerVisionLabRequest
}): Promise<EdgeRulerVisionLabResult> {
  const result = await executeAiVisionStep({
    userId: input.userId,
    model: input.request.model,
    prompt: buildEdgeRulerVisionPrompt({
      prompt: input.request.prompt,
      columns: input.request.columns,
      rows: input.request.rows,
    }),
    imageUrls: [input.request.imageDataUrl],
    temperature: input.request.temperature,
    reasoning: false,
    action: 'edge_ruler_vision_lab',
    meta: {
      stepId: 'edge-ruler-vision-lab',
      stepTitle: 'Analyze edge ruler coordinate test image',
      stepIndex: 1,
      stepTotal: 1,
    },
  })

  return {
    model: input.request.model,
    rawText: result.text,
    parsedJson: parseJsonObject(result.text),
    usage: result.usage,
  }
}
