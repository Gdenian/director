import { describe, expect, it } from 'vitest'
import { assertMediaContractCapability } from '@/lib/media-contract/runtime'

describe('media contract runtime guards', () => {
  it('allows passed template-backed image-to-image capability', () => {
    expect(() => assertMediaContractCapability({
      contract: {
        version: 1,
        mediaType: 'image',
        executor: 'openai-compat-template',
        capabilities: ['image-to-image'],
        input: { image: 'dataUrlBase64' },
        output: { kind: 'url', urlPath: '$.data[0].url' },
        testStatus: { imageToImage: 'passed' },
      },
      capability: 'image-to-image',
      trustedOfficialAdapter: false,
    })).not.toThrow()
  })

  it('blocks unchecked relay media capability', () => {
    expect(() => assertMediaContractCapability({
      contract: {
        version: 1,
        mediaType: 'video',
        executor: 'openai-compat-template',
        capabilities: ['image-to-video'],
        input: { image: 'publicUrl' },
        output: { kind: 'asyncTask', urlPath: '$.video_url' },
        testStatus: { imageToVideo: 'unchecked' },
      },
      capability: 'image-to-video',
      trustedOfficialAdapter: false,
    })).toThrow('MEDIA_CONTRACT_CAPABILITY_NOT_PASSED')
  })

  it('blocks capability from the wrong media type', () => {
    expect(() => assertMediaContractCapability({
      contract: {
        version: 1,
        mediaType: 'image',
        executor: 'openai-compat-template',
        capabilities: ['image-to-image'],
        input: { image: 'dataUrlBase64' },
        output: { kind: 'url', urlPath: '$.data[0].url' },
        testStatus: { imageToImage: 'passed' },
      },
      capability: 'image-to-video',
      trustedOfficialAdapter: false,
    })).toThrow('MEDIA_CONTRACT_CAPABILITY_UNSUPPORTED')
  })

  it('blocks missing capability even when another capability passed', () => {
    expect(() => assertMediaContractCapability({
      contract: {
        version: 1,
        mediaType: 'video',
        executor: 'openai-compat-template',
        capabilities: ['image-to-video'],
        input: { image: 'publicUrl' },
        output: { kind: 'asyncTask', urlPath: '$.video_url' },
        testStatus: { imageToVideo: 'passed' },
      },
      capability: 'first-last-frame-video',
      trustedOfficialAdapter: false,
    })).toThrow('MEDIA_CONTRACT_CAPABILITY_UNSUPPORTED')
  })

  it('blocks unchecked official-adapter capability without trusted provider adapter', () => {
    expect(() => assertMediaContractCapability({
      contract: {
        version: 1,
        mediaType: 'image',
        executor: 'official-adapter',
        capabilities: ['text-to-image'],
        input: {},
        output: { kind: 'url', urlPath: '$.url' },
        testStatus: { textToImage: 'unchecked' },
      },
      capability: 'text-to-image',
      trustedOfficialAdapter: false,
    })).toThrow('MEDIA_CONTRACT_CAPABILITY_NOT_PASSED')
  })

  it('blocks unchecked gemini-standard capability', () => {
    expect(() => assertMediaContractCapability({
      contract: {
        version: 1,
        mediaType: 'video',
        executor: 'gemini-standard',
        capabilities: ['image-to-video'],
        input: { image: 'publicUrl' },
        output: { kind: 'asyncTask', urlPath: '$.name' },
        testStatus: { imageToVideo: 'unchecked' },
      },
      capability: 'image-to-video',
      trustedOfficialAdapter: false,
    })).toThrow('MEDIA_CONTRACT_CAPABILITY_NOT_PASSED')
  })
})
