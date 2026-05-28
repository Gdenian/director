import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import StoryInputComposer from '@/components/story-input/StoryInputComposer'

vi.mock('@/components/selectors/RatioStyleSelectors', () => ({
  RatioSelector: (props: Record<string, unknown> & { getUsage?: unknown }) => {
    const { getUsage, ...rest } = props
    void getUsage
    return createElement('div', rest, 'RatioSelector')
  },
  StylePresetSelector: (props: Record<string, unknown>) => createElement('div', props, 'StylePresetSelector'),
}))

describe('StoryInputComposer', () => {
  it('renders a shared composer shell with configurable textarea rows and injected style asset control', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderToStaticMarkup(
      createElement(StoryInputComposer, {
        value: '测试内容',
        onValueChange: () => undefined,
        placeholder: '请输入内容',
        minRows: 8,
        videoRatio: '9:16',
        onVideoRatioChange: () => undefined,
        ratioOptions: [{ value: '9:16', label: '9:16' }],
        styleControl: createElement('select', null, createElement('option', null, '电影写实')),
        stylePresetValue: 'horror-suspense',
        onStylePresetChange: () => undefined,
        stylePresetOptions: [{ value: 'horror-suspense', label: '恐怖悬疑', description: '压迫氛围' }],
        topRight: createElement('span', null, '字数：4'),
        footer: createElement('p', null, '当前配置'),
        secondaryActions: createElement('button', { type: 'button' }, 'AI 帮我写'),
        primaryAction: createElement('button', { type: 'button' }, '开始创作'),
      }),
    )

    expect(html).toContain('rows="8"')
    expect(html).toContain('RatioSelector')
    expect(html).toContain('电影写实')
    expect(html).not.toContain('StyleSelector')
    expect(html).toContain('StylePresetSelector')
    expect(html).toContain('字数：4')
    expect(html).toContain('当前配置')
    expect(html).toContain('AI 帮我写')
    expect(html).toContain('开始创作')
  })

  it('hides the style preset selector when no preset is enabled', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderToStaticMarkup(
      createElement(StoryInputComposer, {
        value: '测试内容',
        onValueChange: () => undefined,
        placeholder: '请输入内容',
        minRows: 8,
        videoRatio: '9:16',
        onVideoRatioChange: () => undefined,
        ratioOptions: [{ value: '9:16', label: '9:16' }],
        styleControl: createElement('select', null, createElement('option', null, '电影写实')),
        stylePresetValue: '',
        onStylePresetChange: () => undefined,
        stylePresetOptions: [],
        primaryAction: createElement('button', { type: 'button' }, '开始创作'),
      }),
    )

    expect(html).toContain('RatioSelector')
    expect(html).toContain('电影写实')
    expect(html).not.toContain('StyleSelector')
    expect(html).not.toContain('StylePresetSelector')
  })
})
