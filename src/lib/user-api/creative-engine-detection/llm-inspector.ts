import OpenAI from 'openai'
import { z } from 'zod'
import type { MediaContract } from '@/lib/media-contract/types'
import type { OpenAICompatMediaTemplate, TemplateBodyValue } from '@/lib/openai-compat-media-template'
import { validateOpenAICompatMediaTemplate } from '@/lib/user-api/model-template'
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

const TemplateBodyValueSchema: z.ZodType<TemplateBodyValue> = z.lazy(() => z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(TemplateBodyValueSchema),
  z.record(TemplateBodyValueSchema),
]))

const TemplateEndpointSchema: z.ZodType<OpenAICompatMediaTemplate['create']> = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().min(1),
  contentType: z.enum(['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded']).optional(),
  headers: z.record(z.string()).optional(),
  bodyTemplate: TemplateBodyValueSchema.optional(),
  multipartFileFields: z.array(z.string().min(1)).optional(),
})

const CompatMediaTemplateSchema: z.ZodType<OpenAICompatMediaTemplate> = z.object({
  version: z.literal(1),
  mediaType: z.enum(['image', 'video']),
  mode: z.enum(['sync', 'async']),
  create: TemplateEndpointSchema,
  status: TemplateEndpointSchema.optional(),
  content: TemplateEndpointSchema.optional(),
  response: z.object({
    taskIdPath: z.string().optional(),
    statusPath: z.string().optional(),
    outputUrlPath: z.string().optional(),
    outputUrlsPath: z.string().optional(),
    errorPath: z.string().optional(),
  }),
  polling: z.object({
    intervalMs: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    doneStates: z.array(z.string().min(1)),
    failStates: z.array(z.string().min(1)),
  }).optional(),
})

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
    mediaContract: z.object({
      version: z.literal(1),
      mediaType: z.enum(['image', 'video']),
      executor: z.enum(['official-adapter', 'openai-standard', 'gemini-standard', 'openai-compat-template']),
      capabilities: z.array(z.enum([
        'text-to-image',
        'image-to-image',
        'image-edit',
        'text-to-video',
        'image-to-video',
        'first-last-frame-video',
      ])),
      input: z.object({
        image: z.enum(['publicUrl', 'dataUrlBase64', 'rawBase64', 'multipartFile']).optional(),
        images: z.enum(['publicUrlArray', 'dataUrlBase64Array', 'rawBase64Array', 'multipartFiles']).optional(),
        lastFrameImage: z.enum(['publicUrl', 'dataUrlBase64', 'rawBase64', 'multipartFile']).optional(),
      }),
      output: z.object({
        kind: z.enum(['url', 'urlArray', 'base64', 'asyncTask']),
        urlPath: z.string().optional(),
        urlsPath: z.string().optional(),
        base64Path: z.string().optional(),
      }),
      testStatus: z.object({
        textToImage: z.enum(['unchecked', 'passed', 'failed', 'unavailable']).optional(),
        imageToImage: z.enum(['unchecked', 'passed', 'failed', 'unavailable']).optional(),
        imageEdit: z.enum(['unchecked', 'passed', 'failed', 'unavailable']).optional(),
        textToVideo: z.enum(['unchecked', 'passed', 'failed', 'unavailable']).optional(),
        imageToVideo: z.enum(['unchecked', 'passed', 'failed', 'unavailable']).optional(),
        firstLastFrameVideo: z.enum(['unchecked', 'passed', 'failed', 'unavailable']).optional(),
      }).optional(),
      checkedAt: z.string().optional(),
      source: z.enum(['rule', 'provider-list', 'llm', 'manual', 'official-adapter']).optional(),
    }).optional(),
    compatMediaTemplate: CompatMediaTemplateSchema.optional(),
    compatMediaTemplateSource: z.enum(['ai', 'manual']).optional(),
    mediaContractSource: z.enum(['rule', 'provider-list', 'llm', 'manual', 'official-adapter']).optional(),
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

export function redactKeyLikeSecrets(value: string) {
  return value
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, (secret) => shortSecret(secret))
    .replace(/\bAIza[A-Za-z0-9_-]{6,}\b/g, (secret) => shortSecret(secret))
    .replace(/\bxai-[A-Za-z0-9_-]{6,}\b/g, (secret) => shortSecret(secret))
    .replace(/\bgsk_[A-Za-z0-9_-]{6,}\b/g, (secret) => shortSecret(secret))
    .replace(/\bBearer\s+([A-Za-z0-9._~+/=-]{16,})\b/g, (_match, token: string) => `Bearer ${shortSecret(token)}`)
}

function redactInspectorText(value: string, secret = '') {
  return redactKeyLikeSecrets(redactSecret(value, secret))
}

function sanitizeString(value: string) {
  return redactKeyLikeSecrets(value)
}

function sanitizeJsonStrings<T>(value: T): T {
  if (typeof value === 'string') return sanitizeString(value) as T
  if (Array.isArray(value)) return value.map((item) => sanitizeJsonStrings(item)) as T
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, sanitizeJsonStrings(nestedValue)]),
  ) as T
}

function sanitizeMediaContract(contract: MediaContract): MediaContract {
  const { checkedAt: _checkedAt, ...contractWithoutCheckedAt } = contract
  void _checkedAt
  const redactedContract = sanitizeJsonStrings(contractWithoutCheckedAt)
  if (!redactedContract.testStatus) return redactedContract
  return {
    ...redactedContract,
    testStatus: Object.fromEntries(
      Object.entries(redactedContract.testStatus).map(([key, status]) => [
        key,
        status === 'passed' ? 'unchecked' : status,
      ]),
    ) as NonNullable<MediaContract['testStatus']>,
  }
}

function sanitizeCompatMediaTemplate(template: OpenAICompatMediaTemplate): OpenAICompatMediaTemplate {
  return sanitizeJsonStrings(template)
}

function isMediaPurpose(purpose: CreativeEngineDetectionResult['models'][number]['purpose']) {
  return purpose === 'image-generation' || purpose === 'video-generation'
}

export function buildInspectorPayload(input: InspectorPayloadInput) {
  const safeProbeLogs = input.allowKeyInInspector
    ? input.probeLogs
    : input.probeLogs.map((item) => redactInspectorText(item, input.apiKey))
  const safeResponseSamples = input.allowKeyInInspector
    ? input.responseSamples
    : input.responseSamples.map((item) => redactInspectorText(item, input.apiKey))

  return {
    serviceUrl: input.serviceUrl,
    apiKey: input.allowKeyInInspector ? input.apiKey : redactInspectorText(input.apiKey),
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
    models: validated.data.models.map((model) => {
      const purpose = INSPECTOR_PURPOSE_MAP[model.purpose]
      if (!isMediaPurpose(purpose)) {
        return {
          name: sanitizeString(model.name),
          callName: sanitizeString(model.callName),
          purpose,
          confidence: model.confidence,
        }
      }

      const validatedTemplate = model.compatMediaTemplate
        ? validateOpenAICompatMediaTemplate(model.compatMediaTemplate)
        : null
      const compatMediaTemplate = validatedTemplate?.ok && validatedTemplate.template
        ? sanitizeCompatMediaTemplate(validatedTemplate.template)
        : undefined
      const mediaContract = model.mediaContract
        && (model.mediaContract.executor !== 'openai-compat-template' || compatMediaTemplate)
        ? sanitizeMediaContract(model.mediaContract)
        : undefined
      const mediaContractSource = mediaContract ? (model.mediaContractSource || mediaContract.source) : undefined
      return {
        name: sanitizeString(model.name),
        callName: sanitizeString(model.callName),
        purpose,
        confidence: model.confidence,
        ...(compatMediaTemplate ? { compatMediaTemplate } : {}),
        ...(compatMediaTemplate && model.compatMediaTemplateSource ? { compatMediaTemplateSource: model.compatMediaTemplateSource } : {}),
        ...(mediaContract ? { mediaContract } : {}),
        ...(mediaContractSource ? { mediaContractSource } : {}),
      }
    }),
    warnings: validated.data.warnings.map(sanitizeString),
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
