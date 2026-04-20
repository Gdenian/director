import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import ProjectStyleAssetSelector from '@/components/selectors/ProjectStyleAssetSelector'

const useAssetsMock = vi.fn()
const selectorTexts = {
  assetMode: '风格资产',
  compatibilityMode: '兼容结果',
  formatCompatibilityMode: (label: string) => `兼容结果：${label}`,
  clearSelection: '不使用风格资产',
  currentAsset: '当前风格资产',
  loading: '加载风格资产中...',
}

vi.mock('@/lib/query/hooks', () => ({
  useAssets: (...args: unknown[]) => useAssetsMock(...args),
}))

describe('ProjectStyleAssetSelector', () => {
  it('renders the resolved legacy style label and available style assets', () => {
    Reflect.set(globalThis, 'React', React)
    useAssetsMock.mockReturnValue({
      data: [
        {
          id: 'style-1',
          kind: 'style',
          name: '港风夜色',
        },
        {
          id: 'style-2',
          kind: 'style',
          name: '胶片青春',
        },
      ],
      isLoading: false,
    })

    const html = renderToStaticMarkup(
      createElement(ProjectStyleAssetSelector, {
        value: null,
        resolvedStyle: {
          styleAssetId: null,
          label: '写实电影感',
          source: 'project-art-style',
          assetSource: null,
          previewMedia: null,
        },
        texts: selectorTexts,
        onChange: () => undefined,
      }),
    )

    expect(useAssetsMock).toHaveBeenCalledWith({ scope: 'global', kind: 'style' })
    expect(html).toContain('兼容结果')
    expect(html).toContain('写实电影感')
    expect(html).toContain('港风夜色')
    expect(html).toContain('胶片青春')
  })

  it('keeps the current selected style asset visible even if it is absent from the fetched list', () => {
    Reflect.set(globalThis, 'React', React)
    useAssetsMock.mockReturnValue({
      data: [
        {
          id: 'style-2',
          kind: 'style',
          name: '胶片青春',
        },
      ],
      isLoading: false,
    })

    const html = renderToStaticMarkup(
      createElement(ProjectStyleAssetSelector, {
        value: 'style-1',
        resolvedStyle: {
          styleAssetId: 'style-1',
          label: '当前风格资产',
          source: 'style-asset',
          assetSource: 'user',
          previewMedia: null,
        },
        texts: selectorTexts,
        onChange: () => undefined,
      }),
    )

    expect(html).toContain('风格资产')
    expect(html).toContain('当前风格资产')
    expect(html).toContain('胶片青春')
    expect(html).toContain('不使用风格资产')
  })
})
