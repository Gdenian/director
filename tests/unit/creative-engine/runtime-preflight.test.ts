import { describe, expect, it } from 'vitest'
import {
  getCreativeEnginePreflightMessage,
  getMissingCreativeEngineModelMessage,
  getUnavailableCreativeEngineModelMessage,
} from '@/lib/creative-engine/runtime-preflight'
import { getMissingConfigError } from '@/lib/config-service'

describe('creative engine runtime preflight messages', () => {
  it('reports missing model selections without auto-fixing them', () => {
    expect(getCreativeEnginePreflightMessage({ code: 'MISSING_TEXT_MODEL' })).toBe('当前还没有选择文本分析模型，请先选择一个文本模型。')
    expect(getCreativeEnginePreflightMessage({ code: 'MISSING_IMAGE_MODEL' })).toBe('当前流程需要图片模型，请先选择角色、场景或分镜使用的图片模型。')
    expect(getCreativeEnginePreflightMessage({ code: 'MISSING_VIDEO_MODEL' })).toBe('当前流程需要视频模型，请先选择一个视频生成模型。')
    expect(getCreativeEnginePreflightMessage({ code: 'MISSING_VOICE_MODEL' })).toBe('当前流程需要语音模型，请先选择一个语音模型。')
  })

  it('reports unavailable selected model', () => {
    expect(getCreativeEnginePreflightMessage({ code: 'MODEL_UNAVAILABLE' })).toBe('当前选择的模型暂时不可用，请重新检测或更换模型。')
  })

  it('maps config-service missing model fields to product preflight copy', () => {
    expect(getMissingConfigError(['AI分析模型'])).toBe('当前还没有选择文本分析模型，请先选择一个文本模型。')
    expect(getMissingConfigError(['角色图像模型'])).toBe('当前流程需要图片模型，请先选择角色、场景或分镜使用的图片模型。')
    expect(getMissingConfigError(['视频模型'])).toBe('当前流程需要视频模型，请先选择一个视频生成模型。')
    expect(getMissingConfigError(['语音合成模型'])).toBe('当前流程需要语音模型，请先选择一个语音模型。')
  })

  it('classifies api-config runtime errors without mutating selections', () => {
    expect(getMissingCreativeEngineModelMessage('llm')).toBe('当前还没有选择文本分析模型，请先选择一个文本模型。')
    expect(getMissingCreativeEngineModelMessage('image')).toBe('当前流程需要图片模型，请先选择角色、场景或分镜使用的图片模型。')
    expect(getMissingCreativeEngineModelMessage('video')).toBe('当前流程需要视频模型，请先选择一个视频生成模型。')
    expect(getMissingCreativeEngineModelMessage('audio')).toBe('当前流程需要语音模型，请先选择一个语音模型。')
    expect(getUnavailableCreativeEngineModelMessage()).toBe('当前选择的模型暂时不可用，请重新检测或更换模型。')
  })
})
