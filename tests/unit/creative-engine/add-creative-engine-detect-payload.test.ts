import { describe, expect, it } from 'vitest'
import { buildCreativeEngineDetectPayload } from '@/app/[locale]/profile/components/creative-engine/AddCreativeEngineModal'

describe('buildCreativeEngineDetectPayload', () => {
  it('includes trimmed documentation text when detecting a creative engine', () => {
    expect(buildCreativeEngineDetectPayload({
      serviceUrl: ' https://apihub.agnes-ai.com/v1 ',
      apiKey: ' agnes-key ',
      allowKeyInInspector: false,
      documentationText: ' POST /videos creates async video tasks. ',
    })).toEqual({
      serviceUrl: 'https://apihub.agnes-ai.com/v1',
      apiKey: 'agnes-key',
      allowKeyInInspector: false,
      documentationText: 'POST /videos creates async video tasks.',
    })
  })

  it('omits blank documentation text', () => {
    expect(buildCreativeEngineDetectPayload({
      serviceUrl: ' https://api.example.com/v1 ',
      apiKey: ' key ',
      allowKeyInInspector: true,
      documentationText: '   ',
    })).toEqual({
      serviceUrl: 'https://api.example.com/v1',
      apiKey: 'key',
      allowKeyInInspector: true,
    })
  })
})
