import type { ModelMediaType } from '@/lib/api-config'

export type CreativeEnginePreflightCode =
  | 'MISSING_TEXT_MODEL'
  | 'MISSING_IMAGE_MODEL'
  | 'MISSING_VIDEO_MODEL'
  | 'MISSING_VOICE_MODEL'
  | 'MODEL_UNAVAILABLE'

export function getCreativeEnginePreflightMessage(input: { code: CreativeEnginePreflightCode }): string {
  switch (input.code) {
    case 'MISSING_TEXT_MODEL':
      return '当前还没有选择文本分析模型，请先选择一个文本模型。'
    case 'MISSING_IMAGE_MODEL':
      return '当前流程需要图片模型，请先选择角色、场景或分镜使用的图片模型。'
    case 'MISSING_VIDEO_MODEL':
      return '当前流程需要视频模型，请先选择一个视频生成模型。'
    case 'MISSING_VOICE_MODEL':
      return '当前流程需要语音模型，请先选择一个语音模型。'
    case 'MODEL_UNAVAILABLE':
      return '当前选择的模型暂时不可用，请重新检测或更换模型。'
    default: {
      const exhaustiveCode: never = input.code
      return exhaustiveCode
    }
  }
}

export function getMissingCreativeEngineModelMessage(mediaType: ModelMediaType): string {
  if (mediaType === 'llm') {
    return getCreativeEnginePreflightMessage({ code: 'MISSING_TEXT_MODEL' })
  }
  if (mediaType === 'image') {
    return getCreativeEnginePreflightMessage({ code: 'MISSING_IMAGE_MODEL' })
  }
  if (mediaType === 'video') {
    return getCreativeEnginePreflightMessage({ code: 'MISSING_VIDEO_MODEL' })
  }
  return getCreativeEnginePreflightMessage({ code: 'MISSING_VOICE_MODEL' })
}

export function getUnavailableCreativeEngineModelMessage(): string {
  return getCreativeEnginePreflightMessage({ code: 'MODEL_UNAVAILABLE' })
}

export function getMissingCreativeEngineConfigMessage(missingFields: string[]): string | null {
  if (missingFields.length === 0) return null
  if (missingFields.some((field) => field.includes('AI分析'))) {
    return getCreativeEnginePreflightMessage({ code: 'MISSING_TEXT_MODEL' })
  }
  if (missingFields.some((field) => /角色|场景|分镜|图像|修图|编辑/.test(field))) {
    return getCreativeEnginePreflightMessage({ code: 'MISSING_IMAGE_MODEL' })
  }
  if (missingFields.some((field) => field.includes('视频'))) {
    return getCreativeEnginePreflightMessage({ code: 'MISSING_VIDEO_MODEL' })
  }
  if (missingFields.some((field) => /语音|音频|合成/.test(field))) {
    return getCreativeEnginePreflightMessage({ code: 'MISSING_VOICE_MODEL' })
  }
  return null
}
