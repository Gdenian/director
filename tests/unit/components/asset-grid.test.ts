import * as React from 'react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import { AssetGrid } from '@/app/[locale]/workspace/asset-hub/components/AssetGrid'

const testState = vi.hoisted(() => ({
  forcedFilter: null as string | null,
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()

  return {
    ...actual,
    useState: <T,>(initialState: T | (() => T)) => {
      const resolvedInitialState = typeof initialState === 'function'
        ? (initialState as () => T)()
        : initialState

      if (resolvedInitialState === 'all' && testState.forcedFilter) {
        return actual.useState(testState.forcedFilter as T)
      }

      return actual.useState(resolvedInitialState)
    },
  }
})

vi.mock('@/app/[locale]/workspace/asset-hub/components/CharacterCard', () => ({
  CharacterCard: () => null,
}))

vi.mock('@/app/[locale]/workspace/asset-hub/components/LocationCard', () => ({
  LocationCard: () => null,
}))

vi.mock('@/app/[locale]/workspace/asset-hub/components/VoiceCard', () => ({
  VoiceCard: () => null,
}))

vi.mock('@/app/[locale]/workspace/asset-hub/components/StyleCard', () => ({
  StyleCard: (props: { style: { name: string } }) => createElement('div', null, `style-card:${props.style.name}`),
}))

vi.mock('@/components/task/TaskStatusInline', () => ({
  default: () => null,
}))

const messages = {
  assetHub: {
    allAssets: '所有资产',
    characters: '角色',
    locations: '场景',
    props: '道具',
    voices: '音色',
    styles: '风格',
    addAsset: '新建资产',
    addCharacter: '新建角色',
    addLocation: '新建场景',
    addProp: '新建道具',
    addVoice: '新建音色',
    addStyle: '新建风格',
    downloadAll: '打包下载',
    downloadAllTitle: '下载全部图片资产',
    downloading: '打包中...',
    emptyState: '暂无资产',
    emptyStateHint: '点击上方按钮添加角色或场景',
    filteredEmptyHint: '点击新建资产添加资产',
    pagination: {
      previous: '上一页',
      next: '下一页',
    },
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

describe('AssetGrid', () => {
  beforeEach(() => {
    testState.forcedFilter = null
  })

  it('空状态下使用与资产库一致的 compact 分段控件，并在中间显示新建资产按钮', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderWithIntl(
      createElement(AssetGrid, {
        assets: [],
        loading: false,
        onAddCharacter: () => undefined,
        onAddLocation: () => undefined,
        onAddProp: () => undefined,
        onAddVoice: () => undefined,
        onAddStyle: () => undefined,
        onDownloadAll: () => undefined,
        isDownloading: false,
        selectedFolderId: null,
      }),
    )

    expect(html).toContain('inline-block max-w-full min-w-max')
    expect(html).toContain('inline-grid grid-flow-col auto-cols-[minmax(96px,max-content)]')
    expect(html).toContain('justify-center')
    expect(html).toContain('>新建资产<')
    expect(html).toContain('风格')
  })

  it('当前筛选分类没有资产时显示添加提示文案', () => {
    Reflect.set(globalThis, 'React', React)
    testState.forcedFilter = 'location'

    const html = renderWithIntl(
      createElement(AssetGrid, {
        assets: [
          {
            id: 'character-1',
            kind: 'character',
            family: 'visual',
            scope: 'project',
            name: '角色A',
            folderId: null,
            capabilities: {
              canGenerate: true,
              canSelectRender: false,
              canRevertRender: false,
              canModifyRender: false,
              canUploadRender: false,
              canBindVoice: false,
              canCopyFromGlobal: false,
            },
            taskRefs: [],
            taskState: { isRunning: false, lastError: null },
            variants: [],
            introduction: null,
            profileData: null,
            profileConfirmed: null,
            profileTaskRefs: [],
            profileTaskState: { isRunning: false, lastError: null },
            voice: {
              voiceType: null,
              voiceId: null,
              customVoiceUrl: null,
              media: null,
            },
          },
        ],
        loading: false,
        onAddCharacter: () => undefined,
        onAddLocation: () => undefined,
        onAddProp: () => undefined,
        onAddVoice: () => undefined,
        onAddStyle: () => undefined,
        onDownloadAll: () => undefined,
        isDownloading: false,
        selectedFolderId: null,
      }),
    )

    expect(html).toContain('点击新建资产添加资产')
  })

  it('把全局风格作为第五类资产渲染到资产中心', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderWithIntl(
      createElement(AssetGrid, {
        assets: [
          {
            id: 'style-1',
            kind: 'style',
            family: 'visual',
            scope: 'global',
            name: '电影写实',
            folderId: null,
            capabilities: {
              canGenerate: false,
              canSelectRender: false,
              canRevertRender: false,
              canModifyRender: false,
              canUploadRender: true,
              canBindVoice: false,
              canCopyFromGlobal: false,
            },
            taskRefs: [],
            taskState: { isRunning: false, lastError: null },
            promptZh: '电影写实中文提示词',
            promptEn: 'cinematic realistic prompt',
            referenceImageUrl: 'https://example.com/ref.jpg',
            referenceMedia: null,
            previewImageUrl: 'https://example.com/preview.jpg',
            previewMedia: null,
            isDefault: true,
            isSystemSeed: false,
            createdAt: '2026-05-28T00:00:00.000Z',
            updatedAt: '2026-05-28T01:00:00.000Z',
          },
        ],
        loading: false,
        onAddCharacter: () => undefined,
        onAddLocation: () => undefined,
        onAddProp: () => undefined,
        onAddVoice: () => undefined,
        onAddStyle: () => undefined,
        onDownloadAll: () => undefined,
        isDownloading: false,
        selectedFolderId: null,
      }),
    )

    expect(html).toContain('style-card:电影写实')
    expect(html).toContain('风格')
  })
})
