import { isImageCapability, isVideoCapability, mediaCapabilityStatusKey } from './status'
import type {
  MediaCapability,
  MediaCapabilityStatus,
  MediaContract,
  MediaContractExecutor,
  MediaContractSource,
  MediaContractValidationIssue,
  MediaInputArrayFormat,
  MediaInputFormat,
} from './types'

export type MediaContractValidationContext = {
  modelMediaType: 'image' | 'video'
  hasCompatMediaTemplate: boolean
}

export type MediaContractValidationResult = {
  ok: boolean
  contract: MediaContract | null
  issues: MediaContractValidationIssue[]
}

const EXECUTORS = new Set<MediaContractExecutor>([
  'official-adapter',
  'openai-standard',
  'gemini-standard',
  'openai-compat-template',
])
const MEDIA_TYPES = new Set<MediaContract['mediaType']>(['image', 'video'])
const CAPABILITIES = new Set<MediaCapability>([
  'text-to-image',
  'image-to-image',
  'image-edit',
  'text-to-video',
  'image-to-video',
  'first-last-frame-video',
])
const INPUT_FORMATS = new Set<MediaInputFormat>([
  'publicUrl',
  'dataUrlBase64',
  'rawBase64',
  'multipartFile',
])
const INPUT_ARRAY_FORMATS = new Set<MediaInputArrayFormat>([
  'publicUrlArray',
  'dataUrlBase64Array',
  'rawBase64Array',
  'multipartFiles',
])
const OUTPUT_KINDS = new Set<MediaContract['output']['kind']>([
  'url',
  'urlArray',
  'base64',
  'asyncTask',
])
const STATUSES = new Set<MediaCapabilityStatus>([
  'unchecked',
  'passed',
  'failed',
  'unavailable',
])
const SOURCES = new Set<MediaContractSource>([
  'rule',
  'provider-list',
  'llm',
  'manual',
  'official-adapter',
])
const TEST_STATUS_KEYS = new Set<keyof NonNullable<MediaContract['testStatus']>>([
  'textToImage',
  'imageToImage',
  'imageEdit',
  'textToVideo',
  'imageToVideo',
  'firstLastFrameVideo',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function issue(
  code: MediaContractValidationIssue['code'],
  field: string,
  message: string,
): MediaContractValidationIssue {
  return { code, field, message }
}

function readEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  field: string,
  issues: MediaContractValidationIssue[],
): T | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (allowed.has(trimmed as T)) return trimmed as T
  }
  issues.push(issue('MEDIA_CONTRACT_INVALID', field, `Invalid media contract field: ${field}`))
  return undefined
}

function readOptionalEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  field: string,
  issues: MediaContractValidationIssue[],
): T | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return readEnum(value, allowed, field, issues)
}

function readOptionalPath(
  raw: Record<string, unknown>,
  field: 'urlPath' | 'urlsPath' | 'base64Path',
  issues: MediaContractValidationIssue[],
): string | undefined {
  if (raw[field] === undefined || raw[field] === null || raw[field] === '') return undefined
  const value = stringValue(raw[field])
  if (!value) {
    issues.push(issue('MEDIA_CONTRACT_INVALID', `output.${field}`, `Invalid media contract output path: ${field}`))
  }
  return value
}

function addRequiredPathIssue(field: string, kind: MediaContract['output']['kind'], issues: MediaContractValidationIssue[]) {
  issues.push(issue(
    'MEDIA_CONTRACT_OUTPUT_PATH_REQUIRED',
    field,
    `Media contract output kind ${kind} requires ${field}.`,
  ))
}

export function validateMediaContract(
  raw: unknown,
  context: MediaContractValidationContext,
): MediaContractValidationResult {
  const issues: MediaContractValidationIssue[] = []
  if (!isRecord(raw)) {
    return {
      ok: false,
      contract: null,
      issues: [issue('MEDIA_CONTRACT_INVALID', 'mediaContract', 'Media contract must be an object.')],
    }
  }

  if (raw.version !== 1) {
    issues.push(issue('MEDIA_CONTRACT_INVALID', 'version', 'Media contract version must be 1.'))
  }

  const mediaType = readEnum(raw.mediaType, MEDIA_TYPES, 'mediaType', issues)
  if (mediaType && mediaType !== context.modelMediaType) {
    issues.push(issue(
      'MEDIA_CONTRACT_MEDIA_TYPE_MISMATCH',
      'mediaType',
      `Media contract type ${mediaType} does not match model type ${context.modelMediaType}.`,
    ))
  }

  const executor = readEnum(raw.executor, EXECUTORS, 'executor', issues)
  if (executor === 'openai-compat-template' && !context.hasCompatMediaTemplate) {
    issues.push(issue(
      'MEDIA_CONTRACT_TEMPLATE_REQUIRED',
      'executor',
      'Media contract template executor requires compatMediaTemplate.',
    ))
  }

  const capabilities: MediaCapability[] = []
  if (!Array.isArray(raw.capabilities)) {
    issues.push(issue('MEDIA_CONTRACT_INVALID', 'capabilities', 'Media contract capabilities must be an array.'))
  } else {
    const seenCapabilities = new Set<MediaCapability>()
    raw.capabilities.forEach((value, index) => {
      const field = `capabilities[${index}]`
      const capability = readEnum(value, CAPABILITIES, field, issues)
      if (!capability) return
      if (mediaType === 'image' && isVideoCapability(capability)) {
        issues.push(issue(
          'MEDIA_CONTRACT_CAPABILITY_MEDIA_TYPE_MISMATCH',
          field,
          `Video capability ${capability} cannot be declared on an image contract.`,
        ))
      }
      if (mediaType === 'video' && isImageCapability(capability)) {
        issues.push(issue(
          'MEDIA_CONTRACT_CAPABILITY_MEDIA_TYPE_MISMATCH',
          field,
          `Image capability ${capability} cannot be declared on a video contract.`,
        ))
      }
      if (!seenCapabilities.has(capability)) {
        capabilities.push(capability)
        seenCapabilities.add(capability)
      }
    })
  }

  const input: MediaContract['input'] = {}
  if (!isRecord(raw.input)) {
    issues.push(issue('MEDIA_CONTRACT_INVALID', 'input', 'Media contract input must be an object.'))
  } else {
    const image = readOptionalEnum(raw.input.image, INPUT_FORMATS, 'input.image', issues)
    const images = readOptionalEnum(raw.input.images, INPUT_ARRAY_FORMATS, 'input.images', issues)
    const lastFrameImage = readOptionalEnum(raw.input.lastFrameImage, INPUT_FORMATS, 'input.lastFrameImage', issues)
    if (image) input.image = image
    if (images) input.images = images
    if (lastFrameImage) input.lastFrameImage = lastFrameImage
  }

  let output: MediaContract['output'] | null = null
  if (!isRecord(raw.output)) {
    issues.push(issue('MEDIA_CONTRACT_INVALID', 'output', 'Media contract output must be an object.'))
  } else {
    const kind = readEnum(raw.output.kind, OUTPUT_KINDS, 'output.kind', issues)
    const urlPath = readOptionalPath(raw.output, 'urlPath', issues)
    const urlsPath = readOptionalPath(raw.output, 'urlsPath', issues)
    const base64Path = readOptionalPath(raw.output, 'base64Path', issues)
    if (kind === 'url' && !urlPath) addRequiredPathIssue('output.urlPath', kind, issues)
    if (kind === 'urlArray' && !urlsPath) addRequiredPathIssue('output.urlsPath', kind, issues)
    if (kind === 'base64' && !base64Path) addRequiredPathIssue('output.base64Path', kind, issues)
    if (kind === 'asyncTask' && !urlPath && !urlsPath) {
      addRequiredPathIssue('output.urlPath', kind, issues)
    }
    if (kind) {
      output = {
        kind,
        ...(urlPath ? { urlPath } : {}),
        ...(urlsPath ? { urlsPath } : {}),
        ...(base64Path ? { base64Path } : {}),
      }
    }
  }

  let testStatus: MediaContract['testStatus']
  if (raw.testStatus !== undefined && raw.testStatus !== null) {
    if (!isRecord(raw.testStatus)) {
      issues.push(issue('MEDIA_CONTRACT_INVALID', 'testStatus', 'Media contract testStatus must be an object.'))
    } else {
      const normalizedStatus: NonNullable<MediaContract['testStatus']> = {}
      const allowedStatusKeys = new Set(capabilities.map(mediaCapabilityStatusKey))
      for (const key of Object.keys(raw.testStatus)) {
        if (!TEST_STATUS_KEYS.has(key as keyof NonNullable<MediaContract['testStatus']>)) {
          issues.push(issue('MEDIA_CONTRACT_INVALID', `testStatus.${key}`, `Invalid media contract test status key: ${key}`))
          continue
        }
        if (!allowedStatusKeys.has(key as keyof NonNullable<MediaContract['testStatus']>)) {
          issues.push(issue('MEDIA_CONTRACT_INVALID', `testStatus.${key}`, `Media contract test status ${key} is not declared in capabilities.`))
        }
      }
      for (const capability of capabilities) {
        const key = mediaCapabilityStatusKey(capability)
        const status = readOptionalEnum(raw.testStatus[key], STATUSES, `testStatus.${key}`, issues)
        if (status) normalizedStatus[key] = status
      }
      if (Object.keys(normalizedStatus).length > 0) testStatus = normalizedStatus
    }
  }

  const checkedAt = raw.checkedAt === undefined || raw.checkedAt === null || raw.checkedAt === ''
    ? undefined
    : stringValue(raw.checkedAt)
  if (raw.checkedAt !== undefined && raw.checkedAt !== null && raw.checkedAt !== '' && !checkedAt) {
    issues.push(issue('MEDIA_CONTRACT_INVALID', 'checkedAt', 'Media contract checkedAt must be a string.'))
  }
  const source = readOptionalEnum(raw.source, SOURCES, 'source', issues)

  if (issues.length > 0 || !mediaType || !executor || !output) {
    return { ok: false, contract: null, issues }
  }

  return {
    ok: true,
    contract: {
      version: 1,
      mediaType,
      executor,
      capabilities,
      input,
      output,
      ...(testStatus ? { testStatus } : {}),
      ...(checkedAt ? { checkedAt } : {}),
      ...(source ? { source } : {}),
    },
    issues: [],
  }
}
