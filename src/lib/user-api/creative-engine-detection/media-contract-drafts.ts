import type {
  CreativeProtocolType,
} from '@/lib/creative-engine/types'
import type { MediaContract } from '@/lib/media-contract/types'
import type { OpenAICompatMediaTemplate } from '@/lib/openai-compat-media-template'
import type { DetectedModelDraft } from './types'

type MediaContractDraftInput = {
  protocolType: CreativeProtocolType
  model: DetectedModelDraft
  documentationText?: string
}

type MediaContractDraftResult = Pick<
  DetectedModelDraft,
  'mediaContract' | 'mediaContractSource' | 'compatMediaTemplate' | 'compatMediaTemplateSource'
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

function hasAgnesVideoDocumentationEvidence(documentationText?: string) {
  if (!documentationText) return false
  const normalized = documentationText.toLowerCase()
  return normalized.includes('agnes-video-v2.0')
    && normalized.includes('/v1/videos')
    && normalized.includes('agnesapi')
    && normalized.includes('video_id')
    && normalized.includes('remixed_from_video_id')
}

function isAgnesVideoModel(model: DetectedModelDraft) {
  return model.purpose === 'video-generation'
    && model.callName.trim().toLowerCase() === 'agnes-video-v2.0'
}

function buildAgnesVideoTemplateDraft(): MediaContractDraftResult {
  const compatMediaTemplate: OpenAICompatMediaTemplate = {
    version: 1,
    mediaType: 'video',
    mode: 'async',
    create: {
      method: 'POST',
      path: '/videos',
      contentType: 'application/json',
      bodyTemplate: {
        model: '{{model}}',
        prompt: '{{prompt}}',
        image: '{{image}}',
        num_frames: 121,
        frame_rate: 24,
      },
    },
    status: {
      method: 'GET',
      path: 'https://apihub.agnes-ai.com/agnesapi?video_id={{task_id}}',
    },
    response: {
      taskIdPath: '$.video_id',
      statusPath: '$.status',
      outputUrlPath: '$.remixed_from_video_id',
      errorPath: '$.error.message',
    },
    polling: {
      intervalMs: 5000,
      timeoutMs: 600000,
      doneStates: ['completed'],
      failStates: ['failed'],
    },
  }
  return {
    compatMediaTemplate,
    compatMediaTemplateSource: 'ai',
    mediaContract: {
      version: 1,
      mediaType: 'video',
      executor: 'openai-compat-template',
      capabilities: ['image-to-video'],
      input: {
        image: 'publicUrl',
      },
      output: {
        kind: 'asyncTask',
        urlPath: '$.remixed_from_video_id',
      },
      testStatus: {
        imageToVideo: 'unchecked',
      },
      source: 'llm',
    },
    mediaContractSource: 'llm',
  }
}

export function buildMediaContractDraftForDetectedModel(input: MediaContractDraftInput): MediaContractDraftResult {
  if (input.model.purpose !== 'image-generation' && input.model.purpose !== 'video-generation') {
    return {}
  }

  if (input.model.mediaContract) {
    return {
      mediaContract: input.model.mediaContract,
      mediaContractSource: input.model.mediaContractSource || input.model.mediaContract.source,
      compatMediaTemplate: input.model.compatMediaTemplate,
      compatMediaTemplateSource: input.model.compatMediaTemplateSource,
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

  if (
    input.protocolType === 'openai-compatible'
    && isAgnesVideoModel(input.model)
    && hasAgnesVideoDocumentationEvidence(input.documentationText)
  ) {
    return buildAgnesVideoTemplateDraft()
  }

  return {}
}
