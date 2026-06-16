import { describe, expect, it } from 'vitest'
import { filterModelOptionsForWorkflowCapability } from '@/lib/media-contract/workflow-filter'
import type { MediaContract } from '@/lib/media-contract/types'

type TestOption = {
  value: string
  label: string
  mediaContract?: MediaContract
}

function videoContract(status: MediaContract['testStatus']): MediaContract {
  return {
    version: 1,
    mediaType: 'video',
    executor: 'openai-compat-template',
    capabilities: ['image-to-video'],
    input: { image: 'publicUrl' },
    output: { kind: 'asyncTask', urlPath: '$.video.url' },
    testStatus: status,
  }
}

describe('filterModelOptionsForWorkflowCapability', () => {
  it('keeps passed image-to-video models and hides unchecked relay video models by default', () => {
    const options: TestOption[] = [
      {
        value: 'passed',
        label: 'Passed Video',
        mediaContract: videoContract({ imageToVideo: 'passed' }),
      },
      {
        value: 'unchecked',
        label: 'Relay Video',
        mediaContract: videoContract({ imageToVideo: 'unchecked' }),
      },
    ]

    expect(filterModelOptionsForWorkflowCapability(options, 'image-to-video')).toEqual([
      options[0],
    ])
  })

  it('keeps trusted official adapter models when the capability is declared', () => {
    const official: TestOption = {
      value: 'official',
      label: 'Official Video',
      mediaContract: {
        version: 1,
        mediaType: 'video',
        executor: 'official-adapter',
        capabilities: ['image-to-video'],
        input: { image: 'publicUrl' },
        output: { kind: 'url', urlPath: '$.url' },
      },
    }

    expect(filterModelOptionsForWorkflowCapability([official], 'image-to-video')).toEqual([official])
  })

  it('can include missing-contract options as unverified copies', () => {
    const option: TestOption = {
      value: 'legacy-video',
      label: 'Legacy Video',
    }

    const result = filterModelOptionsForWorkflowCapability([option], 'image-to-video', {
      includeUnverified: true,
    })

    expect(result).toEqual([
      {
        value: 'legacy-video',
        label: 'Legacy Video',
        unverified: true,
      },
    ])
    expect(result[0]).not.toBe(option)
  })
})
