import { describe, expect, it } from 'vitest'
import { buildDetectedModelDrafts } from '@/app/[locale]/profile/components/creative-engine/detection-save-draft'

describe('creative engine detection save draft', () => {
  it('converts confirmed detected models into config-center model drafts', () => {
    const drafts = buildDetectedModelDrafts('openai-compatible:abc', [
      {
        id: 'text-1',
        name: 'Text One',
        callName: 'gpt-example',
        purpose: 'text',
        status: 'available',
      },
      {
        id: 'img-1',
        name: 'Image One',
        callName: 'image-example',
        purpose: 'image-generation',
        status: 'unchecked',
      },
      {
        id: 'mystery',
        name: 'Mystery',
        callName: 'mystery-model',
        purpose: 'unknown',
        status: 'unchecked',
      },
    ])

    expect(drafts).toEqual([
      {
        modelId: 'gpt-example',
        modelKey: 'openai-compatible:abc::gpt-example',
        name: 'Text One',
        type: 'llm',
        provider: 'openai-compatible:abc',
        llmProtocol: 'chat-completions',
        llmProtocolCheckedAt: expect.any(String),
        purpose: 'text',
        status: 'available',
        price: 0,
      },
      {
        modelId: 'image-example',
        modelKey: 'openai-compatible:abc::image-example',
        name: 'Image One',
        type: 'image',
        provider: 'openai-compatible:abc',
        purpose: 'image-generation',
        status: 'unchecked',
        price: 0,
      },
    ])
  })
})
