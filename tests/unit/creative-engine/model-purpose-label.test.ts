import { describe, expect, it } from 'vitest'
import { getCreativeModelPurposeLabel } from '@/app/[locale]/profile/components/creative-engine/CreativeModelList'

describe('creative model purpose labels', () => {
  it('localizes model purposes for the creative engine model list', () => {
    const t = (key: string) => {
      const messages: Record<string, string> = {
        'creativeEngine.modelPurposes.text': '文本',
        'creativeEngine.modelPurposes.image-generation': '图片生成',
        'creativeEngine.modelPurposes.image-edit': '修图',
        'creativeEngine.modelPurposes.video-generation': '视频',
        'creativeEngine.modelPurposes.voice-generation': '语音',
        'creativeEngine.modelPurposes.lip-sync': '口型同步',
        'creativeEngine.modelPurposes.voice-design': '声音设计',
        'creativeEngine.modelPurposes.unknown': '未知',
      }
      return messages[key] || key
    }

    expect(getCreativeModelPurposeLabel('text', t)).toBe('文本')
    expect(getCreativeModelPurposeLabel('image-generation', t)).toBe('图片生成')
    expect(getCreativeModelPurposeLabel('video-generation', t)).toBe('视频')
    expect(getCreativeModelPurposeLabel('unknown', t)).toBe('未知')
  })
})
