import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import type { ReactElement, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MediaCapabilityRows } from '@/app/[locale]/profile/components/api-config/provider-card/MediaCapabilityRows'
import type { CustomModel } from '@/app/[locale]/profile/components/api-config/types'

const labels: Record<string, string> = {
  mediaCapabilityTextToImage: 'Text to image',
  mediaCapabilityImageToImage: 'Image to image',
  mediaCapabilityImageEdit: 'Image edit',
  mediaCapabilityTextToVideo: 'Text to video',
  mediaCapabilityImageToVideo: 'Image to video',
  mediaCapabilityFirstLastFrameVideo: 'First and last frame',
  mediaCapabilityStatusPassed: 'Passed',
  mediaCapabilityStatusUnchecked: 'Unchecked',
  mediaCapabilityStatusFailed: 'Failed',
  mediaCapabilityStatusUnavailable: 'Unavailable',
  mediaCapabilityRunTest: 'Test',
  mediaCapabilityTesting: 'Testing...',
  mediaContractUnverified: 'Contract not verified',
}

function t(key: string) {
  return labels[key] || key
}

function baseModel(overrides: Partial<CustomModel>): CustomModel {
  return {
    modelId: 'relay-video',
    modelKey: 'engine::relay-video',
    name: 'Relay Video',
    type: 'video',
    provider: 'engine',
    price: 0,
    enabled: true,
    ...overrides,
  }
}

function collectButtons(node: ReactNode): Array<ReactElement<Record<string, unknown>>> {
  if (!node || typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    return []
  }
  if (Array.isArray(node)) {
    return node.flatMap(collectButtons)
  }
  const element = node as ReactElement<{ children?: ReactNode }>
  const own = element.type === 'button' ? [element] : []
  return (own as Array<ReactElement<Record<string, unknown>>>).concat(collectButtons(element.props?.children))
}

describe('MediaCapabilityRows', () => {
  it('renders media capability rows and calls run test for unchecked capabilities', () => {
    const onRunTest = vi.fn()
    const element = MediaCapabilityRows({
      model: baseModel({
        mediaContract: {
          version: 1,
          mediaType: 'video',
          executor: 'openai-compat-template',
          capabilities: ['image-to-video', 'text-to-video'],
          input: { image: 'publicUrl' },
          output: { kind: 'asyncTask', urlPath: '$.video.url' },
          testStatus: {
            imageToVideo: 'unchecked',
            textToVideo: 'passed',
          },
        },
      }),
      onRunTest,
      t,
    })

    const html = renderToStaticMarkup(element)
    expect(html).toContain('Image to video')
    expect(html).toContain('Unchecked')
    expect(html).toContain('Text to video')
    expect(html).toContain('Passed')
    expect(html).toContain('Test')

    const [button] = collectButtons(element)
    const onClick = button?.props.onClick
    if (typeof onClick === 'function') onClick()

    expect(onRunTest).toHaveBeenCalledWith('engine::relay-video', 'image-to-video')
  })

  it('shows a compact unverified warning when media model has no contract', () => {
    const html = renderToStaticMarkup(
      <MediaCapabilityRows
        model={baseModel({ mediaContract: undefined })}
        onRunTest={vi.fn()}
        t={t}
      />,
    )

    expect(html).toContain('Contract not verified')
  })

  it('disables all test buttons while any capability is pending for the model', () => {
    const element = MediaCapabilityRows({
      model: baseModel({
        mediaContract: {
          version: 1,
          mediaType: 'video',
          executor: 'openai-compat-template',
          capabilities: ['image-to-video', 'text-to-video'],
          input: { image: 'publicUrl' },
          output: { kind: 'asyncTask', urlPath: '$.video.url' },
          testStatus: {
            imageToVideo: 'unchecked',
            textToVideo: 'failed',
          },
        },
      }),
      onRunTest: vi.fn(),
      pendingCapability: 'image-to-video',
      t,
    })

    const buttons = collectButtons(element)

    expect(buttons).toHaveLength(2)
    expect(buttons.every((button) => button.props.disabled === true)).toBe(true)
  })

  it('renders nothing for text models', () => {
    const html = renderToStaticMarkup(
      <MediaCapabilityRows
        model={baseModel({ type: 'llm' })}
        onRunTest={vi.fn()}
        t={t}
      />,
    )

    expect(html).toBe('')
  })
})
