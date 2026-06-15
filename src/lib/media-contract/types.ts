export type MediaContractExecutor =
  | 'official-adapter'
  | 'openai-standard'
  | 'gemini-standard'
  | 'openai-compat-template'

export type MediaCapability =
  | 'text-to-image'
  | 'image-to-image'
  | 'image-edit'
  | 'text-to-video'
  | 'image-to-video'
  | 'first-last-frame-video'

export type MediaCapabilityStatus = 'unchecked' | 'passed' | 'failed' | 'unavailable'
export type MediaContractSource = 'rule' | 'provider-list' | 'llm' | 'manual' | 'official-adapter'
export type MediaInputFormat = 'publicUrl' | 'dataUrlBase64' | 'rawBase64' | 'multipartFile'
export type MediaInputArrayFormat = 'publicUrlArray' | 'dataUrlBase64Array' | 'rawBase64Array' | 'multipartFiles'

export interface MediaContract {
  version: 1
  mediaType: 'image' | 'video'
  executor: MediaContractExecutor
  capabilities: MediaCapability[]
  input: {
    image?: MediaInputFormat
    images?: MediaInputArrayFormat
    lastFrameImage?: MediaInputFormat
  }
  output: {
    kind: 'url' | 'urlArray' | 'base64' | 'asyncTask'
    urlPath?: string
    urlsPath?: string
    base64Path?: string
  }
  testStatus?: {
    textToImage?: MediaCapabilityStatus
    imageToImage?: MediaCapabilityStatus
    imageEdit?: MediaCapabilityStatus
    textToVideo?: MediaCapabilityStatus
    imageToVideo?: MediaCapabilityStatus
    firstLastFrameVideo?: MediaCapabilityStatus
  }
  checkedAt?: string
  source?: MediaContractSource
}

export type MediaContractValidationIssue = {
  code:
    | 'MEDIA_CONTRACT_INVALID'
    | 'MEDIA_CONTRACT_MEDIA_TYPE_MISMATCH'
    | 'MEDIA_CONTRACT_CAPABILITY_MEDIA_TYPE_MISMATCH'
    | 'MEDIA_CONTRACT_TEMPLATE_REQUIRED'
    | 'MEDIA_CONTRACT_OUTPUT_PATH_REQUIRED'
  field: string
  message: string
}
