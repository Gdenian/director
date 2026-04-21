import * as React from 'react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import { StyleCard } from '@/app/[locale]/workspace/asset-hub/components/StyleCard'

const messages = {
  assetHub: {
    styleSourceSystem: '系统',
    styleSourceUser: '用户',
    styleReadOnly: '只读',
    view: '查看',
    edit: '编辑',
    delete: '删除',
  },
} as const

const renderWithIntl = (node: ReactElement) => {
  const providerProps: ComponentProps<typeof NextIntlClientProvider> = {
    locale: 'zh',
    messages: messages as unknown as AbstractIntlMessages,
    timeZone: 'Asia/Shanghai',
    children: node,
  }

  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, providerProps),
  )
}

describe('StyleCard', () => {
  it('系统风格只暴露查看，用户风格暴露编辑和删除', () => {
    Reflect.set(globalThis, 'React', React)

    const systemHtml = renderWithIntl(
      createElement(StyleCard, {
        asset: {
          id: 'style-system-1',
          scope: 'global',
          kind: 'style',
          family: 'visual',
          name: '系统风格',
          folderId: null,
          capabilities: {
            canGenerate: false,
            canSelectRender: false,
            canRevertRender: false,
            canModifyRender: false,
            canUploadRender: false,
            canBindVoice: false,
            canCopyFromGlobal: false,
          },
          taskRefs: [],
          taskState: { isRunning: false, lastError: null },
          description: null,
          positivePrompt: 'system style prompt',
          negativePrompt: null,
          tags: [],
          source: 'system',
          legacyKey: 'american-comic',
          readOnly: true,
          previewMedia: null,
        },
        onView: () => undefined,
        onEdit: () => undefined,
        onDelete: () => undefined,
      }),
    )

    const userHtml = renderWithIntl(
      createElement(StyleCard, {
        asset: {
          id: 'style-user-1',
          scope: 'global',
          kind: 'style',
          family: 'visual',
          name: '用户风格',
          folderId: null,
          capabilities: {
            canGenerate: false,
            canSelectRender: false,
            canRevertRender: false,
            canModifyRender: false,
            canUploadRender: false,
            canBindVoice: false,
            canCopyFromGlobal: false,
          },
          taskRefs: [],
          taskState: { isRunning: false, lastError: null },
          description: null,
          positivePrompt: 'user style prompt',
          negativePrompt: null,
          tags: [],
          source: 'user',
          legacyKey: null,
          readOnly: false,
          previewMedia: null,
        },
        onView: () => undefined,
        onEdit: () => undefined,
        onDelete: () => undefined,
      }),
    )

    expect(systemHtml).toContain('查看')
    expect(systemHtml).not.toContain('编辑')
    expect(systemHtml).not.toContain('删除')
    expect(userHtml).toContain('查看')
    expect(userHtml).toContain('编辑')
    expect(userHtml).toContain('删除')
  })
})
