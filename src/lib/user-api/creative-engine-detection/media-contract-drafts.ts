import type {
  CreativeProtocolType,
} from '@/lib/creative-engine/types'
import type { MediaContract } from '@/lib/media-contract/types'
import type { DetectedModelDraft } from './types'

type MediaContractDraftInput = {
  protocolType: CreativeProtocolType
  source: string
  normalizedBaseUrl: string
  model: DetectedModelDraft
}

type MediaContractDraftResult = Pick<
  DetectedModelDraft,
  'mediaContract' | 'mediaContractSource'
>

function buildImageContract(executor: MediaContract['executor'], source: MediaContract['source']): MediaContract {
  return {
    version: 1,
    mediaType: 'image',
    executor,
    capabilities: ['text-to-image'],
    input: {},
    output: {
      kind: 'urlArray',
      urlsPath: '$.data[*].url',
    },
    testStatus: {
      textToImage: 'unchecked',
    },
    ...(source ? { source } : {}),
  }
}

function buildVideoContract(executor: MediaContract['executor'], source: MediaContract['source']): MediaContract {
  return {
    version: 1,
    mediaType: 'video',
    executor,
    capabilities: ['image-to-video'],
    input: {
      image: 'publicUrl',
    },
    output: {
      kind: 'asyncTask',
      urlPath: '$.video.url',
    },
    testStatus: {
      imageToVideo: 'unchecked',
    },
    ...(source ? { source } : {}),
  }
}

export function buildMediaContractDraftForDetectedModel(input: MediaContractDraftInput): MediaContractDraftResult {
  if (input.model.mediaContract) {
    return {
      mediaContract: input.model.mediaContract,
      mediaContractSource: input.model.mediaContractSource || input.model.mediaContract.source,
    }
  }

  if (input.protocolType === 'official') {
    if (input.model.purpose === 'image-generation') {
      return {
        mediaContract: {
          ...buildImageContract('official-adapter', 'official-adapter'),
          testStatus: undefined,
        },
        mediaContractSource: 'official-adapter',
      }
    }
    if (input.model.purpose === 'video-generation') {
      return {
        mediaContract: {
          ...buildVideoContract('official-adapter', 'official-adapter'),
          testStatus: undefined,
        },
        mediaContractSource: 'official-adapter',
      }
    }
    return {}
  }

  if (input.protocolType === 'gemini-compatible') {
    if (input.model.purpose === 'image-generation') {
      return {
        mediaContract: buildImageContract('gemini-standard', 'rule'),
        mediaContractSource: 'rule',
      }
    }
    if (input.model.purpose === 'video-generation') {
      return {
        mediaContract: buildVideoContract('gemini-standard', 'rule'),
        mediaContractSource: 'rule',
      }
    }
    return {}
  }

  if (input.protocolType === 'openai-compatible' && input.model.purpose === 'image-generation') {
    return {
      mediaContract: buildImageContract('openai-standard', 'rule'),
      mediaContractSource: 'rule',
    }
  }

  return {}
}
