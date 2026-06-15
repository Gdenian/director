import type { MediaCapability, MediaCapabilityStatus, MediaContract } from '@/lib/media-contract/types'
import type { MediaTestDiagnostic } from '@/lib/media-contract/test-diagnostics'
import type { OpenAICompatMediaTemplate } from '@/lib/openai-compat-media-template'

export type MediaContractTestProvider = {
  id: string
  baseUrl?: string
  apiKey?: string
}

export type MediaContractTestModel = {
  modelKey: string
  modelId: string
  mediaType: 'image' | 'video'
  mediaContract?: MediaContract
  compatMediaTemplate?: OpenAICompatMediaTemplate
}

export type MediaContractTestSample = {
  prompt?: string
  image?: string
  lastFrameImage?: string
}

export type MediaContractTestPreview = {
  endpointUrl: string
  method: string
  contentType?: string
  bodyPreview?: string
}

export type MediaContractTestOutput = {
  url?: string
  base64?: string
  taskId?: string
}

export type MediaContractTestDiagnostic = MediaTestDiagnostic | { message: string; debugSnippet?: string }

export type MediaContractTestResult = {
  status: 'passed' | 'failed'
  preview?: MediaContractTestPreview
  output?: MediaContractTestOutput
  diagnostic: MediaContractTestDiagnostic
}

export type RunMediaContractTestInput = {
  provider: MediaContractTestProvider
  model: MediaContractTestModel
  capability: MediaCapability
  sample?: MediaContractTestSample
}

export type SaveMediaContractTestResultInput = {
  userId: string
  modelKey: string
  capability: MediaCapability
  status: Extract<MediaCapabilityStatus, 'passed' | 'failed'>
  diagnostic?: MediaContractTestDiagnostic
}
