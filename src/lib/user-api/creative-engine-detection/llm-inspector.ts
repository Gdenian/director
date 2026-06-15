import OpenAI from 'openai'
import { z } from 'zod'
import type { CreativeEngineDetectionResult, CreativeEngineDetectRequest } from './types'

type InspectorPurpose = 'llm' | 'image' | 'video' | 'audio' | 'lipsync' | 'voice-design' | 'unknown'

type InspectorPayloadInput = CreativeEngineDetectRequest & {
  probeLogs: string[]
  responseSamples: string[]
}

type InspectorCallInput = InspectorPayloadInput
type InspectorConfig = {
  provider: 'openai-compatible'
  model: string
  apiKey: string
  baseURL?: string
}

const INSPECTOR_PURPOSE_MAP: Record<InspectorPurpose, CreativeEngineDetectionResult['models'][number]['purpose']> = {
  llm: 'text',
  image: 'image-generation',
  video: 'video-generation',
  audio: 'voice-generation',
  lipsync: 'lip-sync',
  'voice-design': 'voice-design',
  unknown: 'unknown',
}

const InspectorOutputSchema = z.object({
  source: z.string().min(1),
  recommendedProviderKey: z.string().min(1),
  protocolType: z.enum(['openai-compatible', 'gemini-compatible', 'official', 'manual-template']),
  normalizedBaseUrl: z.string().url(),
  confidence: z.enum(['high', 'medium', 'low']),
  models: z.array(z.object({
    name: z.string().min(1),
    callName: z.string().min(1),
    purpose: z.enum(['llm', 'image', 'video', 'audio', 'lipsync', 'voice-design', 'unknown']),
    confidence: z.enum(['high', 'medium', 'low']),
  })).min(1),
  warnings: z.array(z.string()),
})

export const INSPECTOR_SYSTEM_PROMPT = [
  '你是创作引擎识别助手。',
  '你只能生成配置草稿。不能声称已经保存，不能推荐默认创作方案，不能自动分配模型。',
  '只返回 JSON，不要返回 Markdown。',
  '模型 purpose 只能是 llm、image、video、audio、lipsync、voice-design、unknown。',
].join('\n')

function shortSecret(secret: string) {
  const trimmed = secret.trim()
  if (trimmed.length <= 8) return '[REDACTED]'
  return `${trimmed.slice(0, 3)}...${trimmed.slice(-4)}`
}

function readEnvString(key: string) {
  const value = process.env[key]
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

export function resolveInspectorConfig(): InspectorConfig | null {
  const provider = readEnvString('CREATIVE_ENGINE_INSPECTOR_PROVIDER') || 'openai-compatible'
  const model = readEnvString('CREATIVE_ENGINE_INSPECTOR_MODEL')
  const apiKey = readEnvString('CREATIVE_ENGINE_INSPECTOR_API_KEY')
  const baseURL = readEnvString('CREATIVE_ENGINE_INSPECTOR_BASE_URL') || undefined
  if (provider !== 'openai-compatible') return null
  if (!model || !apiKey) return null
  return { provider, model, apiKey, baseURL }
}

export function redactSecret(value: string, secret: string) {
  const trimmed = secret.trim()
  if (!trimmed) return value
  return value.split(trimmed).join(shortSecret(trimmed))
}

export function buildInspectorPayload(input: InspectorPayloadInput) {
  const safeProbeLogs = input.allowKeyInInspector
    ? input.probeLogs
    : input.probeLogs.map((item) => redactSecret(item, input.apiKey))
  const safeResponseSamples = input.allowKeyInInspector
    ? input.responseSamples
    : input.responseSamples.map((item) => redactSecret(item, input.apiKey))

  return {
    serviceUrl: input.serviceUrl,
    apiKey: input.allowKeyInInspector ? input.apiKey : shortSecret(input.apiKey),
    allowKeyInInspector: input.allowKeyInInspector,
    probeLogs: safeProbeLogs,
    responseSamples: safeResponseSamples,
  }
}

export function parseInspectorOutput(rawOutput: string): CreativeEngineDetectionResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawOutput)
  } catch {
    throw new Error('INSPECTOR_OUTPUT_INVALID')
  }

  const validated = InspectorOutputSchema.safeParse(parsed)
  if (!validated.success) {
    throw new Error('INSPECTOR_OUTPUT_INVALID')
  }

  return {
    source: validated.data.source,
    recommendedProviderKey: validated.data.recommendedProviderKey,
    protocolType: validated.data.protocolType,
    normalizedBaseUrl: validated.data.normalizedBaseUrl,
    confidence: validated.data.confidence,
    models: validated.data.models.map((model) => ({
      name: model.name,
      callName: model.callName,
      purpose: INSPECTOR_PURPOSE_MAP[model.purpose],
      confidence: model.confidence,
    })),
    warnings: validated.data.warnings,
    risks: [],
    requiresManualModelEntry: validated.data.protocolType === 'manual-template',
  }
}

export async function inspectCreativeEngine(input: InspectorCallInput): Promise<CreativeEngineDetectionResult | null> {
  const config = resolveInspectorConfig()
  if (!config) return null

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: 30_000,
  })
  const completion = await client.chat.completions.create({
    model: config.model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: INSPECTOR_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(buildInspectorPayload(input)) },
    ],
  })
  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error('INSPECTOR_OUTPUT_INVALID')
  return parseInspectorOutput(content)
}
