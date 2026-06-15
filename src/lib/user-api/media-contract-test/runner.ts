import {
  buildRenderedTemplateRequest,
  buildTemplateVariables,
  normalizeResponseJson,
  readJsonPath,
} from '@/lib/openai-compat-template-runtime'
import { classifyMediaTestError, redactMediaTestSecrets } from '@/lib/media-contract/test-diagnostics'
import { assertMediaContractTestCapability } from './validate'
import type {
  MediaContractTestOutput,
  MediaContractTestPreview,
  MediaContractTestResult,
  RunMediaContractTestInput,
} from './types'

const DEFAULT_FETCH_TIMEOUT_MS = 30_000
const DEFAULT_MAX_POLL_TIMEOUT_MS = 30_000
const DEFAULT_MAX_POLL_INTERVAL_MS = 1_000
const SECRET_QUERY_KEYS = new Set(['key', 'api_key', 'token', 'access_token'])

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function contentTypeFromHeaders(headers: Record<string, string>): string | undefined {
  const key = Object.keys(headers).find((name) => name.toLowerCase() === 'content-type')
  return key ? headers[key] : undefined
}

function redactEndpointUrl(value: string): string {
  const redactedSk = redactMediaTestSecrets(value)
  try {
    const url = new URL(redactedSk)
    for (const key of Array.from(url.searchParams.keys())) {
      if (SECRET_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.set(key, '[REDACTED]')
      }
    }
    return url.toString()
  } catch {
    return redactedSk.replace(/([?&](?:key|api_key|token|access_token)=)[^&]+/gi, '$1[REDACTED]')
  }
}

async function bodyToPreview(body: BodyInit | undefined): Promise<string | undefined> {
  if (!body) return undefined
  if (typeof body === 'string') return redactMediaTestSecrets(body).slice(0, 1000)
  if (body instanceof URLSearchParams) return redactMediaTestSecrets(body.toString()).slice(0, 1000)
  if (body instanceof FormData) return '[multipart/form-data]'
  return '[binary body]'
}

function readOutput(payload: unknown, input: RunMediaContractTestInput): MediaContractTestOutput | null {
  const template = input.model.compatMediaTemplate
  const contract = input.model.mediaContract
  const outputUrl = readJsonPath(payload, template?.response.outputUrlPath || contract?.output.urlPath)
  if (typeof outputUrl === 'string' && outputUrl.trim()) return { url: outputUrl.trim() }

  const outputUrls = readJsonPath(payload, template?.response.outputUrlsPath || contract?.output.urlsPath)
  if (Array.isArray(outputUrls) && typeof outputUrls[0] === 'string' && outputUrls[0].trim()) {
    return { url: outputUrls[0].trim() }
  }

  const base64 = readJsonPath(payload, contract?.output.base64Path)
  if (typeof base64 === 'string' && base64.trim()) return { base64: base64.trim() }
  return null
}

async function verifyOutputUrl(url: string, input: RunMediaContractTestInput): Promise<boolean> {
  const head = await mediaTestFetch(url, { method: 'HEAD' }, input)
  if (head.ok) return true
  if (head.status !== 405) return false

  const ranged = await mediaTestFetch(url, {
    method: 'GET',
    headers: { Range: 'bytes=0-0' },
  }, input)
  return ranged.ok
}

async function renderCreateRequest(input: RunMediaContractTestInput) {
  const template = input.model.compatMediaTemplate
  if (!template) throw new Error('MEDIA_TEST_COMPAT_TEMPLATE_REQUIRED')
  const variables = buildTemplateVariables({
    model: input.model.modelId,
    prompt: input.sample?.prompt || '生成一张简单测试图',
    image: input.sample?.image || '',
    images: input.sample?.image ? [input.sample.image] : [],
    lastFrameImage: input.sample?.lastFrameImage || '',
  })
  return await buildRenderedTemplateRequest({
    baseUrl: input.provider.baseUrl || '',
    endpoint: template.create,
    variables,
    defaultAuthHeader: input.provider.apiKey ? `Bearer ${input.provider.apiKey}` : undefined,
  })
}

async function previewFromRequest(request: Awaited<ReturnType<typeof renderCreateRequest>>): Promise<MediaContractTestPreview> {
  const contentType = contentTypeFromHeaders(request.headers)
  const bodyPreview = await bodyToPreview(request.body)
  return {
    endpointUrl: redactEndpointUrl(request.endpointUrl),
    method: request.method,
    ...(contentType ? { contentType } : {}),
    ...(bodyPreview ? { bodyPreview } : {}),
  }
}

function buildFetchInit(init: RequestInit, timeoutMs: number): RequestInit {
  if (timeoutMs > 0 && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    }
  }
  return init
}

async function mediaTestFetch(url: string, init: RequestInit, input: RunMediaContractTestInput): Promise<Response> {
  const timeoutMs = input.limits?.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
  return await fetch(url, buildFetchInit(init, timeoutMs))
}

async function runSyncTemplate(input: RunMediaContractTestInput): Promise<MediaContractTestResult> {
  const request = await renderCreateRequest(input)
  const preview = await previewFromRequest(request)
  const response = await mediaTestFetch(request.endpointUrl, {
    method: request.method,
    headers: request.headers,
    ...(request.body ? { body: request.body } : {}),
  }, input)
  const rawText = await response.text().catch(() => '')
  const payload = normalizeResponseJson(rawText)
  if (!response.ok) {
    return {
      status: 'failed',
      preview,
      diagnostic: classifyMediaTestError({ status: response.status, body: rawText }),
    }
  }

  const output = readOutput(payload, input)
  if (!output) {
    return {
      status: 'failed',
      preview,
      diagnostic: classifyMediaTestError({ status: response.status, body: rawText, extraction: 'output-url-missing' }),
    }
  }

  if (output.url && !(await verifyOutputUrl(output.url, input))) {
    return {
      status: 'failed',
      preview,
      output,
      diagnostic: {
        code: 'MEDIA_TEST_OUTPUT_URL_NOT_DOWNLOADABLE',
        message: 'Output URL is not downloadable',
      },
    }
  }

  return {
    status: 'passed',
    preview,
    output,
    diagnostic: { message: 'Media test passed' },
  }
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function runAsyncTemplate(input: RunMediaContractTestInput): Promise<MediaContractTestResult> {
  const template = input.model.compatMediaTemplate
  const createRequest = await renderCreateRequest(input)
  const preview = await previewFromRequest(createRequest)
  const createResponse = await mediaTestFetch(createRequest.endpointUrl, {
    method: createRequest.method,
    headers: createRequest.headers,
    ...(createRequest.body ? { body: createRequest.body } : {}),
  }, input)
  const createText = await createResponse.text().catch(() => '')
  const createPayload = normalizeResponseJson(createText)
  if (!createResponse.ok) {
    return {
      status: 'failed',
      preview,
      diagnostic: classifyMediaTestError({ status: createResponse.status, body: createText }),
    }
  }

  const taskIdRaw = readJsonPath(createPayload, template?.response.taskIdPath)
  const taskId = typeof taskIdRaw === 'string' ? taskIdRaw.trim() : ''
  if (!taskId || !template?.status || !template.polling) {
    return {
      status: 'failed',
      preview,
      output: taskId ? { taskId } : undefined,
      diagnostic: classifyMediaTestError({ status: createResponse.status, body: createText, extraction: 'task-id-missing' }),
    }
  }

  const timeoutMs = Math.min(template.polling.timeoutMs, input.limits?.maxPollTimeoutMs ?? DEFAULT_MAX_POLL_TIMEOUT_MS)
  const intervalMs = Math.min(template.polling.intervalMs, input.limits?.maxPollIntervalMs ?? DEFAULT_MAX_POLL_INTERVAL_MS)
  const startedAt = Date.now()
  while (Date.now() - startedAt <= timeoutMs) {
    const statusRequest = await buildRenderedTemplateRequest({
      baseUrl: input.provider.baseUrl || '',
      endpoint: template.status,
      variables: buildTemplateVariables({
        model: input.model.modelId,
        prompt: input.sample?.prompt || '生成一张简单测试图',
        taskId,
      }),
      defaultAuthHeader: input.provider.apiKey ? `Bearer ${input.provider.apiKey}` : undefined,
    })
    const statusResponse = await mediaTestFetch(statusRequest.endpointUrl, {
      method: statusRequest.method,
      headers: statusRequest.headers,
      ...(statusRequest.body ? { body: statusRequest.body } : {}),
    }, input)
    const statusText = await statusResponse.text().catch(() => '')
    const statusPayload = normalizeResponseJson(statusText)
    if (!statusResponse.ok) {
      return {
        status: 'failed',
        preview,
        output: { taskId },
        diagnostic: classifyMediaTestError({ status: statusResponse.status, body: statusText }),
      }
    }
    const status = readJsonPath(statusPayload, template.response.statusPath)
    if (typeof status !== 'string') {
      return {
        status: 'failed',
        preview,
        output: { taskId },
        diagnostic: classifyMediaTestError({ status: statusResponse.status, body: statusText, extraction: 'status-missing' }),
      }
    }
    if (template.polling.failStates.includes(status)) {
      return {
        status: 'failed',
        preview,
        output: { taskId },
        diagnostic: {
          code: 'MEDIA_TEST_ASYNC_UPSTREAM_FAILED',
          message: 'Async upstream task failed',
          debugSnippet: redactMediaTestSecrets(statusText).slice(0, 500),
        },
      }
    }
    if (template.polling.doneStates.includes(status)) {
      const output = readOutput(statusPayload, input)
      if (!output) {
        return {
          status: 'failed',
          preview,
          output: { taskId },
          diagnostic: classifyMediaTestError({ status: statusResponse.status, body: statusText, extraction: 'output-url-missing' }),
        }
      }
      if (output.url && !(await verifyOutputUrl(output.url, input))) {
        return {
          status: 'failed',
          preview,
          output: { ...output, taskId },
          diagnostic: {
            code: 'MEDIA_TEST_OUTPUT_URL_NOT_DOWNLOADABLE',
            message: 'Output URL is not downloadable',
          },
        }
      }
      return {
        status: 'passed',
        preview,
        output: { ...output, taskId },
        diagnostic: { message: 'Media test passed' },
      }
    }
    await delay(intervalMs)
  }

  return {
    status: 'failed',
    preview,
    output: { taskId },
    diagnostic: {
      code: 'MEDIA_TEST_PROVIDER_TIMEOUT',
      message: 'Media test timed out while polling provider',
    },
  }
}

export async function runMediaContractTest(input: RunMediaContractTestInput): Promise<MediaContractTestResult> {
  const contract = input.model.mediaContract
  if (!contract) {
    return {
      status: 'failed',
      diagnostic: {
        code: 'MEDIA_TEST_MISSING_MODEL',
        message: 'Selected model does not have a media contract',
      },
    }
  }
  if (contract.executor !== 'openai-compat-template') {
    return {
      status: 'failed',
      diagnostic: {
        code: 'MEDIA_TEST_REQUEST_SCHEMA_MISMATCH',
        message: `Unsupported media test executor: ${contract.executor}`,
      },
    }
  }
  try {
    assertMediaContractTestCapability(contract, input.capability)
  } catch (error) {
    return {
      status: 'failed',
      diagnostic: {
        code: 'MEDIA_TEST_REQUEST_SCHEMA_MISMATCH',
        message: error instanceof Error ? error.message : 'Media test capability is unsupported',
      },
    }
  }
  if (!input.provider.baseUrl) {
    return {
      status: 'failed',
      diagnostic: {
        code: 'MEDIA_TEST_BASE_URL_ERROR',
        message: 'Provider base URL is missing',
      },
    }
  }
  if (!isValidHttpUrl(input.provider.baseUrl)) {
    return {
      status: 'failed',
      diagnostic: {
        code: 'MEDIA_TEST_BASE_URL_ERROR',
        message: 'Provider base URL is invalid',
      },
    }
  }

  try {
    return input.model.compatMediaTemplate?.mode === 'async'
      ? await runAsyncTemplate(input)
      : await runSyncTemplate(input)
  } catch (error) {
    return {
      status: 'failed',
      diagnostic: classifyMediaTestError({ error, body: error instanceof Error ? error.message : String(error) }),
    }
  }
}
