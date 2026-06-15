import {
  buildRenderedTemplateRequest,
  buildTemplateVariables,
  normalizeResponseJson,
  readJsonPath,
} from '@/lib/openai-compat-template-runtime'
import { classifyMediaTestError, redactMediaTestSecrets } from '@/lib/media-contract/test-diagnostics'
import type {
  MediaContractTestOutput,
  MediaContractTestPreview,
  MediaContractTestResult,
  RunMediaContractTestInput,
} from './types'

function contentTypeFromHeaders(headers: Record<string, string>): string | undefined {
  const key = Object.keys(headers).find((name) => name.toLowerCase() === 'content-type')
  return key ? headers[key] : undefined
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

async function verifyOutputUrl(url: string): Promise<boolean> {
  const head = await fetch(url, { method: 'HEAD' })
  if (head.ok) return true
  if (head.status !== 405) return false

  const ranged = await fetch(url, {
    method: 'GET',
    headers: { Range: 'bytes=0-0' },
  })
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
    endpointUrl: request.endpointUrl,
    method: request.method,
    ...(contentType ? { contentType } : {}),
    ...(bodyPreview ? { bodyPreview } : {}),
  }
}

async function runSyncTemplate(input: RunMediaContractTestInput): Promise<MediaContractTestResult> {
  const request = await renderCreateRequest(input)
  const preview = await previewFromRequest(request)
  const response = await fetch(request.endpointUrl, {
    method: request.method,
    headers: request.headers,
    ...(request.body ? { body: request.body } : {}),
  })
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

  if (output.url && !(await verifyOutputUrl(output.url))) {
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
  const createResponse = await fetch(createRequest.endpointUrl, {
    method: createRequest.method,
    headers: createRequest.headers,
    ...(createRequest.body ? { body: createRequest.body } : {}),
  })
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

  const startedAt = Date.now()
  while (Date.now() - startedAt <= template.polling.timeoutMs) {
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
    const statusResponse = await fetch(statusRequest.endpointUrl, {
      method: statusRequest.method,
      headers: statusRequest.headers,
      ...(statusRequest.body ? { body: statusRequest.body } : {}),
    })
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
      if (output.url && !(await verifyOutputUrl(output.url))) {
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
    await delay(template.polling.intervalMs)
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
  if (!input.provider.baseUrl) {
    return {
      status: 'failed',
      diagnostic: {
        code: 'MEDIA_TEST_BASE_URL_ERROR',
        message: 'Provider base URL is missing',
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
