import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SettingsModal } from '@/components/ui/config-modals/ConfigEditModal'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/shared/assets/StyleAssetSelect', () => ({
  default: ({
    value,
    label,
  }: {
    value: string
    label?: string
  }) => createElement(
    'select',
    {
      'aria-label': label,
      'data-style-asset-select': value,
    },
    createElement('option', null, '电影写实'),
  ),
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name, ...props }: { name: string } & Record<string, unknown>) =>
    createElement('span', { ...props, 'data-icon': name }),
}))

describe('SettingsModal style asset selection', () => {
  it('uses the project style asset selector and shows stale snapshot guidance', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderToStaticMarkup(
      createElement(SettingsModal, {
        isOpen: true,
        onClose: () => undefined,
        styleAssetId: 'style-1',
        styleSnapshotName: '电影写实',
        styleSnapshotStaleMessage: '该风格已有更新，可重新选择刷新状态',
        onStyleAssetChange: () => undefined,
      }),
    )

    expect(html).toContain('data-style-asset-select="style-1"')
    expect(html).toContain('visualStyle')
    expect(html).toContain('电影写实')
    expect(html).toContain('该风格已有更新，可重新选择刷新状态')
    expect(html).not.toContain('american-comic')
  })
})
